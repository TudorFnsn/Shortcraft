/**
 * Finance report: MRR, net revenue, real cost per finished video by tier,
 * wasted spend on failed jobs, fixed costs and cash left, read from the
 * Supabase project in `.env.local`. READ-ONLY: it only runs `select`s.
 * Definitions live in `src/features/finance/unit-economics.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts                       (table)
 *      npx tsx scripts/finance-report.mts --json                (for the digest)
 *      npx tsx scripts/finance-report.mts --invoiced=42.10      (real provider invoices, last 30d, USD)
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

const { computeFinance, formatPct } = await import('@/features/finance/unit-economics');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

async function selectAll<T>(table: string, columns: string, reason?: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = reason ? base.eq('reason', reason) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number | null>;
const [subs, jobs, topUps] = await Promise.all([
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll<Row>('render_jobs', 'status, model_tier, api_cost_usd, actual_credits, created_at'),
  selectAll<Row>('credit_transactions', 'delta, created_at', 'topup'),
]);

const invoicedArg = process.argv.find((a) => a.startsWith('--invoiced='));
const report = computeFinance({
  now: new Date(),
  subscriptions: subs.map((s) => ({
    userId: String(s.user_id ?? ''),
    planId: String(s.plan_id ?? ''),
    status: String(s.status ?? ''),
  })),
  jobs: jobs.map((j) => ({
    status: String(j.status ?? ''),
    modelTier: String(j.model_tier ?? 'standard'),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    actualCredits: Number(j.actual_credits ?? 0),
    createdAt: new Date(String(j.created_at ?? 0)),
  })),
  topUps: topUps.map((t) => ({
    credits: Number(t.delta ?? 0),
    createdAt: new Date(String(t.created_at ?? 0)),
  })),
  invoicedUsd: invoicedArg ? Number(invoicedArg.split('=')[1]) : null,
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(n < 1 ? 3 : 2)}`);
console.log(`Shortcraft finance — as of ${report.asOf} (last ${report.windowDays} days)\n`);
console.log(
  `★ MRR: €${report.mrrEur}  (ARR €${report.arrEur}, ${report.payingSubscribers} paying)`,
);
console.log(`  By plan:             ${JSON.stringify(report.subscribersByPlan)}`);
console.log(
  `  Net revenue (30d):   ${usd(report.netRevenueUsd)}  (subs ${usd(report.mrrNetUsd)} + top-ups ${usd(report.topUpNetUsd)})`,
);
console.log(
  `  Variable API cost:   ${usd(report.variableCostUsd)}  (wasted on failed jobs: ${usd(report.wastedCostUsd)})`,
);
console.log(`  Gross margin:        ${formatPct(report.grossMargin)}`);
console.log(
  `  Fixed costs:         ${usd(report.fixedCostUsd)}  (unknown: ${report.fixedCostGaps.join(', ') || 'none'})`,
);
console.log(`  Cash after costs:    ${usd(report.cashAfterCostsUsd)}`);
console.log(`  Break-even subs:     ${report.breakEvenSubscribers ?? 'n/a'}`);
if (report.invoiceGapUsd !== null)
  console.log(
    `  Invoice vs catalog:  ${usd(report.invoiceGapUsd)} (positive = we under-count cost)`,
  );
console.log(`  Videos / failed:     ${report.videosFinished} / ${report.failedJobs}\n`);
console.table(report.tiers);
console.log(
  '\nNote: API cost is usage × catalog list price, not a provider invoice. Pass --invoiced=<usd> to compare.',
);
