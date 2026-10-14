/**
 * Finance report: MRR, metered API cost vs credits charged, cost per finished
 * video by tier, and gross margin — read from the Supabase project in `.env.local`.
 * READ-ONLY: it only runs `select`s (service role). Plan prices come from
 * `src/config/plans.ts`; `render_jobs.api_cost_usd` is our metered provider cost.
 * Fixed costs (hosting, subscriptions) are NOT in the DB: pass them with
 * `--fixed-usd=<monthly total>` or leave them at 0 and treat margin as gross.
 *
 * Run: npx tsx scripts/finance-report.mts [--days=30] [--fixed-usd=60] [--json]
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

const arg = (name: string, fallback: number) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  const n = hit ? Number(hit.split('=')[1]) : fallback;
  return Number.isFinite(n) ? n : fallback;
};
const days = arg('days', 30);
const fixedUsd = arg('fixed-usd', 0);
const asJson = process.argv.includes('--json');

const { PLANS } = await import('@/config/plans');
const { isLiveSubscription } = await import('@/features/billing/entitlements');
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

const since = new Date(Date.now() - days * 86_400_000).toISOString();
const [subs, jobs] = await Promise.all([
  selectAll('subscriptions', 'plan_id, status, current_period_end, created_at'),
  selectAll(
    'render_jobs',
    'status, model_tier, target_duration_sec, actual_credits, api_cost_usd, created_at',
    since,
  ),
]);

// MRR in EUR from live subscriptions (list price; excludes VAT/Stripe fees/discounts).
let mrrCents = 0;
const byPlan: Record<string, number> = {};
for (const s of subs) {
  const snap = { planId: String(s.plan_id), status: String(s.status) };
  if (!isLiveSubscription(snap)) continue;
  const plan = PLANS[snap.planId];

  mrrCents += plan.priceCents;
  byPlan[plan.id] = (byPlan[plan.id] ?? 0) + 1;
}

const tiers: Record<string, { jobs: number; done: number; cost: number; credits: number }> = {};
for (const j of jobs) {
  const t = (tiers[String(j.model_tier)] ??= { jobs: 0, done: 0, cost: 0, credits: 0 });
  t.jobs += 1;
  if (j.status === 'done' || j.status === 'completed') t.done += 1;
  t.cost += Number(j.api_cost_usd ?? 0);
  t.credits += Number(j.actual_credits ?? 0);
}
const totalCost = Object.values(tiers).reduce((a: number, t) => a + t.cost, 0);
const mrrEur = mrrCents / 100;

const report = {
  windowDays: days,
  mrrEur,
  arrEur: mrrEur * 12,
  payingSubscribers: Object.values(byPlan).reduce((a: number, n) => a + n, 0),
  byPlan,
  meteredApiCostUsdWindow: Number(totalCost.toFixed(2)),
  fixedCostsUsdPerMonth: fixedUsd,
  apiCostPerMrrEuro: mrrEur > 0 ? Number((totalCost / mrrEur).toFixed(3)) : null,
  tiers: Object.fromEntries(
    Object.entries(tiers).map(([k, t]) => [
      k,
      {
        ...t,
        cost: Number(t.cost.toFixed(2)),
        costPerFinishedVideoUsd: t.done ? Number((t.cost / t.done).toFixed(3)) : null,
        costPerKCredit: t.credits ? Number(((t.cost / t.credits) * 1000).toFixed(4)) : null,
      },
    ]),
  ),
};

if (asJson) console.log(JSON.stringify(report, null, 2));
else {
  console.log(
    `MRR €${mrrEur.toFixed(2)} (ARR €${report.arrEur.toFixed(0)}) · ${report.payingSubscribers} paying · ${JSON.stringify(byPlan)}`,
  );
  console.log(
    `API cost, last ${days}d: $${totalCost.toFixed(2)} · fixed $${fixedUsd}/mo · API cost per MRR € = ${report.apiCostPerMrrEuro ?? 'n/a'}`,
  );
  console.table(report.tiers);
}
