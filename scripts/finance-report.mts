/**
 * Finance report: MRR, variable API cost per tier, cost per 1k credits and
 * monthly profit, read from the Supabase project in `.env.local`.
 * READ-ONLY: it only runs `select`s (service role). Math lives in
 * `src/features/metrics/finance.ts`. Real cash (payouts, refunds, disputes)
 * comes from Stripe, not from here.
 *
 * Fixed monthly costs (hosting, ElevenLabs plan, ...) are not in the DB: pass
 * them from FinancePlan §4 with `--fixed=<usd>`.
 *
 * Run: npx tsx scripts/finance-report.mts --fixed=45          (table)
 *      npx tsx scripts/finance-report.mts --fixed=45 --json   (for the digest)
 *      add --days=<n> to change the cost window (default 30)
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

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const { computeFinance } = await import('@/features/metrics/finance');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

async function selectAll(table: string, columns: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .order('created_at')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const [subs, jobs] = await Promise.all([
  selectAll('subscriptions', 'plan_id, status, created_at'),
  selectAll('render_jobs', 'status, model_tier, created_at, api_cost_usd, actual_credits'),
]);

const report = computeFinance({
  now: new Date(),
  subscriptions: subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    createdAt: new Date(String(j.created_at)),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    actualCredits: Number(j.actual_credits ?? 0),
  })),
  fixedMonthlyCostUsd: Number(arg('fixed') ?? 0),
  windowDays: Number(arg('days') ?? 30),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number) => `$${n.toFixed(2)}`;
console.log(`Shortcraft finance — as of ${report.asOf} (cost window ${report.windowDays}d)\n`);
console.log(
  `Paying subscribers:  ${report.payingSubscribers} ${JSON.stringify(report.subscribersByPlan)}`,
);
console.log(`MRR gross (EUR):     €${report.grossMrrEur.toFixed(2)}`);
console.log(`MRR net (USD):       ${usd(report.netMrrUsd)}  (after VAT + Stripe fees)`);
console.log(
  `Variable API cost:   ${usd(report.variableCostUsd)}  (failed jobs: ${usd(report.failedCostUsd)})`,
);
console.log(
  `Fixed cost / month:  ${usd(report.fixedCostUsd)}${arg('fixed') ? '' : '  (pass --fixed=<usd>)'}`,
);
console.log(`Monthly profit:      ${usd(report.monthlyProfitUsd)}`);
console.log(
  `Gross margin:        ${report.grossMargin === null ? 'n/a' : `${(report.grossMargin * 100).toFixed(1)}%`}\n`,
);
console.table(report.byTier);
