/**
 * Finance report: MRR, ARPU, measured API cost per video, gross margin, monthly
 * profit and break-even, read from the Supabase project in `.env.local`.
 * READ-ONLY: it only runs `select`s (service role). Math: `features/finance/unit-economics.ts`.
 * Fixed costs come from `src/config/fixed-costs.ts`; unknown ones are listed, not assumed zero.
 *
 * Run: npx tsx scripts/finance-report.mts            (table, 30-day window)
 *      npx tsx scripts/finance-report.mts --days=7   (other window)
 *      npx tsx scripts/finance-report.mts --json     (raw report, for the digest)
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

const { computeFinance } = await import('@/features/finance/unit-economics');
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

type Row = Record<string, string | number>;
const [jobs, subs, topUps] = await Promise.all([
  selectAll<Row>('render_jobs', 'user_id, status, model_tier, api_cost_usd, created_at'),
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll<Row>('credit_transactions', 'user_id, delta, created_at', {
    column: 'reason',
    eq: 'topup',
  }),
]);

const daysArg = process.argv.find((a) => a.startsWith('--days='));
const days = daysArg ? Number(daysArg.slice(7)) : 30;
if (!Number.isFinite(days) || days <= 0) throw new Error('--days must be a positive number');

const date = (s: string | number | undefined) => new Date(s ?? 0);
const report = computeFinance({
  now: new Date(),
  windowDays: days,
  fixedCosts: FIXED_COSTS,
  jobs: jobs.map((j) => ({
    userId: String(j.user_id ?? ''),
    status: String(j.status ?? ''),
    modelTier: String(j.model_tier ?? 'standard'),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    createdAt: date(j.created_at),
  })),
  subscriptions: subs.map((s) => ({
    userId: String(s.user_id ?? ''),
    planId: String(s.plan_id ?? ''),
    status: String(s.status ?? ''),
  })),
  topUps: topUps.map((t) => ({
    userId: String(t.user_id ?? ''),
    credits: Number(t.delta ?? 0),
    createdAt: date(t.created_at),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
console.log(`Shortcraft finance — as of ${report.asOf} (${report.windowDays}-day window)\n`);
console.log(
  `★ Net MRR:                ${usd(report.netMrrUsd)}   (gross ${usd(report.mrrUsd)}, ARR ${usd(report.arrUsd)})`,
);
console.log(`  Paying subscribers:     ${report.payingSubscribers}   ARPU ${usd(report.arpuUsd)}`);
console.log(
  `  Top-ups (net):          ${usd(report.topUpNetUsd)} from ${report.topUpPurchases} purchases`,
);
console.log(
  `  Videos finished:        ${report.videosDone}   avg API cost ${usd(report.avgCostPerVideoUsd)}`,
);
console.log(
  `  API cost:               ${usd(report.apiCostUsd)}   wasted on failed jobs ${usd(report.wastedUsd)}`,
);
console.log(
  `  Gross margin:           ${pct(report.grossMargin)}   revenue ÷ cost ${report.revenueMultiple ?? 'n/a'}x`,
);
console.log(`  Known fixed costs:      ${usd(report.fixedUsd)}/mo`);
if (report.unknownFixed.length > 0)
  console.log(`  Fixed costs UNKNOWN:    ${report.unknownFixed.join(', ')}`);
console.log(
  `  Monthly profit:         ${usd(report.monthlyProfitUsd)}   break-even at ${report.breakEvenSubscribers ?? 'n/a'} subscribers\n`,
);
console.table(report.byPlan);
console.table(report.byTier);
