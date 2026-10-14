/**
 * Finance report: MRR, realised API cost per video/tier, realised margin
 * multiple, trailing 30 days. READ-ONLY selects with the service role from
 * `.env.local`. Math lives in `src/features/finance/unit-economics.ts`.
 * Fixed costs (hosting, ElevenLabs plan...) are not in the DB: pass
 * `--fixed=<usd per month>`.
 *
 * Run: npx tsx scripts/finance-report.mts [--fixed=120] [--json]
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
const { isLiveSubscription } = await import('@/features/billing/entitlements');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;
type Row = Record<string, string | number>;

async function selectAll(table: string, columns: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .order('created_at')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as unknown as Row[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const [jobs, subs] = await Promise.all([
  selectAll('render_jobs', 'status, model_tier, created_at, api_cost_usd, charged_credits'),
  selectAll('subscriptions', 'user_id, plan_id, status, created_at'),
]);

const fixedArg = process.argv.find((a) => a.startsWith('--fixed='));
const report = computeFinance({
  now: new Date(),
  fixedMonthlyUsd: fixedArg ? Number(fixedArg.slice(8)) : 0,
  livePlans: subs
    .map((s) => ({ planId: String(s.plan_id), status: String(s.status) }))
    .filter(isLiveSubscription)
    .map((s) => s.planId),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    createdAt: new Date(String(j.created_at)),
    apiCostUsd: Number(j.api_cost_usd),
    chargedCredits: Number(j.charged_credits),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
const usd = (n: number) => `$${n.toFixed(2)}`;
console.log(`Shortcraft finance — as of ${report.asOf} (trailing 30 days)\n`);
console.log(`Paying subscribers:  ${report.payingSubscribers}`);
console.log(`MRR (list, gross):   €${(report.mrrCents / 100).toFixed(2)}`);
console.log(`MRR net of VAT+fees: ${usd(report.netMrrUsd)}`);
console.log(
  `API cost (30d):      ${usd(report.apiCost30dUsd)}  (failed jobs: ${usd(report.failedCost30dUsd)})`,
);
console.log(`Fixed costs:         ${usd(report.fixedMonthlyUsd)}`);
console.log(`Gross profit (30d):  ${usd(report.grossProfit30dUsd)}`);
console.log(
  `Margin multiple:     ${report.marginMultiple === null ? 'n/a' : `${report.marginMultiple}x`}\n`,
);
console.table(report.byTier);
