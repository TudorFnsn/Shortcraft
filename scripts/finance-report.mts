/**
 * Finance report: MRR vs what the providers billed us (30-day window), per
 * model tier, from the Supabase project in `.env.local`. READ-ONLY: `select`s
 * only (service role). Definitions live in `src/features/metrics/unit-economics.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts           (table)
 *      npx tsx scripts/finance-report.mts --json    (raw report, for the digest)
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

const { computeUnitEconomics } = await import('@/features/metrics/unit-economics');
const { FIXED_COSTS_USD_PER_MONTH } = await import('@/config/fixed-costs');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

/** Every row of a select, paged (PostgREST caps a response at 1,000 rows). */
async function selectAll(
  table: string,
  columns: string,
  where?: { column: string; eq: string },
): Promise<Record<string, string>[]> {
  const rows: Record<string, string>[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = where ? base.eq(where.column, where.eq) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as unknown as Record<string, string>[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const [subs, topUps, jobs] = await Promise.all([
  selectAll('subscriptions', 'plan_id, status, created_at'),
  selectAll('credit_transactions', 'delta, created_at', { column: 'reason', eq: 'topup' }),
  selectAll('render_jobs', 'status, model_tier, actual_credits, api_cost_usd, created_at'),
]);

const date = (s: string | undefined) => new Date(s ?? 0);
const report = computeUnitEconomics({
  now: new Date(),
  subscriptions: subs.map((s) => ({ planId: s.plan_id ?? '', status: s.status ?? '' })),
  topUps: topUps.map((t) => ({ credits: Number(t.delta), createdAt: date(t.created_at) })),
  jobs: jobs.map((j) => ({
    status: j.status ?? '',
    modelTier: j.model_tier ?? 'standard',
    actualCredits: Number(j.actual_credits),
    apiCostUsd: Number(j.api_cost_usd),
    createdAt: date(j.created_at),
  })),
  fixedCostsUsdPerMonth: FIXED_COSTS_USD_PER_MONTH,
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
console.log(`Shortcraft finance — as of ${report.asOf} (last ${report.windowDays} days)\n`);
console.log(
  `★ MRR (gross):          €${report.mrrEur.toFixed(2)}  ${JSON.stringify(report.subscribersByPlan)}`,
);
console.log(`  Net MRR (after VAT/fees): ${usd(report.netMrrUsd)}`);
console.log(
  `  Top-ups (net):        ${usd(report.topUpNetUsd)}  (${report.topUpsUnpriced} unpriced)`,
);
console.log(`  API cost (providers): ${usd(report.apiCostUsd)}`);
console.log(`    of which failed jobs: ${usd(report.failedCostUsd)}`);
const fixedKnown = Object.keys(FIXED_COSTS_USD_PER_MONTH).length > 0;
console.log(
  `  Fixed costs:          ${fixedKnown ? usd(report.fixedCostsUsd) : 'UNKNOWN — fill src/config/fixed-costs.ts'}`,
);
console.log(
  `  Profit:               ${usd(report.profitUsd)}${fixedKnown ? '' : ' (before fixed costs)'}`,
);
console.log(
  `  Revenue ÷ cost:       ${report.coverage === null ? 'n/a' : `${report.coverage.toFixed(2)}x`}\n`,
);
console.table(report.tiers);
