/**
 * Finance report: revenue vs our API cost, from the Supabase project in `.env.local`.
 * READ-ONLY (selects only, service role). Feeds the Finance Optimizer routine
 * (`.claude/routines/finance-optimizer.md`).
 *
 * Revenue here is an estimate from active subscriptions at list price (net of the
 * assumptions in `features/billing/margin`); Stripe is the source of truth for MRR.
 *
 * Run: npx tsx scripts/finance-report.mts           (table)
 *      npx tsx scripts/finance-report.mts --json    (raw)
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

interface Job {
  status: string;
  model_tier: string;
  target_duration_sec: number;
  actual_credits: number | string;
  api_cost_usd: number | string;
  created_at: string;
}
interface Sub {
  plan_id: string;
  status: string;
}

const [jobs, subs] = await Promise.all([
  selectAll<Job>(
    'render_jobs',
    'status, model_tier, target_duration_sec, actual_credits, api_cost_usd, created_at',
  ),
  selectAll<Sub>('subscriptions', 'plan_id, status'),
]);

const since = Date.now() - 30 * 24 * 3600 * 1000;
const recent = jobs.filter((j) => new Date(j.created_at).getTime() >= since);

const byTier: Record<string, { jobs: number; done: number; failed: number; costUsd: number; credits: number }> = {};
for (const j of recent) {
  const t = (byTier[j.model_tier] ??= { jobs: 0, done: 0, failed: 0, costUsd: 0, credits: 0 });
  t.jobs++;
  if (j.status === 'done') t.done++;
  if (j.status === 'failed') t.failed++;
  t.costUsd += Number(j.api_cost_usd); // failed jobs still cost money: counted on purpose
  t.credits += Number(j.actual_credits);
}

const { vatRate, stripePercentFee, stripeFixedFeeEur, usdPerEur } = REVENUE_ASSUMPTIONS;
const active = subs.filter((s) => s.status === 'active' || s.status === 'trialing');
let mrrGrossEur = 0;
let mrrNetUsd = 0;
const planCounts: Record<string, number> = {};
for (const s of active) {
  const plan = PLANS[s.plan_id as keyof typeof PLANS];
  if (!plan) continue;
  planCounts[s.plan_id] = (planCounts[s.plan_id] ?? 0) + 1;
  const eur = plan.priceCents / 100;
  mrrGrossEur += eur;
  mrrNetUsd += ((eur / (1 + vatRate)) * (1 - stripePercentFee) - stripeFixedFeeEur) * usdPerEur;
}

const apiCost30d = Object.values(byTier).reduce((a, t) => a + t.costUsd, 0);
const doneTotal = Object.values(byTier).reduce((a, t) => a + t.done, 0);
const report = {
  asOf: new Date().toISOString(),
  window: 'last 30 days',
  activeSubscribers: active.length,
  planCounts,
  estMrrGrossEur: Number(mrrGrossEur.toFixed(2)),
  estMrrNetUsd: Number(mrrNetUsd.toFixed(2)),
  apiCost30dUsd: Number(apiCost30d.toFixed(2)),
  estGrossMarginUsd: Number((mrrNetUsd - apiCost30d).toFixed(2)),
  estGrossMarginPct: mrrNetUsd > 0 ? Number((((mrrNetUsd - apiCost30d) / mrrNetUsd) * 100).toFixed(1)) : null,
  costPerFinishedVideoUsd: doneTotal ? Number((apiCost30d / doneTotal).toFixed(3)) : null,
  byTier,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
console.log(`Shortcraft finance — ${report.asOf} (${report.window})\n`);
console.log(`Active subscribers: ${report.activeSubscribers} ${JSON.stringify(planCounts)}`);
console.log(`Est. MRR: EUR ${report.estMrrGrossEur} gross / USD ${report.estMrrNetUsd} net of VAT+fees`);
console.log(`API cost: USD ${report.apiCost30dUsd}  ->  est. gross margin USD ${report.estGrossMarginUsd} (${report.estGrossMarginPct ?? 'n/a'}%)`);
console.log(`Cost per finished video: ${report.costPerFinishedVideoUsd ?? 'n/a'} USD\n`);
console.table(byTier);
