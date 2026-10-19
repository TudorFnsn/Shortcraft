/**
 * Finance report: MRR, cost per finished video, gross margin, break-even, read
 * from the Supabase project in `.env.local`. READ-ONLY: only `select`s (service
 * role). Definitions live in `src/features/finance/unit-economics.ts`; fixed
 * costs and cash come from `src/config/finance.ts`.
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

const { computeFinance } = await import('@/features/finance/unit-economics');
const { FIXED_COSTS, CASH_ON_HAND_USD } = await import('@/config/finance');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

async function selectAll(table: string, columns: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .order('created_at')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as unknown as Record<string, unknown>[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const [subs, jobs] = await Promise.all([
  selectAll('subscriptions', 'plan_id, status, created_at'),
  selectAll('render_jobs', 'status, model_tier, api_cost_usd, actual_credits, created_at'),
]);

const known = FIXED_COSTS.filter((c) => c.usdPerMonth !== null);
const report = computeFinance({
  now: new Date(),
  subscriptions: subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    apiCostUsd: Number(j.api_cost_usd),
    actualCredits: Number(j.actual_credits),
    createdAt: new Date(String(j.created_at)),
  })),
  // Only a complete list is a total; a partial sum would flatter the profit.
  fixedCostsUsdPerMonth:
    known.length === FIXED_COSTS.length
      ? known.reduce((s, c) => s + (c.usdPerMonth ?? 0), 0)
      : null,
  cashOnHandUsd: CASH_ON_HAND_USD,
});

if (process.argv.includes('--json')) {
  console.log(
    JSON.stringify(
      {
        ...report,
        unknownFixedCosts: FIXED_COSTS.filter((c) => c.usdPerMonth === null).map((c) => c.vendor),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const fmt = (n: number | null, pre = '', suf = '') => (n === null ? 'unknown' : `${pre}${n}${suf}`);
console.log(`Shortcraft finance — as of ${report.asOf}\n`);
console.log(
  `★ MRR:                       ${fmt(report.mrrEur, '€')} (net ${fmt(report.netMrrUsd, '$')})`,
);
console.log(
  `  Paying subscribers:        ${report.payingSubscribers}  ${JSON.stringify(report.subscribersByPlan)}`,
);
console.log(`  ARPU:                      ${fmt(report.arpuEur, '€')}`);
console.log(
  `  API spend, last 30d:       ${fmt(report.variableCost30dUsd, '$')}  (wasted on failed: ${fmt(report.wastedOnFailed30dUsd, '$')})`,
);
console.log(`  Videos finished, 30d:      ${report.doneVideos30d}`);
console.log(`  Cost per finished video:   ${fmt(report.avgCostPerDoneVideoUsd, '$')}`);
console.log(
  `  Gross margin:              ${fmt(report.grossMargin === null ? null : Math.round(report.grossMargin * 1000) / 10, '', '%')}`,
);
console.log(
  `  Realized revenue/cost:     ${fmt(report.realizedMultiple, '', 'x')}  (gate target 3x)`,
);
console.log(
  `  Credit use (breakage):     ${fmt(report.creditUse === null ? null : Math.round(report.creditUse * 1000) / 10, '', '%')}`,
);
console.log(`  Fixed costs / month:       ${fmt(report.fixedCostsUsdPerMonth, '$')}`);
console.log(`  Profit / month:            ${fmt(report.monthlyProfitUsd, '$')}`);
console.log(`  Break-even subscribers:    ${fmt(report.breakEvenSubscribers)}`);
console.log(`  Runway (months):           ${fmt(report.runwayMonths)}\n`);
console.table(report.byTier);
const missing = FIXED_COSTS.filter((c) => c.usdPerMonth === null).map((c) => c.vendor);
if (missing.length)
  console.log(`\nOwner input needed (src/config/finance.ts): ${missing.join(', ')}`);
