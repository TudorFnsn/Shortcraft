/**
 * Finance report for the CFO routine: MRR, API spend, realized unit economics
 * and the MRR coverage ratio, read from the Supabase project in `.env.local`.
 * READ-ONLY: it only runs `select`s (service role). Fixed costs come from
 * `docs/finance/costs.json` (owner-maintained; null = unknown).
 *
 * Run: npx tsx scripts/finance-report.mts           (tables)
 *      npx tsx scripts/finance-report.mts --json    (raw report, for the digest)
 *
 * Definitions
 *  - MRR: sum of plan prices of subscriptions in status active/trialing (EUR, VAT-inclusive list price).
 *  - Net MRR: MRR after VAT and Stripe fees (same assumptions as the margin gate), in USD.
 *  - Variable cost: sum of render_jobs.api_cost_usd over the trailing 30 days (list-price based, not invoiced).
 *  - MRR ratio: net MRR / (variable cost + known fixed costs). >= 3 is healthy, < 1 means we lose money.
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

const { PLANS } = await import('@/config/plans');
const { REVENUE_ASSUMPTIONS } = await import('@/features/billing/margin');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;
type Row = Record<string, string | number | null>;

async function selectAll(table: string, columns: string, since?: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = admin.from(table).select(columns);
    if (since) q = q.gte('created_at', since);
    const { data, error } = await q.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
const [jobs, subs, grants] = await Promise.all([
  selectAll('render_jobs', 'status, model_tier, target_duration_sec, actual_credits, api_cost_usd, created_at', since30),
  selectAll('subscriptions', 'plan_id, status'),
  selectAll('credit_transactions', 'delta, reason, created_at', since30),
]);

const a = REVENUE_ASSUMPTIONS;
const netUsd = (eurCents: number) =>
  Math.max(0, ((eurCents / 100 / (1 + a.vatRate)) * (1 - a.stripePercentFee) - a.stripeFixedFeeEur) * a.usdPerEur);

const live = subs.filter((s) => s.status === 'active' || s.status === 'trialing');
const byPlan: Record<string, number> = {};
let mrrEur = 0;
let netMrrUsd = 0;
for (const s of live) {
  const plan = PLANS[String(s.plan_id) as keyof typeof PLANS];
  if (!plan) continue;
  byPlan[plan.id] = (byPlan[plan.id] ?? 0) + 1;
  mrrEur += plan.priceCents / 100;
  netMrrUsd += netUsd(plan.priceCents);
}

const topUpRevenueCredits = grants.filter((g) => g.reason === 'topup').reduce((n, g) => n + Number(g.delta), 0);

const tiers: Record<string, { done: number; failed: number; costUsd: number; credits: number }> = {};
for (const j of jobs) {
  const t = (tiers[String(j.model_tier)] ??= { done: 0, failed: 0, costUsd: 0, credits: 0 });
  if (j.status === 'done') t.done++;
  if (j.status === 'failed') t.failed++;
  t.costUsd += Number(j.api_cost_usd);
  t.credits += Number(j.actual_credits);
}
const variableCostUsd = Object.values(tiers).reduce((n, t) => n + t.costUsd, 0);

const costsFile = resolve('docs/finance/costs.json');
const fixed: Record<string, number | null> = existsSync(costsFile)
  ? (JSON.parse(readFileSync(costsFile, 'utf8')).monthlyUsd ?? {})
  : {};
const knownFixed = Object.values(fixed).reduce<number>((n, v) => n + (typeof v === 'number' ? v : 0), 0);
const unknownFixed = Object.entries(fixed).filter(([, v]) => v === null).map(([k]) => k);
const totalCost = variableCostUsd + knownFixed;

const report = {
  asOf: new Date().toISOString(),
  payingSubscribers: live.length,
  subscribersByPlan: byPlan,
  mrrEur: Number(mrrEur.toFixed(2)),
  netMrrUsd: Number(netMrrUsd.toFixed(2)),
  topUpCredits30d: topUpRevenueCredits,
  variableApiCost30dUsd: Number(variableCostUsd.toFixed(2)),
  knownFixedCostUsd: knownFixed,
  unknownFixedCosts: unknownFixed,
  mrrRatio: totalCost > 0 ? Number((netMrrUsd / totalCost).toFixed(2)) : null,
  grossMarginPct: netMrrUsd > 0 ? Number((((netMrrUsd - variableCostUsd) / netMrrUsd) * 100).toFixed(1)) : null,
  perTier: Object.fromEntries(
    Object.entries(tiers).map(([k, t]) => [
      k,
      {
        done: t.done,
        failed: t.failed,
        costPerDoneVideoUsd: t.done ? Number((t.costUsd / t.done).toFixed(3)) : null,
        apiCostPer1kCreditsUsd: t.credits ? Number(((t.costUsd / t.credits) * 1000).toFixed(4)) : null,
        totalCostUsd: Number(t.costUsd.toFixed(2)),
      },
    ]),
  ),
  caveats: [
    'api_cost_usd uses catalog list prices, not provider invoices; calibrate against docs/finance/costs.json invoicedProviderSpend.',
    'Subscribers are counted at list price (no discounts/proration); sandbox Stripe data is not revenue.',
  ],
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
console.log(`Shortcraft finance — as of ${report.asOf}\n`);
console.log(`MRR: €${report.mrrEur} (net $${report.netMrrUsd}) · ${report.payingSubscribers} subscribers ${JSON.stringify(byPlan)}`);
console.log(`Variable API cost (30d): $${report.variableApiCost30dUsd} · known fixed: $${knownFixed}`);
console.log(`MRR ratio (net MRR / total cost): ${report.mrrRatio ?? 'n/a'} · gross margin: ${report.grossMarginPct ?? 'n/a'}%`);
if (unknownFixed.length) console.log(`Unknown fixed costs (ask owner): ${unknownFixed.join(', ')}`);
console.table(report.perTier);
