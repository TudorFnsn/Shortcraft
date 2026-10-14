/**
 * Finance report: MRR, real API cost per video by tier, and monthly profit vs
 * the fixed bills in docs/finance/costs.json. READ-ONLY (`select`s with the
 * service role from `.env.local`). MRR here is the database's view (live
 * subscriptions x catalog price); the Stripe connector is the source of truth
 * for money actually collected, so the routine cross-checks the two.
 *
 * Run: npx tsx scripts/finance-report.mts           (tables)
 *      npx tsx scripts/finance-report.mts --json    (raw report, for the routine)
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

const { computeMrr, computeProfit, computeTierEconomics } =
  await import('@/features/finance/unit-economics');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;
const WINDOW_DAYS = 30;
const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

async function selectAll<T>(table: string, columns: string, sinceCol?: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = sinceCol ? base.gte(sinceCol, since) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number | null>;
const [subs, jobs] = await Promise.all([
  selectAll<Row>('subscriptions', 'plan_id, status, created_at'),
  selectAll<Row>(
    'render_jobs',
    'status, model_tier, api_cost_usd, actual_credits, charged_credits, created_at',
    'created_at',
  ),
]);

const costs = JSON.parse(readFileSync(resolve('docs/finance/costs.json'), 'utf8')) as {
  fixed: { name: string; monthlyUsd: number | null }[];
};

const mrr = computeMrr(subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })));
const tiers = computeTierEconomics(
  jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    credits: Number(j.charged_credits || j.actual_credits || 0),
  })),
);
const apiCostUsd = jobs.reduce((a, j) => a + Number(j.api_cost_usd ?? 0), 0);
const profit = computeProfit({ netRevenueUsd: mrr.netUsd, apiCostUsd, fixedCosts: costs.fixed });

const report = { asOf: new Date().toISOString(), windowDays: WINDOW_DAYS, mrr, tiers, profit };
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
console.log(`Shortcraft finance — as of ${report.asOf} (API cost window: ${WINDOW_DAYS}d)\n`);
console.log(
  `MRR (DB view): €${(mrr.grossEurCents / 100).toFixed(2)} gross, ${usd(mrr.netUsd)} net`,
);
console.log(`Paying subscribers: ${JSON.stringify(mrr.subscribers)}\n`);
console.table(
  tiers.map((t) => ({
    tier: t.tier,
    finished: t.finished,
    failed: t.failed,
    apiCost: usd(t.apiCostUsd),
    wastedOnFailed: usd(t.wastedUsd),
    avgPerVideo: usd(t.avgCostPerVideoUsd),
    costPer1kCredits: usd(t.costPer1kCreditsUsd),
  })),
);
console.log(
  `Net revenue/mo ${usd(profit.netRevenueUsd)} - API ${usd(profit.apiCostUsd)} = gross ${usd(profit.grossProfitUsd)}`,
);
console.log(
  `Gross margin ${profit.grossMargin === null ? 'n/a' : `${(profit.grossMargin * 100).toFixed(1)}%`}; ` +
    `fixed ${usd(profit.fixedCostsUsd)}; net ${usd(profit.netProfitUsd)}; ` +
    `break-even net revenue ${usd(profit.breakEvenNetRevenueUsd)}`,
);
if (profit.unknownFixedCosts.length)
  console.log(
    `Owner has not reported: ${profit.unknownFixedCosts.join(', ')} (net profit is optimistic)`,
  );
