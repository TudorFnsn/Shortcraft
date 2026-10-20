/**
 * Finance report: MRR, cash collected, cost per finished video, burn and
 * break-even, read from the Supabase project in `.env.local`.
 * READ-ONLY: it only runs `select`s (service role). Definitions live in
 * `src/features/metrics/finance.ts`; fixed costs in `src/config/fixed-costs.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts [--days 30]          (table)
 *      npx tsx scripts/finance-report.mts --json                (for the digest)
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

const { computeFinance } = await import('@/features/metrics/finance');
const { FIXED_COSTS } = await import('@/config/fixed-costs');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

/** Every row of a select, paged (PostgREST caps a response at 1,000 rows). */
async function selectAll<T>(
  table: string,
  columns: string,
  where?: { column: string; eq: string },
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = where ? base.eq(where.column, where.eq) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const daysArg = process.argv.indexOf('--days');
const windowDays = daysArg > -1 ? Number(process.argv[daysArg + 1]) || 30 : 30;

type Row = Record<string, string | number>;
const [jobs, subs, topUps] = await Promise.all([
  selectAll<Row>('render_jobs', 'status, model_tier, created_at, api_cost_usd, actual_credits'),
  selectAll<Row>('subscriptions', 'user_id, plan_id, status'),
  selectAll<Row>('credit_transactions', 'delta, created_at', { column: 'reason', eq: 'topup' }),
]);

const report = computeFinance({
  now: new Date(),
  windowDays,
  fixedCosts: FIXED_COSTS,
  jobs: jobs.map((j) => ({
    status: String(j.status ?? ''),
    modelTier: String(j.model_tier ?? ''),
    createdAt: new Date(String(j.created_at ?? 0)),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    actualCredits: Number(j.actual_credits ?? 0),
  })),
  subscriptions: subs.map((s) => ({
    userId: String(s.user_id ?? ''),
    planId: String(s.plan_id ?? ''),
    status: String(s.status ?? ''),
  })),
  topUps: topUps.map((t) => ({
    credits: Number(t.delta ?? 0),
    createdAt: new Date(String(t.created_at ?? 0)),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
console.log(`Shortcraft finance — as of ${report.asOf} (window ${report.windowDays}d)\n`);
console.log(
  `★ MRR (ex-VAT):               ${usd(report.mrrUsd)}   net of Stripe: ${usd(report.netMrrUsd)}`,
);
console.log(
  `  Paying subscribers:          ${report.payingSubscribers}   ARPU ${usd(report.arpuUsd)}`,
);
console.log(`  By plan:                     ${JSON.stringify(report.subscribersByPlan)}`);
console.log(
  `  Top-up revenue (net):        ${usd(report.topUpRevenueUsd)}${report.unpricedTopUps ? `   (${report.unpricedTopUps} unpriced rows!)` : ''}`,
);
console.log(
  `  Variable cost (providers):   ${usd(report.variableCostUsd)}   of which failed jobs ${usd(report.failedCostUsd)}`,
);
console.log(
  `  Finished videos:             ${report.finishedVideos}   cost/video ${usd(report.costPerFinishedUsd)}`,
);
console.log(`  COGS ratio (cost ÷ revenue): ${report.cogsRatio ?? 'n/a'}`);
console.log(`  Fixed costs (known):         ${usd(report.fixedCostUsd)}`);
console.log(`  Burn:                        ${usd(report.burnUsd)}`);
console.log(`  Net cash over window:        ${usd(report.netCashUsd)}`);
console.log(`  Break-even subscribers:      ${report.breakEvenSubscribers ?? 'n/a'}`);
if (report.unknownFixedCosts.length > 0) {
  console.log(
    `\n⚠ Fixed costs not filled in (burn is understated): ${report.unknownFixedCosts.join(', ')}`,
  );
}
console.log('\nPer tier:');
console.table(report.byTier);
