/**
 * Finance report: MRR, API cost per video by tier, gross margin, fixed costs
 * and break-even, read from the Supabase project in `.env.local`.
 * READ-ONLY: only `select`s (service role). Definitions: `features/metrics/finance.ts`.
 * Stripe's own MRR/churn/fees come from the Stripe connector, not this script.
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

const { computeFinance } = await import('@/features/metrics/finance');
const { FIXED_COSTS } = await import('@/config/fixed-costs');
const { TOPUP_PACKS } = await import('@/config/plans');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;
const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

async function selectAll(table: string, columns: string, filter?: (q: any) => any) {
  const rows: Record<string, any>[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const { data, error } = await (filter ? filter(base) : base)
      .order('created_at')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

const [jobs, subs, topups] = await Promise.all([
  selectAll(
    'render_jobs',
    'status, model_tier, target_duration_sec, api_cost_usd, actual_credits, created_at',
    (q) => q.gte('created_at', since),
  ),
  selectAll('subscriptions', 'user_id, plan_id, status, created_at'),
  // Top-up grants carry the pack's credits; map credits back to the pack price.
  selectAll('credit_transactions', 'delta, created_at', (q) =>
    q.eq('reason', 'topup').gte('created_at', since),
  ),
]);

const priceByCredits = new Map(TOPUP_PACKS.map((p) => [p.credits, p.priceCents]));
const topUpRevenueCents30d = topups.reduce(
  (a, t) => a + (priceByCredits.get(Number(t.delta)) ?? 0),
  0,
);

const report = computeFinance({
  now: new Date(),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    targetDurationSec: Number(j.target_duration_sec),
    apiCostUsd: Number(j.api_cost_usd),
    actualCredits: Number(j.actual_credits),
    createdAt: new Date(j.created_at),
  })),
  subscriptions: subs.map((s) => ({
    userId: String(s.user_id),
    planId: String(s.plan_id),
    status: String(s.status),
  })),
  topUpRevenueCents30d,
  fixedCosts: FIXED_COSTS,
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number) => `$${n.toFixed(2)}`;
console.log(`Shortcraft finance — as of ${report.asOf} (last 30 days)\n`);
console.log(
  `★ MRR (net of VAT + fees): ${usd(report.mrrNetUsd)}  (gross €${report.mrrGrossEur}, ARR ${usd(report.arrNetUsd)})`,
);
console.log(
  `  Paying subscribers:      ${report.payingSubscribers} ${JSON.stringify(report.byPlan)}`,
);
console.log(`  Top-ups (net, 30d):      ${usd(report.topUpNetUsd30d)}`);
console.log(`  API cost, finished:      ${usd(report.apiCostDoneUsd30d)}`);
console.log(
  `  API cost, failed jobs:   ${usd(report.apiCostFailedUsd30d)}  (spent, refunded to users)`,
);
console.log(
  `  Gross margin:            ${report.grossMargin === null ? 'n/a' : `${(report.grossMargin * 100).toFixed(1)}%`}`,
);
console.log(
  `  Fixed costs / month:     ${usd(report.fixedCostsUsd)}${report.fixedCostsUnconfirmed.length ? `  (UNCONFIRMED: ${report.fixedCostsUnconfirmed.join(', ')})` : ''}`,
);
console.log(`  Monthly profit:          ${usd(report.monthlyProfitUsd)}`);
console.log(`  Break-even subscribers:  ${report.breakEvenSubscribers ?? 'n/a'}\n`);
console.table(report.byTier);
