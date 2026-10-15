/**
 * Unit-economics report: what finished videos actually cost us (render_jobs.api_cost_usd)
 * versus the credits they burned, plus recurring revenue (MRR) from active subscriptions.
 * READ-ONLY (selects only, service role from `.env.local`). Fixed costs (hosting, tools)
 * are not in the database: pass them with --fixed=<usd per month> or set them in docs/FinancePlan.md.
 *
 * Run: npx tsx scripts/unit-economics-report.mts [--days=30] [--fixed=120] [--json]
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
  const n = hit ? Number(hit.split('=')[1]) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const days = arg('days', 30);
const fixedUsd = arg('fixed', 0);
const asJson = process.argv.includes('--json');

const { PLANS } = await import('@/config/plans');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');
const { isLiveSubscription } = await import('@/features/billing/entitlements');

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

const since = new Date(Date.now() - days * 86_400_000).toISOString();
const [jobs, subs] = await Promise.all([
  selectAll('render_jobs', 'status, api_cost_usd, charged_credits, created_at', since),
  selectAll('subscriptions', 'user_id, plan_id, status, current_period_end, created_at'),
]);

const done = jobs.filter((j) => j.status === 'done');
const failed = jobs.filter((j) => j.status === 'failed');
const apiCost = jobs.reduce((s, j) => s + Number(j.api_cost_usd ?? 0), 0); // failed jobs still cost money
const credits = done.reduce((s, j) => s + Number(j.charged_credits ?? 0), 0);

const price = (id: string) => (PLANS as Record<string, { priceCents: number }>)[id]?.priceCents ?? 0;
const live = subs
  .map((s) => ({ status: String(s.status), planId: String(s.plan_id) }))
  .filter((s) => isLiveSubscription(s as never));
const mrrEur = live.reduce((s, r) => s + price(r.planId) / 100, 0);

const report = {
  windowDays: days,
  jobs: jobs.length,
  done: done.length,
  failed: failed.length,
  apiCostUsd: +apiCost.toFixed(2),
  apiCostPerDoneVideoUsd: done.length ? +(apiCost / done.length).toFixed(4) : null,
  creditsBurned: credits,
  apiCostPer1kCreditsUsd: credits ? +((apiCost / credits) * 1000).toFixed(4) : null,
  payingSubscribers: live.length,
  mrrEur: +mrrEur.toFixed(2),
  fixedCostsUsd: fixedUsd,
  note: 'MRR is in EUR, costs in USD; convert with the current rate before comparing. Failed jobs refund credits but their API spend stays in apiCostUsd.',
};

if (asJson) console.log(JSON.stringify(report, null, 2));
else console.table(report);
