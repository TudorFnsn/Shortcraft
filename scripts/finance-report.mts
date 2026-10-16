/**
 * Finance report for the Finance CEO routine: MRR, net MRR, ARPU, API cost per
 * video (by tier), top-ups and a monthly P&L. READ-ONLY (`select`s with the
 * service role from `.env.local`). Definitions: `src/features/finance/pnl.ts`.
 * Fixed costs come from `src/config/costs.ts`.
 *
 * `api_cost_usd` is the catalog price metered per step, not the provider's
 * invoice: compare with the real fal.ai / ElevenLabs / Anthropic bills.
 *
 * Run: npx tsx scripts/finance-report.mts           (table)
 *      npx tsx scripts/finance-report.mts --json    (raw report, for the digest)
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

const { computeFinance } = await import('@/features/finance/pnl');
const { FIXED_COSTS } = await import('@/config/costs');
const { TOPUP_PACKS } = await import('@/config/plans');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

async function selectAll<T>(
  table: string,
  columns: string,
  eq?: { column: string; value: string },
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = eq ? base.eq(eq.column, eq.value) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number>;
const [subs, jobs, topups] = await Promise.all([
  selectAll<Row>('subscriptions', 'plan_id, status, created_at'),
  selectAll<Row>('render_jobs', 'status, model_tier, api_cost_usd, created_at'),
  selectAll<Row>('credit_transactions', 'delta, created_at', { column: 'reason', value: 'topup' }),
]);

const packByCredits = new Map(TOPUP_PACKS.map((p) => [p.credits, p.priceCents]));
const report = computeFinance({
  now: new Date(),
  subscriptions: subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    apiCostUsd: Number(j.api_cost_usd),
    createdAt: new Date(String(j.created_at)),
  })),
  topUps: topups.flatMap((t) => {
    const priceCents = packByCredits.get(Number(t.delta));
    return priceCents ? [{ priceCents, createdAt: new Date(String(t.created_at)) }] : [];
  }),
  fixedCosts: FIXED_COSTS,
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
console.log(`Shortcraft finance — as of ${report.asOf}\n`);
console.log(
  `★ MRR (gross, VAT incl.): €${report.mrrGrossEur.toFixed(2)}   net: ${usd(report.mrrNetUsd)}`,
);
console.log(
  `  Paying subscribers: ${report.payingSubscribers}   ARPU (net): ${usd(report.arpuNetUsd)}`,
);
console.log(`  Top-ups, 30d (net): ${usd(report.topUpNetUsd30d)}`);
console.log(
  `  Videos done, 30d: ${report.videosDone30d}   API cost, 30d: ${usd(report.apiCostUsd30d)}   per video: ${usd(report.avgCostPerVideoUsd)}`,
);
console.log(
  `  Gross profit: ${usd(report.grossProfitUsd)}   margin: ${report.grossMargin === null ? 'n/a' : `${(report.grossMargin * 100).toFixed(1)}%`}`,
);
console.log(
  `  Fixed costs: ${usd(report.fixedCostsUsd)}   NET PROFIT / month: ${usd(report.netProfitUsd)}`,
);
if (report.unfilledFixedCosts.length)
  console.log(
    `  ⚠ fixed costs not filled in (P&L is optimistic): ${report.unfilledFixedCosts.join(', ')}`,
  );
console.log('  ⚠ API cost is catalog-metered, not invoiced. Compare with provider bills.\n');
console.table(report.costByTier);
