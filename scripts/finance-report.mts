/**
 * Finance report for the CFO routine: MRR, API cost per video, burn and
 * break-even, read from the Supabase project in `.env.local`.
 * READ-ONLY: only `select`s (service role). Definitions live in
 * `src/features/metrics/unit-economics.ts`.
 *
 * Fixed monthly bills that no API reports (ElevenLabs plan, domain, ...) go in
 * `FINANCE_FIXED_COSTS_USD`, e.g. `ElevenLabs=5,Domain=1.2`.
 *
 * Run: npx tsx scripts/finance-report.mts [--days 30] [--json]
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

const { computeFinance } = await import('@/features/metrics/unit-economics');
const { netRevenueUsd } = await import('@/features/billing/margin');
const { TOPUP_PACKS } = await import('@/config/plans');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const daysArg = process.argv.indexOf('--days');
const windowDays = daysArg > 0 ? Number(process.argv[daysArg + 1]) || 30 : 30;
const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();

type Row = Record<string, string | number>;

/** Every row of a select, paged (PostgREST caps a response at 1,000 rows). */
async function select(table: string, columns: string, topUpsSince?: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const base = admin.from(table).select(columns);
    const q = topUpsSince ? base.eq('reason', 'topup').gte('created_at', topUpsSince) : base;
    const { data, error } = await q.range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as unknown as Row[]));
    if (!data || data.length < 1000) return rows;
  }
}

const [jobs, subs, topups] = await Promise.all([
  select('render_jobs', 'status, model_tier, api_cost_usd, actual_credits, created_at'),
  select('subscriptions', 'plan_id, status'),
  select('credit_transactions', 'delta, created_at', since),
]);

// Top-up packs are sold at fixed credit sizes: price each grant by its pack.
const topUpNetUsd = topups.reduce((sum, t) => {
  const pack = TOPUP_PACKS.find((p) => p.credits === Number(t.delta));
  return sum + (pack ? netRevenueUsd(pack.priceCents) : 0);
}, 0);

const fixedCosts = (process.env.FINANCE_FIXED_COSTS_USD ?? '')
  .split(',')
  .map((s) => s.split('='))
  .filter((p): p is [string, string] => p.length === 2 && Number.isFinite(Number(p[1])))
  .map(([name, usd]) => ({ name: name.trim(), usdPerMonth: Number(usd) }));

const report = computeFinance({
  now: new Date(),
  windowDays,
  topUpNetUsd,
  fixedCosts,
  subscriptions: subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    apiCostUsd: Number(j.api_cost_usd),
    actualCredits: Number(j.actual_credits),
    createdAt: new Date(String(j.created_at)),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
console.log(`Shortcraft finance — last ${windowDays}d, as of ${report.asOf}\n`);
console.log(
  `MRR (net of VAT + fees):  $${report.mrrNetUsd}  ${JSON.stringify(report.subscribersByPlan)}`,
);
console.log(`Top-ups (net, window):    $${report.topUpNetUsd}`);
console.log(
  `API cost (window):        $${report.apiCostUsd}  (failed jobs: $${report.failedApiCostUsd})`,
);
console.log(
  `Fixed costs (window):     $${report.fixedCostUsd}${fixedCosts.length ? '' : '  (set FINANCE_FIXED_COSTS_USD)'}`,
);
console.log(
  `Cash margin (window):     $${report.cashMarginUsd}   revenue/cost: ${report.revenueToCost ?? 'n/a'}`,
);
console.log(`Break-even subscribers:   ${report.breakEvenSubscribers ?? 'n/a'}\n`);
console.table(report.tiers);
