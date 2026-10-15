/**
 * Finance report: MRR, API spend vs credits charged, gross margin per tier and
 * per plan, and the cash-in / cash-out picture the CFO routine reads.
 * READ-ONLY: only `select`s (service role from `.env.local`).
 *
 * Run: npx tsx scripts/finance-report.mts           (table)
 *      npx tsx scripts/finance-report.mts --json    (raw, for the digest)
 *
 * Revenue here is the plan list price of every `active`/`trialing` subscription
 * (MRR) and the top-ups granted in the window; Stripe is the source of truth for
 * cash, so the routine cross-checks against Stripe (balance, charges, refunds,
 * disputes) when the connector is available.
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

const { PLANS, TOPUP_PACKS } = await import('@/config/plans');
const { REVENUE_ASSUMPTIONS } = await import('@/features/billing/margin');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;
const WINDOW_DAYS = Number(process.argv.find((a) => a.startsWith('--days='))?.slice(7) ?? 30);
const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

type Row = Record<string, string | number | null>;
async function selectAll(table: string, columns: string, sinceCol?: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = admin.from(table).select(columns);
    if (sinceCol) q = q.gte(sinceCol, since);
    const { data, error } = await q.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const eurToNetUsd = (cents: number) => {
  const a = REVENUE_ASSUMPTIONS;
  const gross = cents / 100;
  const net = (gross / (1 + a.vatRate)) * (1 - a.stripePercentFee) - a.stripeFixedFeeEur;
  return net * a.usdPerEur;
};

const [subs, jobs, grants] = await Promise.all([
  selectAll('subscriptions', 'plan_id, status, created_at'),
  selectAll('render_jobs', 'status, model_tier, actual_credits, api_cost_usd, created_at', 'created_at'),
  selectAll('credit_transactions', 'delta, reason, created_at', 'created_at'),
]);

// MRR from live subscriptions.
const live = subs.filter((s) => s.status === 'active' || s.status === 'trialing');
const byPlan: Record<string, number> = {};
for (const s of live) byPlan[String(s.plan_id)] = (byPlan[String(s.plan_id)] ?? 0) + 1;
let mrrEur = 0;
let mrrNetUsd = 0;
for (const [id, n] of Object.entries(byPlan)) {
  const plan = PLANS[id as keyof typeof PLANS];
  if (!plan) continue;
  mrrEur += (plan.priceCents / 100) * n;
  mrrNetUsd += eurToNetUsd(plan.priceCents) * n;
}

// API spend vs credits charged, per tier, finished jobs only.
const tiers: Record<string, { jobs: number; credits: number; costUsd: number }> = {};
let failedCostUsd = 0;
for (const j of jobs) {
  const t = String(j.model_tier);
  if (j.status === 'failed') failedCostUsd += Number(j.api_cost_usd);
  if (j.status !== 'done') continue;
  const e = (tiers[t] ??= { jobs: 0, credits: 0, costUsd: 0 });
  e.jobs += 1;
  e.credits += Number(j.actual_credits);
  e.costUsd += Number(j.api_cost_usd);
}

const topupGrants = grants.filter((g) => g.reason === 'topup');
const topupCredits = topupGrants.reduce((n, g) => n + Number(g.delta), 0);
const totalCostUsd = jobs.reduce((n, j) => n + Number(j.api_cost_usd), 0);

const report = {
  asOf: new Date().toISOString(),
  windowDays: WINDOW_DAYS,
  payingSubscribers: live.length,
  subscribersByPlan: byPlan,
  mrrEur: Number(mrrEur.toFixed(2)),
  mrrNetUsd: Number(mrrNetUsd.toFixed(2)),
  arrEur: Number((mrrEur * 12).toFixed(2)),
  arpuEur: live.length ? Number((mrrEur / live.length).toFixed(2)) : null,
  topupPurchases: topupGrants.length,
  topupCredits,
  topupPacks: TOPUP_PACKS.length,
  apiCostUsdWindow: Number(totalCostUsd.toFixed(2)),
  apiCostUsdOnFailedJobs: Number(failedCostUsd.toFixed(2)),
  costPerFinishedVideoUsd: Object.fromEntries(
    Object.entries(tiers).map(([t, e]) => [t, e.jobs ? Number((e.costUsd / e.jobs).toFixed(4)) : null]),
  ),
  creditsPerUsdOfCostByTier: Object.fromEntries(
    Object.entries(tiers).map(([t, e]) => [t, e.costUsd ? Math.round(e.credits / e.costUsd) : null]),
  ),
  tiers,
  // Net MRR over a month of API cost: a rough but honest monthly gross margin.
  grossMarginMultiple: totalCostUsd > 0 ? Number((mrrNetUsd / totalCostUsd).toFixed(2)) : null,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
console.log(`Shortcraft finance — as of ${report.asOf} (window ${WINDOW_DAYS}d)\n`);
console.log(`MRR: €${report.mrrEur}  (net ≈ $${report.mrrNetUsd})   ARR: €${report.arrEur}   ARPU: ${report.arpuEur ?? 'n/a'}`);
console.log(`Paying subscribers: ${report.payingSubscribers}  ${JSON.stringify(byPlan)}`);
console.log(`Top-ups: ${report.topupPurchases} purchases, ${topupCredits} credits`);
console.log(`API cost (window): $${report.apiCostUsdWindow}  (on failed jobs: $${report.apiCostUsdOnFailedJobs})`);
console.log(`Net MRR / API cost: ${report.grossMarginMultiple ?? 'n/a'}x   (gate target 3x)\n`);
console.table(tiers);
