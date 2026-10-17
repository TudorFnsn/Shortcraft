/**
 * Finance report: MRR, ARPU, what a finished video really costs us and the
 * realised margin, read from the Supabase project in `.env.local`.
 * READ-ONLY: it only runs `select`s (service role, so it sees every user).
 * Definitions live in `src/features/finance/unit-economics.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts           (table)
 *      npx tsx scripts/finance-report.mts --json    (raw report, for the digest)
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env.local into process.env BEFORE importing app modules (env validates on import).
const envFile = resolve('.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const { computeFinance, WINDOW_DAYS, DAY_MS } = await import('@/features/finance/unit-economics');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

interface Where {
  eq?: [column: string, value: string];
  gte?: [column: string, value: string];
}

/** Every row of a select, paged (PostgREST caps a response at 1,000 rows). */
async function selectAll<T>(table: string, columns: string, where: Where = {}): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = admin.from(table).select(columns);
    if (where.eq) q = q.eq(...where.eq);
    if (where.gte) q = q.gte(...where.gte);
    const { data, error } = await q.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number | null>;
const now = new Date();
const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS).toISOString();

const [subs, jobs, topups] = await Promise.all([
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll<Row>('render_jobs', 'status, model_tier, created_at, api_cost_usd, charged_credits', {
    gte: ['created_at', since],
  }),
  selectAll<Row>('credit_transactions', 'delta, created_at', {
    eq: ['reason', 'topup'],
    gte: ['created_at', since],
  }),
]);

const report = computeFinance({
  now,
  subscriptions: subs.map((s) => ({
    userId: String(s.user_id ?? ''),
    planId: String(s.plan_id ?? ''),
    status: String(s.status ?? ''),
  })),
  jobs: jobs.map((j) => ({
    status: String(j.status ?? ''),
    modelTier: String(j.model_tier ?? 'standard'),
    createdAt: new Date(String(j.created_at ?? 0)),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    chargedCredits: Number(j.charged_credits ?? 0),
  })),
  topUps: topups.map((t) => ({
    credits: Number(t.delta ?? 0),
    createdAt: new Date(String(t.created_at ?? 0)),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(4)}`);

console.log(`Shortcraft finance — as of ${report.asOf} (trailing ${report.windowDays} days)\n`);
console.log(
  `MRR (gross):             €${report.mrrEur.toFixed(2)}  (${report.payingSubscribers} paying)`,
);
console.log(`Net MRR (after VAT+fees): $${report.netMrrUsd.toFixed(2)}`);
console.log(`ARPU:                    ${report.arpuEur === null ? 'n/a' : `€${report.arpuEur}`}`);
console.log(`Top-ups in window:       ${report.topUpsInWindow} (€${report.topUpRevenueEur})`);
console.log(
  `Jobs / finished / failed: ${report.jobsInWindow} / ${report.finishedInWindow} / ${report.failedInWindow}`,
);
console.log(`API cost (window):       $${report.apiCostUsd.toFixed(2)}`);
console.log(`Cost per finished video: ${usd(report.costPerFinishedUsd)}`);
console.log(`Cost per 1k credits:     ${usd(report.costPer1kCreditsUsd)}`);
console.log(`Burn ratio (cost/net MRR): ${pct(report.burnRatio)}   (gate floor: <= 33%)`);
console.log(`Realised margin:         ${pct(report.realisedMargin)}\n`);
console.table(report.byTier);
console.table(report.subscribersByPlan);
