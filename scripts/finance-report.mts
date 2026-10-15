/**
 * Finance report: MRR, API cost per finished video, cash leaking into failed
 * jobs and free users, and the MRR ratios, read from the Supabase project in
 * `.env.local`. READ-ONLY: it only runs `select`s (service role).
 * Definitions live in `src/features/finance/unit-economics.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts           (table)
 *      npx tsx scripts/finance-report.mts --json    (raw report, for the digest)
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = resolve('.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const { computeFinance, pct } = await import('@/features/finance/unit-economics');
const { FIXED_COSTS } = await import('@/config/fixed-costs');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

async function selectAll<T>(
  table: string,
  columns: string,
  where?: { column: string; eq: string },
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = where ? base.eq(where.column, where.eq) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number>;
const [subs, jobs, topups] = await Promise.all([
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll<Row>(
    'render_jobs',
    'user_id, status, model_tier, api_cost_usd, actual_credits, created_at',
  ),
  selectAll<Row>('credit_transactions', 'delta, created_at', { column: 'reason', eq: 'topup' }),
]);

const report = computeFinance({
  now: new Date(),
  subscriptions: subs.map((s) => ({
    userId: String(s.user_id),
    planId: String(s.plan_id),
    status: String(s.status),
  })),
  jobs: jobs.map((j) => ({
    userId: String(j.user_id),
    status: String(j.status),
    modelTier: String(j.model_tier),
    apiCostUsd: Number(j.api_cost_usd),
    actualCredits: Number(j.actual_credits),
    createdAt: new Date(String(j.created_at)),
  })),
  topups: topups.map((t) => ({
    credits: Number(t.delta),
    createdAt: new Date(String(t.created_at)),
  })),
  fixedCosts: FIXED_COSTS,
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
console.log(`Shortcraft finance — last ${report.windowDays} days, as of ${report.asOf}\n`);
console.log(
  `MRR (gross, EUR):          €${report.mrrGrossEur}  (${report.payingSubscribers} subscribers, ${report.pastDueSubscribers} past due)`,
);
console.log(
  `MRR (net of VAT+fees):     ${usd(report.mrrNetUsd)}   top-ups: ${usd(report.topupNetUsd)}   ARPU: ${usd(report.arpuNetUsd)}`,
);
console.log(
  `API cost:                  ${usd(report.apiCostUsd)}  (done ${usd(report.apiCostDoneUsd)}, failed ${usd(report.apiCostFailedUsd)}, free users ${usd(report.apiCostFreeUsersUsd)})`,
);
console.log(
  `Videos done / failed:      ${report.videosDone} / ${report.videosFailed}   avg API cost per video: ${usd(report.avgApiCostPerVideoUsd)}`,
);
console.log(
  `★ API cost ÷ revenue:      ${pct(report.apiCostToRevenue)}   (revenue multiple ${report.revenueMultiple ?? 'n/a'}x, gate wants >= 3x)`,
);
console.log(
  `Fixed costs (known):       ${usd(report.fixedCostKnownUsd)}  = ${pct(report.fixedCostToRevenue)} of revenue; UNKNOWN lines: ${report.fixedCostUnknown.join(', ') || 'none'}`,
);
console.log(
  `Contribution / profit:     ${usd(report.contributionUsd)} / ${usd(report.profitUsd)}   break-even subscribers: ${report.breakEvenSubscribers ?? 'n/a'}\n`,
);
console.table(report.byTier);
