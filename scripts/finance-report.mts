/**
 * Finance report: MRR, 30-day net revenue vs API spend, cost per finished video,
 * waste on failed jobs. READ-ONLY (`select`s with the service role from `.env.local`).
 * Math lives in `src/features/metrics/unit-economics.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts [--fixed-usd=<monthly hosting+tools>] [--json]
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

const { computeUnitEconomics } = await import('@/features/metrics/unit-economics');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;
const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

async function selectAll<T>(
  table: string,
  columns: string,
  filter?: (q: any) => any, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const { data, error } = await (filter ? filter(base) : base)
      .order('created_at')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number>;
const [subs, jobs, topups] = await Promise.all([
  selectAll<Row>('subscriptions', 'plan_id, status, created_at'),
  selectAll<Row>(
    'render_jobs',
    'status, model_tier, api_cost_usd, actual_credits, created_at',
    (q) => q.gte('created_at', since),
  ),
  selectAll<Row>('credit_transactions', 'delta, created_at', (q) => q.eq('reason', 'topup')),
]);

const fixedArg = process.argv.find((a) => a.startsWith('--fixed-usd='));
const report = computeUnitEconomics({
  now: new Date(),
  subscriptions: subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    apiCostUsd: Number(j.api_cost_usd),
    actualCredits: Number(j.actual_credits),
    createdAt: new Date(String(j.created_at)),
  })),
  topUps: topups.map((t) => ({
    credits: Number(t.delta),
    createdAt: new Date(String(t.created_at)),
  })),
  fixedCostsUsdPerMonth: fixedArg ? Number(fixedArg.split('=')[1]) : undefined,
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
const { last30d: m } = report;
const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
console.log(`Shortcraft finance — as of ${report.asOf}\n`);
console.log(
  `★ MRR: €${report.mrrEur} (${usd(report.mrrNetUsd)} net) from ${report.payingSubscribers} subscribers, ARPU €${report.arpuEur ?? 'n/a'}`,
);
console.log(`  Last 30d net revenue:  ${usd(m.revenueNetUsd)} (top-ups ${usd(m.topUpNetUsd)})`);
console.log(
  `  Last 30d API spend:    ${usd(m.apiCostUsd)} (wasted on unfinished jobs: ${usd(m.wastedApiCostUsd)})`,
);
console.log(
  `  Fixed costs:           ${usd(m.fixedCostsUsd)}${fixedArg ? '' : '  (pass --fixed-usd=… for real hosting/tool spend)'}`,
);
console.log(`  Profit:                ${usd(m.profitUsd)}   coverage ${m.coverage ?? 'n/a'}x`);
console.log(
  `  Cost / finished video: ${usd(m.costPerFinishedVideoUsd)}   API $/1k credits: ${m.apiUsdPer1kCredits ?? 'n/a'}\n`,
);
console.table(m.byTier);
