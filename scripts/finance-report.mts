/**
 * Finance report: MRR, top-up revenue, API cost per video/tier, free-user cost
 * and profit, read from the Supabase project in `.env.local`. READ-ONLY.
 * Definitions live in `src/features/metrics/finance.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts [--fixed=<usd per month>] [--json]
 *   --fixed  monthly costs the DB can't see (Vercel, Supabase, ElevenLabs plan, ...)
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env.local into process.env BEFORE importing app modules (env validates on import).
const envFile = resolve('.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const { computeFinance } = await import('@/features/metrics/finance');
const { PAID_GRANT_REASONS } = await import('@/features/billing/entitlements');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;
const since = new Date(Date.now() - 31 * 86_400_000).toISOString();

/** Every row of a select, paged (PostgREST caps a response at 1,000 rows). */
async function selectAll(
  table: string,
  columns: string,
  filter?: (q: any) => any, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<Record<string, string | number>[]> {
  const rows: Record<string, string | number>[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const { data, error } = await (filter ? filter(base) : base)
      .order('created_at')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as Record<string, string | number>[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const [jobs, subs, grants] = await Promise.all([
  selectAll(
    'render_jobs',
    'user_id, status, model_tier, api_cost_usd, actual_credits, created_at',
    (q) => q.gte('created_at', since),
  ),
  selectAll('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll('credit_transactions', 'user_id, reason, delta, created_at', (q) =>
    q.in('reason', [...PAID_GRANT_REASONS]),
  ),
]);

const fixedArg = process.argv.find((a) => a.startsWith('--fixed='));
const report = computeFinance({
  now: new Date(),
  fixedCostsUsdMonthly: fixedArg ? Number(fixedArg.slice('--fixed='.length)) || 0 : 0,
  jobs: jobs.map((j) => ({
    userId: String(j.user_id ?? ''),
    status: String(j.status ?? ''),
    modelTier: String(j.model_tier ?? ''),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    actualCredits: Number(j.actual_credits ?? 0),
    createdAt: new Date(String(j.created_at ?? 0)),
  })),
  subscriptions: subs.map((s) => ({
    userId: String(s.user_id ?? ''),
    planId: String(s.plan_id ?? ''),
    status: String(s.status ?? ''),
  })),
  paidGrants: grants.map((g) => ({
    userId: String(g.user_id ?? ''),
    reason: String(g.reason ?? ''),
    delta: Number(g.delta ?? 0),
    createdAt: new Date(String(g.created_at ?? 0)),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
console.log(`Shortcraft finance — as of ${report.asOf} (last ${report.windowDays} days)\n`);
console.log(
  `MRR (net):            ${usd(report.mrrNetUsd)}  (gross €${report.mrrGrossEur.toFixed(2)}, ${report.payingSubscribers} subscribers)`,
);
console.log(
  `Top-ups (net):        ${usd(report.topUpNetUsd)}  (${report.topUpGrants} purchases, ${report.unpricedTopUpGrants} unpriced)`,
);
console.log(
  `API cost / month:     ${usd(report.apiCostMonthlyUsd)}  (failed jobs ${usd(report.failedJobCostUsd)}, free users ${usd(report.freeUserCostUsd)})`,
);
console.log(
  `Fixed costs / month:  ${usd(report.fixedCostsUsdMonthly)}${fixedArg ? '' : '  (not given: pass --fixed=<usd>)'}`,
);
console.log(`Gross margin:         ${pct(report.grossMargin)}`);
console.log(
  `MRR / cost ratio:     ${report.mrrToCostRatio === null ? 'n/a' : report.mrrToCostRatio.toFixed(2) + 'x'}`,
);
console.log(`Monthly profit:       ${usd(report.monthlyProfitUsd)}\n`);
console.table(
  report.tiers.map((t) => ({
    tier: t.tier,
    videos: t.videos,
    apiCost: usd(t.apiCostUsd),
    credits: t.credits,
    costPerVideo: t.costPerVideoUsd === null ? 'n/a' : usd(t.costPerVideoUsd),
    costPer1kCredits: t.costPer1kCreditsUsd === null ? 'n/a' : usd(t.costPer1kCreditsUsd),
  })),
);
