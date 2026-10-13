/**
 * Finance report: MRR, measured API cost per finished video (by tier), spend on
 * failed jobs, and monthly profit after fixed costs. READ-ONLY selects with the
 * service role from `.env.local`. Definitions: `src/features/metrics/unit-economics.ts`.
 *
 * Fixed monthly costs (hosting, Supabase, Sentry, Resend, domain...) are not in the
 * database: pass them with `--fixed-usd 45` or set FIXED_MONTHLY_USD.
 *
 * Run: npx tsx scripts/finance-report.mts [--fixed-usd N] [--json]
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
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

async function selectAll(table: string, columns: string): Promise<Record<string, string>[]> {
  const rows: Record<string, string>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .order('created_at')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as unknown as Record<string, string>[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const flag = process.argv.indexOf('--fixed-usd');
const fixedMonthlyUsd = Number(
  (flag >= 0 ? process.argv[flag + 1] : undefined) ?? process.env.FIXED_MONTHLY_USD ?? 0,
);

const [jobs, subs] = await Promise.all([
  selectAll('render_jobs', 'status, model_tier, api_cost_usd, actual_credits, created_at'),
  selectAll('subscriptions', 'plan_id, status, created_at'),
]);

const report = computeFinance({
  now: new Date(),
  fixedMonthlyUsd: Number.isFinite(fixedMonthlyUsd) ? fixedMonthlyUsd : 0,
  jobs: jobs.map((j) => ({
    status: j.status ?? '',
    modelTier: j.model_tier ?? 'standard',
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    actualCredits: Number(j.actual_credits ?? 0),
    createdAt: new Date(j.created_at ?? 0),
  })),
  subscriptions: subs.map((s) => ({ planId: s.plan_id ?? '', status: s.status ?? '' })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number) => `$${n.toFixed(2)}`;
console.log(`Shortcraft finance — as of ${report.asOf} (last ${report.windowDays} days)\n`);
console.log(`Paying subscribers:   ${report.payingSubscribers}`);
console.log(`MRR (gross, EUR):     €${report.mrrGrossEur.toFixed(2)}`);
console.log(`MRR (net, USD):       ${usd(report.mrrNetUsd)}  (after VAT + Stripe fees)`);
console.log(
  `Variable API cost:    ${usd(report.variableCostUsd)}  (failed jobs: ${usd(report.failedCostUsd)})`,
);
console.log(
  `Fixed monthly cost:   ${usd(report.fixedMonthlyUsd)}${fixedMonthlyUsd ? '' : '  (not supplied: pass --fixed-usd)'}`,
);
console.log(`Monthly profit:       ${usd(report.monthlyProfitUsd)}`);
console.log(
  `Margin:               ${report.grossMargin === null ? 'n/a (no revenue)' : `${(report.grossMargin * 100).toFixed(1)}%`}\n`,
);
console.table(
  report.byTier.map((t) => ({
    tier: t.tier,
    finished: t.finished,
    totalCost: usd(t.costUsd),
    avgCostPerVideo: t.avgCostUsd === null ? 'n/a' : usd(t.avgCostUsd),
    creditsCharged: t.credits,
  })),
);
