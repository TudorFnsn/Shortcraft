/**
 * Finance report: MRR, net revenue, metered API cost and gross margin, read from
 * the Supabase project in `.env.local`. READ-ONLY: it only runs `select`s
 * (service role, so it sees every user). Definitions live in
 * `src/features/metrics/finance.ts`; the worst-case price gate is
 * `scripts/margin-report.mts`.
 *
 * Run: npx tsx scripts/finance-report.mts [--days=30]   (table)
 *      npx tsx scripts/finance-report.mts --json        (raw report, for the digest)
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
const { PAID_GRANT_REASONS } = await import('@/features/billing/entitlements');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

/** Every row of a select, paged (PostgREST caps a response at 1,000 rows). */
async function selectAll<T>(
  table: string,
  columns: string,
  where?: { column: string; in: readonly string[] },
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = where ? base.in(where.column, [...where.in]) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number>;
const [jobs, subs, grants] = await Promise.all([
  selectAll<Row>(
    'render_jobs',
    'user_id, status, model_tier, created_at, api_cost_usd, actual_credits',
  ),
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll<Row>('credit_transactions', 'user_id, delta, reason, created_at', {
    column: 'reason',
    in: PAID_GRANT_REASONS,
  }),
]);

const daysArg = process.argv.find((a) => a.startsWith('--days='));
const windowDays = Math.max(1, Number(daysArg?.slice(7)) || 30);

const report = computeFinance({
  now: new Date(),
  windowDays,
  subscriptions: subs.map((s) => ({
    userId: String(s.user_id ?? ''),
    planId: String(s.plan_id ?? ''),
    status: String(s.status ?? ''),
  })),
  jobs: jobs.map((j) => ({
    userId: String(j.user_id ?? ''),
    status: String(j.status ?? ''),
    modelTier: String(j.model_tier ?? 'standard'),
    createdAt: new Date(j.created_at ?? 0),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    actualCredits: Number(j.actual_credits ?? 0),
  })),
  topUps: grants
    .filter((g) => g.reason === 'topup')
    .map((g) => ({
      userId: String(g.user_id ?? ''),
      credits: Number(g.delta ?? 0),
      createdAt: new Date(g.created_at ?? 0),
    })),
  paidUserIds: new Set(grants.map((g) => String(g.user_id ?? ''))),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number) => `$${n.toFixed(2)}`;
console.log(`Shortcraft finance — last ${report.windowDays}d, as of ${report.asOf}\n`);
console.log(
  `MRR (gross, EUR):     €${report.mrrGrossEur.toFixed(2)}   ${JSON.stringify(report.subscribersByPlan)}`,
);
console.log(`MRR (net, USD):       ${usd(report.mrrNetUsd)}`);
console.log(`Top-ups (net, USD):   ${usd(report.topUpNetUsd)}`);
console.log(`Revenue (net, USD):   ${usd(report.revenueNetUsd)}`);
console.log(
  `API cost:             ${usd(report.apiCostUsd)}  (free users ${usd(report.freeApiCostUsd)}, failed jobs ${usd(report.failedApiCostUsd)})`,
);
console.log(`Gross profit:         ${usd(report.grossProfitUsd)}`);
console.log(
  `Revenue / API cost:   ${report.marginMultiple === null ? 'n/a' : `${report.marginMultiple}x (gate: 3x)`}\n`,
);
console.table(report.tiers);
console.log(
  '\nNot in this report (no data path yet): Vercel, Supabase, Sentry, Resend and domain bills; ' +
    'per-provider/per-token cost (only the per-job total is stored); Stripe refunds/disputes/churn. See FinancePlan.md §5.',
);
