/**
 * Finance report: MRR, 30-day cash in vs API cost, cost per video, free-trial
 * burn and break-even subscribers, read from the Supabase project in
 * `.env.local`. READ-ONLY: it only runs `select`s (service role).
 * Definitions live in `src/features/metrics/finance.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts [--fixed=<USD per month>]   (table)
 *      npx tsx scripts/finance-report.mts --json                      (for the digest)
 *
 * `--fixed` (or FIXED_MONTHLY_USD) is the monthly total of non-per-video costs:
 * Vercel, Supabase, ElevenLabs plan, Sentry, Resend, domain. See FinancePlan §4.
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
const { PAID_GRANT_REASONS } = await import('@/features/billing/entitlements');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

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
const [subs, jobs, ledger] = await Promise.all([
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll<Row>(
    'render_jobs',
    'user_id, status, model_tier, api_cost_usd, actual_credits, created_at',
  ),
  selectAll<Row>('credit_transactions', 'user_id, reason, delta, created_at', {
    column: 'reason',
    in: PAID_GRANT_REASONS,
  }),
]);

const fixedArg = process.argv.find((a) => a.startsWith('--fixed='))?.slice(8);
const fixedMonthlyUsd = Number(fixedArg ?? process.env.FIXED_MONTHLY_USD ?? 0) || 0;
const s = (v: string | number | undefined) => String(v ?? '');

const report = computeFinance({
  now: new Date(),
  fixedMonthlyUsd,
  subscriptions: subs.map((r) => ({
    userId: s(r.user_id),
    planId: s(r.plan_id),
    status: s(r.status),
  })),
  jobs: jobs.map((r) => ({
    userId: s(r.user_id),
    status: s(r.status),
    createdAt: new Date(s(r.created_at)),
    apiCostUsd: Number(r.api_cost_usd),
    actualCredits: Number(r.actual_credits),
    modelTier: s(r.model_tier),
  })),
  topUps: ledger
    .filter((r) => r.reason === 'topup')
    .map((r) => ({
      userId: s(r.user_id),
      credits: Number(r.delta),
      createdAt: new Date(s(r.created_at)),
    })),
  paidUserIds: new Set(ledger.map((r) => s(r.user_id))),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
console.log(`Shortcraft finance — as of ${report.asOf} (last 30 days)\n`);
console.log(
  `★ MRR:                     €${report.mrrGrossEur} gross · ${usd(report.mrrNetUsd)} net`,
);
console.log(
  `  Paying subscribers:      ${report.payingSubscribers} (ARPU ${usd(report.arpuNetUsd)} net)`,
);
console.log(`  Top-ups (30d, net):      ${usd(report.topUpRevenueNetUsd30d)}`);
console.log(`  Cash in (30d, net):      ${usd(report.cashInNetUsd30d)}`);
console.log(
  `  API cost (30d):          ${usd(report.apiCostUsd30d)} (free users: ${usd(report.freeUserApiCostUsd30d)})`,
);
console.log(
  `  Fixed costs (month):     ${usd(report.fixedMonthlyUsd)}${fixedMonthlyUsd ? '' : '  ← pass --fixed=<USD>'}`,
);
console.log(`  Contribution (30d):      ${usd(report.contributionUsd30d)}`);
console.log(
  `  Gross margin:            ${report.grossMargin === null ? 'n/a' : `${(report.grossMargin * 100).toFixed(1)}%`}`,
);
console.log(`  Break-even subscribers:  ${report.breakEvenSubscribers ?? 'n/a'}`);
console.log(`  Videos done / failed:    ${report.videosDone30d} / ${report.failedJobs30d}`);
console.log(
  `  API cost per video:      ${usd(report.costPerVideoUsd)}  ·  credits charged per API $: ${report.creditsPerApiUsd ?? 'n/a'}`,
);
if (report.unpricedTopUps30d)
  console.log(`  ⚠ ${report.unpricedTopUps30d} top-up(s) match no pack: not priced`);
console.table(report.byTier);
console.table(report.byPlan);
