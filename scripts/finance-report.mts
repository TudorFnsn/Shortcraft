/**
 * Finance report: MRR, cost per finished video, margin and waste, read from the
 * Supabase project in `.env.local`. READ-ONLY (`select`s with the service role).
 * Definitions live in `src/features/finance/unit-economics.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts           (table)
 *      npx tsx scripts/finance-report.mts --json    (raw report, for the digest)
 *      npx tsx scripts/finance-report.mts --days=7  (variable-cost window)
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
const { FIXED_VENDOR_COSTS_USD_PER_MONTH } = await import('@/config/vendor-costs');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

async function selectAll(table: string, columns: string, topUpsOnly = false) {
  const rows: Record<string, string | number>[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = topUpsOnly ? base.eq('reason', 'topup') : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as unknown as Record<string, string | number>[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const daysArg = process.argv.find((a) => a.startsWith('--days='));
const [jobs, subs, topUps] = await Promise.all([
  selectAll('render_jobs', 'status, model_tier, created_at, api_cost_usd, actual_credits'),
  selectAll('subscriptions', 'plan_id, status, created_at'),
  selectAll('credit_transactions', 'delta, created_at', true),
]);

const report = computeFinance({
  now: new Date(),
  windowDays: daysArg ? Number(daysArg.split('=')[1]) : 30,
  fixedCostsUsdPerMonth: FIXED_VENDOR_COSTS_USD_PER_MONTH,
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    createdAt: new Date(String(j.created_at)),
    apiCostUsd: Number(j.api_cost_usd),
    actualCredits: Number(j.actual_credits),
  })),
  subscriptions: subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })),
  topUps: topUps.map((t) => ({
    credits: Number(t.delta),
    createdAt: new Date(String(t.created_at)),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
console.log(`Shortcraft finance — as of ${report.asOf} (variable window ${report.windowDays}d)\n`);
console.log(
  `★ MRR (net of VAT + fees): ${usd(report.mrrNetUsd)}  (customers pay €${report.mrrGrossEur})`,
);
console.log(
  `  Paying subscribers:      ${report.payingSubscribers}  ARPU ${report.arpuNetUsd === null ? 'n/a' : usd(report.arpuNetUsd)}`,
);
console.log(`  Top-up revenue (window): ${usd(report.topUpRevenueNetUsd)}`);
console.log(
  `  API cost (window):       ${usd(report.variableCostUsd)}  = ${pct(report.apiCostShare)} of revenue`,
);
console.log(
  `  Wasted on failed jobs:   ${usd(report.wastedOnFailedUsd)}  (failure rate ${pct(report.failureRate)})`,
);
console.log(`  Known fixed costs / mo:  ${usd(report.fixedCostsKnownUsd)}`);
console.log(
  `  Profit (window):         ${usd(report.monthlyProfitUsd)}  margin ${pct(report.grossMarginRatio)}`,
);
if (report.fixedCostsUnknown.length) {
  console.log(
    `  ⚠ Unknown fixed costs (owner must fill src/config/vendor-costs.ts): ${report.fixedCostsUnknown.join(', ')}`,
  );
}
console.table(report.perTier);
