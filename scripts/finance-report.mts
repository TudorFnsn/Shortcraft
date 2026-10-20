/**
 * Finance report: MRR, API cost per tier, cost-to-MRR ratio, read from the
 * Supabase project in `.env.local`. READ-ONLY: it only runs `select`s.
 * Definitions live in `src/features/metrics/finance.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts --fixed-usd 120   (table)
 *      npx tsx scripts/finance-report.mts --fixed-usd 120 --json
 * `--fixed-usd` is monthly hosting + SaaS spend (FinancePlan.md §4); omit it
 * and the profit lines print n/a rather than a guess.
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

const { computeFinance, FINANCE_WINDOW_DAYS } = await import('@/features/metrics/finance');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;
const now = new Date();
const since = new Date(now.getTime() - FINANCE_WINDOW_DAYS * 86_400_000).toISOString();

/** Every row of a select, paged (PostgREST caps a response at 1,000 rows). */
async function selectAll<T>(table: string, columns: string, createdSince?: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = createdSince ? base.gte('created_at', createdSince) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number | null>;
const [subs, jobs] = await Promise.all([
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll<Row>(
    'render_jobs',
    'status, model_tier, api_cost_usd, actual_credits, created_at',
    since,
  ),
]);

const fixedArg = process.argv.indexOf('--fixed-usd');
const fixed = fixedArg > 0 ? Number(process.argv[fixedArg + 1]) : NaN;

const report = computeFinance({
  now,
  subscriptions: subs.map((s) => ({
    userId: String(s.user_id ?? ''),
    planId: String(s.plan_id ?? ''),
    status: String(s.status ?? ''),
  })),
  jobs: jobs.map((j) => ({
    status: String(j.status ?? ''),
    modelTier: String(j.model_tier ?? ''),
    createdAt: new Date(String(j.created_at)),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    actualCredits: Number(j.actual_credits ?? 0),
  })),
  // Top-up revenue comes from Stripe (the ledger stores credits, not euros): pass it in by hand.
  topUpsCents: [],
  fixedCostUsdMonthly: Number.isFinite(fixed) ? fixed : null,
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const na = (v: number | null, f: (n: number) => string) => (v === null ? 'n/a' : f(v));
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
console.log(`Shortcraft finance — as of ${report.asOf} (last ${report.windowDays} days)\n`);
console.log(`Paying subscribers: ${report.payingSubscribers}`, report.subscribersByPlan);
console.log(
  `MRR: €${report.mrrEur} (net $${report.netMrrUsd} after VAT + fees)  ARR: €${report.arrEur}`,
);
console.log(`API cost: $${report.apiCostUsd} (of which failed jobs $${report.failedCostUsd})`);
console.log(
  `Fixed cost: ${na(report.fixedCostUsd, (n) => `$${n}`)}  Total: ${na(report.totalCostUsd, (n) => `$${n}`)}`,
);
console.log(
  `API cost ÷ net MRR: ${na(report.apiCostToMrr, pct)}   Total cost ÷ net MRR: ${na(report.costToMrr, pct)}`,
);
console.log(
  `Margin: ${na(report.marginPct, pct)}   Monthly profit: ${na(report.monthlyProfitUsd, (n) => `$${n}`)}\n`,
);
console.table(report.byTier);
