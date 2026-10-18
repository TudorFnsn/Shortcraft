/**
 * Finance report: MRR (list-price estimate from live subscriptions) and measured
 * API cost vs credits per model tier, from the Supabase project in `.env.local`.
 * READ-ONLY: only `select`s (service role). Stripe is the source of truth for
 * real MRR; this is the no-vendor cross-check. See FinancePlan.md.
 *
 * Run: npx tsx scripts/finance-report.mts           (table)
 *      npx tsx scripts/finance-report.mts --json
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
const { isLiveSubscription } = await import('@/features/billing/entitlements');
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
    rows.push(...(data as unknown as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number | null>;
const [subs, jobs] = await Promise.all([
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll<Row>('render_jobs', 'status, model_tier, actual_credits, api_cost_usd, created_at'),
]);

const priceByPlan = new Map<string, number>(
  Object.values(PLANS).map((p) => [p.id, p.priceCents / 100]),
);
const live = subs.filter((s) =>
  isLiveSubscription({ planId: String(s.plan_id ?? ''), status: String(s.status ?? '') }),
);
const mrrEur = live.reduce((sum, s) => sum + (priceByPlan.get(String(s.plan_id)) ?? 0), 0);

const since = Date.now() - 30 * 86_400_000;
const tiers: Record<string, { videos: number; costUsd: number; credits: number }> = {};
for (const j of jobs) {
  if (j.status !== 'done' || new Date(String(j.created_at)).getTime() < since) continue;
  const t = (tiers[String(j.model_tier)] ??= { videos: 0, costUsd: 0, credits: 0 });
  t.videos += 1;
  t.costUsd += Number(j.api_cost_usd ?? 0);
  t.credits += Number(j.actual_credits ?? 0);
}

const rows = Object.entries(tiers).map(([tier, t]) => ({
  tier,
  videos30d: t.videos,
  costUsd: Number(t.costUsd.toFixed(2)),
  avgCostPerVideoUsd: t.videos ? Number((t.costUsd / t.videos).toFixed(3)) : 0,
  creditsBurned: t.credits,
  usdPerKCredits: t.credits ? Number(((t.costUsd / t.credits) * 1000).toFixed(4)) : 0,
}));
const totalCost = rows.reduce((s, r) => s + r.costUsd, 0);
const out = {
  asOf: new Date().toISOString(),
  payingSubscribers: live.length,
  mrrEurListPrice: Number(mrrEur.toFixed(2)),
  apiCostUsd30d: Number(totalCost.toFixed(2)),
  tiers: rows,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(`Shortcraft finance, as of ${out.asOf}\n`);
  console.log(`Paying subscribers: ${out.payingSubscribers}`);
  console.log(`MRR (list price, EUR, excludes top-ups/discounts): ${out.mrrEurListPrice}`);
  console.log(`Measured API cost, last 30 days (USD): ${out.apiCostUsd30d}\n`);
  console.table(rows);
}
