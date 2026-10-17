/**
 * Finance report: MRR, 30-day net revenue, API spend by tier, cost per finished
 * video, failed-job leakage and profit, read from the Supabase project in
 * `.env.local`. READ-ONLY (`select`s with the service role). Math lives in
 * `src/features/metrics/finance.ts`.
 *
 * Fixed monthly costs (hosting, DB, ElevenLabs plan…) are not in the DB: pass
 * them as `--fixed-usd=<n>` or `FIXED_MONTHLY_USD`.
 *
 * Run: npx tsx scripts/finance-report.mts [--fixed-usd=60] [--json]
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

const { computeFinance } = await import('@/features/metrics/finance');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;
const since = new Date(Date.now() - 31 * 86_400_000).toISOString();

async function selectAll<T>(
  table: string,
  columns: string,
  filter?: (q: any) => any, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const q = (filter ? filter(base) : base).order('created_at').range(from, from + PAGE - 1);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number | null>;
const [subs, jobs, topups] = await Promise.all([
  selectAll<Row>('subscriptions', 'plan_id, status, created_at'),
  selectAll<Row>('render_jobs', 'status, model_tier, api_cost_usd, created_at', (q) =>
    q.gte('created_at', since),
  ),
  selectAll<Row>('credit_transactions', 'delta, created_at', (q) =>
    q.eq('reason', 'topup').gte('created_at', since),
  ),
]);

const fixedArg = process.argv.find((a) => a.startsWith('--fixed-usd='))?.split('=')[1];
const fixedMonthlyUsd = Number(fixedArg ?? process.env.FIXED_MONTHLY_USD ?? 0) || 0;

const report = computeFinance({
  now: new Date(),
  subscriptions: subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    createdAt: new Date(String(j.created_at)),
  })),
  topups: topups.map((t) => ({
    credits: Number(t.delta ?? 0),
    createdAt: new Date(String(t.created_at)),
  })),
  fixedMonthlyUsd,
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number) => `$${n.toFixed(2)}`;
console.log(`Shortcraft finance — as of ${report.asOf}\n`);
console.log(
  `MRR (list, EUR):        €${report.mrrGrossEur.toFixed(2)} from ${report.payingSubscribers} subscribers`,
);
console.log(
  `MRR (net of VAT+fees):  ${usd(report.mrrNetUsd)}   top-ups 30d: ${usd(report.topupNetUsd30d)}`,
);
console.log(
  `API spend 30d:          ${usd(report.apiCostUsd30d)} (failed jobs: ${usd(report.failedCostUsd30d)})`,
);
console.log(
  `Net revenue ÷ API:      ${report.apiMultiple === null ? 'n/a' : report.apiMultiple.toFixed(2) + 'x'}`,
);
console.log(`Contribution 30d:       ${usd(report.contributionUsd30d)}`);
console.log(`Fixed costs / profit:   ${usd(report.fixedMonthlyUsd)} / ${usd(report.profitUsd30d)}`);
console.log(`Break-even subscribers: ${report.breakEvenSubscribers ?? 'n/a'}\n`);
console.table(report.byTier);
