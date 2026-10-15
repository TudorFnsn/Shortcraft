/**
 * Finance report: MRR, variable cost per video and tier, trial burn, gross
 * margin and (with fixed costs) monthly cash, from the Supabase project in
 * `.env.local`. READ-ONLY (service role `select`s). Math lives in
 * `src/features/finance/unit-economics.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts [--fixed-usd 85] [--days 30] [--json]
 * `--fixed-usd` = monthly vendor bills (Vercel, Supabase, ElevenLabs plan,
 * Resend, Sentry...). Without it cash and the MRR/cost ratio print as "n/a".
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
const { PAID_GRANT_REASONS } = await import('@/features/billing/entitlements');
const { TOPUP_PACKS } = await import('@/config/plans');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : null;
};
const windowDays = arg('--days') ?? 30;
const fixedMonthlyUsd = arg('--fixed-usd');

const admin = createSupabaseAdminClient();
const PAGE = 1000;
type Row = Record<string, string | number | null>;

async function selectAll(
  table: string,
  columns: string,
  since?: string,
  filter?: [string, string[]],
) {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = admin.from(table).select(columns);
    if (since) q = q.gte('created_at', since);
    if (filter) q = q.in(filter[0], filter[1]);
    const { data, error } = await q.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
const [subs, jobs, paid] = await Promise.all([
  selectAll('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll('render_jobs', 'user_id, status, model_tier, api_cost_usd, created_at', since),
  selectAll('credit_transactions', 'user_id, delta, reason, created_at', undefined, [
    'reason',
    [...PAID_GRANT_REASONS],
  ]),
]);

// Top-up revenue in the window: price of the pack whose credit size matches the grant.
const packByCredits = new Map(TOPUP_PACKS.map((p) => [p.credits, p.priceCents]));
const topUpCents = paid
  .filter((p) => p.reason === 'topup' && String(p.created_at) >= since)
  .reduce((sum, p) => sum + (packByCredits.get(Number(p.delta)) ?? 0), 0);

const report = computeFinance({
  now: new Date(),
  windowDays,
  subscriptions: subs.map((s) => ({
    userId: String(s.user_id),
    planId: String(s.plan_id),
    status: String(s.status),
  })),
  jobs: jobs.map((j) => ({
    userId: String(j.user_id),
    status: String(j.status),
    modelTier: String(j.model_tier),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    createdAt: new Date(String(j.created_at)),
  })),
  payerIds: new Set(paid.map((p) => String(p.user_id))),
  topUpCents,
  fixedMonthlyUsd,
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
console.log(`Shortcraft finance — as of ${report.asOf} (${windowDays}d window)\n`);
console.log(
  `MRR:                      €${report.mrrEur.toFixed(2)} (${report.payingSubscribers} subscribers, ARPU ${report.arpuEur === null ? 'n/a' : '€' + report.arpuEur.toFixed(2)})`,
);
console.log(
  `Net MRR (after VAT/fees): ${usd(report.netMrrUsd)}   + top-ups/mo ${usd(report.netTopUpMonthlyUsd)}`,
);
console.log(
  `Variable cost (window):   ${usd(report.variableCostUsd)}  → ${usd(report.variableCostMonthlyUsd)}/mo (failed jobs ${usd(report.failedJobCostUsd)})`,
);
console.log(
  `Trial burn share:         ${pct(report.freeUserCostShare)} of variable cost goes to users who never paid`,
);
console.log(`Gross margin:             ${pct(report.grossMargin)}`);
console.log(`Fixed costs/mo:           ${usd(fixedMonthlyUsd)}`);
console.log(`Monthly cash:             ${usd(report.monthlyCashUsd)}`);
console.log(
  `MRR ratio (net rev/cost): ${report.mrrCostRatio === null ? 'n/a' : report.mrrCostRatio.toFixed(2) + 'x'}\n`,
);
console.table(
  Object.entries(report.byTier).map(([tier, t]) => ({
    tier,
    videos: t.videos,
    costUsd: usd(t.costUsd),
    avgPerVideo: usd(t.avgCostUsd),
  })),
);
console.table(report.subscribersByPlan);
