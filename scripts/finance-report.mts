/**
 * Finance report: MRR, spend per finished video, margin and break-even, read
 * from the Supabase project in `.env.local`. READ-ONLY (`select`s, service
 * role). Math lives in `src/features/finance/unit-economics.ts`; fixed costs
 * are owner-supplied in `src/config/fixed-costs.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts           (table)
 *      npx tsx scripts/finance-report.mts --json    (raw report, for the digest)
 *      npx tsx scripts/finance-report.mts --days=7  (cost window, default 30)
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

const { computeFinance } = await import('@/features/finance/unit-economics');
const { REVENUE_ASSUMPTIONS } = await import('@/features/billing/margin');
const { PLANS } = await import('@/config/plans');
const { FIXED_COSTS } = await import('@/config/fixed-costs');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

async function selectAll<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .order('created_at')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number | null>;
const [subs, jobs] = await Promise.all([
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll<Row>('render_jobs', 'user_id, status, model_tier, api_cost_usd, created_at'),
]);

const daysArg = process.argv.find((a) => a.startsWith('--days='));
const report = computeFinance({
  now: new Date(),
  windowDays: daysArg ? Number(daysArg.slice(7)) || 30 : 30,
  planPriceCents: Object.fromEntries(Object.values(PLANS).map((p) => [p.id, p.priceCents])),
  assumptions: REVENUE_ASSUMPTIONS,
  fixedCosts: FIXED_COSTS,
  subscriptions: subs.map((s) => ({
    userId: String(s.user_id ?? ''),
    planId: String(s.plan_id ?? ''),
    status: String(s.status ?? ''),
  })),
  jobs: jobs.map((j) => ({
    userId: String(j.user_id ?? ''),
    status: String(j.status ?? ''),
    modelTier: String(j.model_tier ?? 'standard'),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    createdAt: new Date(String(j.created_at ?? 0)),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
console.log(`Shortcraft finance — as of ${report.asOf} (cost window ${report.windowDays}d)\n`);
console.log(
  `★ MRR (list price):        €${report.mrrEur}  (${report.payingSubscribers} subscribers, ARPU €${report.arpuEur ?? 'n/a'})`,
);
console.log(
  `  Net revenue / month:     ${usd(report.netRevenueMonthlyUsd)} after VAT + Stripe fees`,
);
console.log(
  `  Variable cost / month:   ${usd(report.variableCostMonthlyUsd)} (${report.jobs} jobs, ${report.doneVideos} done, ${report.failedJobs} failed)`,
);
console.log(`  Cost per finished video: ${usd(report.costPerDoneVideoUsd)}`);
console.log(
  `  Fixed cost / month:      ${usd(report.fixedCostMonthlyUsd)}${report.fixedCostGaps.length ? `  — MISSING: ${report.fixedCostGaps.join('; ')}` : ''}`,
);
console.log(
  `  Profit / month:          ${usd(report.profitMonthlyUsd)}  (gross margin ${report.grossMargin === null ? 'n/a' : `${(report.grossMargin * 100).toFixed(0)}%`})`,
);
console.log(`  Break-even subscribers:  ${report.breakEvenSubscribers ?? 'n/a'}\n`);
console.table(report.byPlan);
console.table(report.byTier);
