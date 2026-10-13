/**
 * Finance report: MRR (from active subscriptions x plan price), API cost per
 * finished video and per tier, and gross margin over the last 30 days, read
 * from the Supabase project in `.env.local`. READ-ONLY: it only runs `select`s.
 *
 * MRR here is an estimate (monthly plan price, VAT-inclusive, no yearly
 * discounts); Stripe is the source of truth. `api_cost_usd` is the orchestrator's
 * catalog-based estimate per job, not a provider invoice: reconcile against the
 * fal.ai / ElevenLabs / Anthropic billing pages.
 *
 * Run: npx tsx scripts/finance-report.mts           (table)
 *      npx tsx scripts/finance-report.mts --json    (raw, for the digest)
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
    const base = admin.from(table).select(columns);
    const filtered = since ? base.gte('created_at', since) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
const [subs, jobs] = await Promise.all([
  selectAll('subscriptions', 'plan_id, status, created_at'),
  selectAll('render_jobs', 'status, api_cost_usd, created_at', since),
]);

const { vatRate, stripePercentFee, stripeFixedFeeEur, usdPerEur } = REVENUE_ASSUMPTIONS;
let mrrEur = 0;
let netMrrUsd = 0;
const byPlan: Record<string, number> = {};
for (const s of subs) {
  if (s.status !== 'active' && s.status !== 'trialing') continue;
  const plan = PLANS[s.plan_id as keyof typeof PLANS];
  if (!plan) continue;
  byPlan[plan.id] = (byPlan[plan.id] ?? 0) + 1;
  const gross = plan.priceCents / 100;
  mrrEur += gross;
  netMrrUsd += ((gross / (1 + vatRate)) * (1 - stripePercentFee) - stripeFixedFeeEur) * usdPerEur;
}

const done = jobs.filter((j) => j.status === 'done');
const costUsd = jobs.reduce((n, j) => n + Number(j.api_cost_usd ?? 0), 0);
const doneCostUsd = done.reduce((n, j) => n + Number(j.api_cost_usd ?? 0), 0);

const report = {
  asOf: new Date().toISOString(),
  activeSubscribersByPlan: byPlan,
  mrrEurGross: Number(mrrEur.toFixed(2)),
  mrrUsdNet: Number(netMrrUsd.toFixed(2)),
  last30d: {
    jobs: jobs.length,
    videosDone: done.length,
    apiCostUsd: Number(costUsd.toFixed(2)),
    avgCostPerVideoUsd: done.length ? Number((doneCostUsd / done.length).toFixed(4)) : null,
    wastedOnUnfinishedUsd: Number((costUsd - doneCostUsd).toFixed(2)),
  },
  // Net MRR vs the last 30 days of provider cost (hosting/SaaS fees not included).
  grossMarginPct: netMrrUsd > 0 ? Number((((netMrrUsd - costUsd) / netMrrUsd) * 100).toFixed(1)) : null,
};

if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else console.dir(report, { depth: 4 });
