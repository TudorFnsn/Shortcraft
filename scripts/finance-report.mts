/**
 * Finance report: MRR, net revenue vs metered API cost, cost per finished
 * video and gross margin, read from the Supabase project in `.env.local`.
 * READ-ONLY: it only runs `select`s (service role, so it sees every user).
 * Definitions live in `src/features/metrics/finance.ts`.
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

const { computeFinance, FINANCE_WINDOW_DAYS } = await import('@/features/metrics/finance');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

/** Every row of a select, paged (PostgREST caps a response at 1,000 rows). */
async function selectAll<T>(table: string, columns: string, since?: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = since ? base.gte('created_at', since) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const now = new Date();
const since = new Date(now.getTime() - FINANCE_WINDOW_DAYS * 86_400_000).toISOString();
type Row = Record<string, string | number>;
const [subs, jobs] = await Promise.all([
  selectAll<Row>('subscriptions', 'plan_id, status, created_at'),
  selectAll<Row>(
    'render_jobs',
    'status, model_tier, api_cost_usd, charged_credits, created_at',
    since,
  ),
]);

const report = computeFinance({
  now,
  subscriptions: subs.map((s) => ({
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
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(n < 1 ? 4 : 2)}`);
const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
console.log(`Shortcraft finance — as of ${report.asOf} (last ${report.windowDays} days)\n`);
console.log(`MRR (gross, EUR):          €${(report.mrrEurCents / 100).toFixed(2)}`);
console.log(`Net MRR (after VAT+fees):  ${usd(report.netMrrUsd)}`);
console.log(`Paying subscribers:        ${report.payingSubscribers}`);
console.log(`ARPU (net, per month):     ${usd(report.arpuUsd)}`);
console.log(`Jobs / finished:           ${report.jobs} / ${report.jobsDone}`);
console.log(`Metered API cost:          ${usd(report.meteredCostUsd)}`);
console.log(`Cost per finished video:   ${usd(report.costPerFinishedVideoUsd)}`);
console.log(`Burn per credit:           ${usd(report.burnUsdPerCredit)}`);
console.log(`Gross margin:              ${pct(report.grossMargin)}`);
console.log(`Net MRR ÷ cost:            ${report.revenueToCost ?? 'n/a'}x (target 3x)\n`);
console.table(report.subscribersByPlan);
console.table(report.byTier);
if (report.belowTarget) console.log('BELOW TARGET: net MRR is under 3x the metered API cost.');
