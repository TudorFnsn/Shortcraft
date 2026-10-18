/**
 * Finance report: MRR, realised API cost per finished video, gross margin and
 * credit utilisation, read from the Supabase project in `.env.local`.
 * READ-ONLY: it only runs `select`s (service role). Math lives in
 * `src/features/finance/unit-economics.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts                    (table, 30 days)
 *      npx tsx scripts/finance-report.mts --days 7 --json    (raw report)
 *      FIXED_MONTHLY_COSTS_USD=45 npx tsx scripts/finance-report.mts
 *        (hosting + DB + email + monitoring; not stored anywhere, so pass it in)
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
const { TOPUP_PACKS } = await import('@/config/plans');
const { REVENUE_ASSUMPTIONS } = await import('@/features/billing/margin');
const { netMonthlyUsd } = await import('@/features/finance/unit-economics');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const daysArg = process.argv.indexOf('--days');
const windowDays = daysArg > -1 ? Number(process.argv[daysArg + 1]) : 30;
if (!Number.isFinite(windowDays) || windowDays <= 0) throw new Error('--days must be positive');
const now = new Date();
const since = new Date(now.getTime() - windowDays * 86_400_000).toISOString();

const admin = createSupabaseAdminClient();
const PAGE = 1000;

interface Where {
  since: string;
  reasons?: readonly string[];
}

/** Rows since `where.since`, paged (PostgREST caps a response at 1,000 rows). */
async function selectAll<T>(table: string, columns: string, where?: Where): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = admin.from(table).select(columns);
    if (where) q = q.gte('created_at', where.since);
    if (where?.reasons) q = q.in('reason', [...where.reasons]);
    const { data, error } = await q.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as unknown as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number>;
const [jobs, subs, grants] = await Promise.all([
  selectAll<Row>(
    'render_jobs',
    'user_id, status, model_tier, created_at, api_cost_usd, estimated_credits, actual_credits, target_duration_sec',
    { since },
  ),
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll<Row>('credit_transactions', 'delta, reason, created_at', {
    since,
    reasons: ['monthly_grant', 'topup'],
  }),
]);

const packByCredits = new Map(TOPUP_PACKS.map((p) => [p.credits, p]));
const topUpRevenueUsd = grants
  .filter((g) => g.reason === 'topup')
  .reduce((sum, g) => {
    const pack = packByCredits.get(Number(g.delta));
    // One-off charge: same VAT + fee treatment as a monthly charge.
    return sum + (pack ? netMonthlyUsd(pack.priceCents, REVENUE_ASSUMPTIONS) : 0);
  }, 0);

const report = computeFinance({
  now,
  windowDays,
  paidGrantCredits: grants.reduce((s, g) => s + Number(g.delta), 0),
  topUpRevenueUsd,
  fixedMonthlyCostsUsd: Number(process.env.FIXED_MONTHLY_COSTS_USD ?? 0),
  jobs: jobs.map((j) => ({
    userId: String(j.user_id ?? ''),
    status: String(j.status ?? ''),
    modelTier: String(j.model_tier ?? ''),
    createdAt: new Date(String(j.created_at ?? 0)),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    estimatedCredits: Number(j.estimated_credits ?? 0),
    actualCredits: Number(j.actual_credits ?? 0),
    targetDurationSec: Number(j.target_duration_sec ?? 0),
  })),
  subscriptions: subs.map((s) => ({
    userId: String(s.user_id ?? ''),
    planId: String(s.plan_id ?? ''),
    status: String(s.status ?? ''),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
console.log(`Shortcraft finance — ${report.windowDays} days to ${report.asOf}\n`);
console.log(`★ MRR (net of VAT + fees):  ${usd(report.mrrNetUsd)}  (ARR ${usd(report.arrNetUsd)})`);
console.log(
  `  Paying subscribers:        ${report.payingSubscribers}  ${JSON.stringify(report.subscribersByPlan)}`,
);
console.log(`  ARPU (net):                ${usd(report.arpuNetUsd)}`);
console.log(`  API spend (window):        ${usd(report.apiCostUsd)}`);
console.log(
  `  Gross margin:              ${usd(report.grossMarginUsd)}  (${pct(report.grossMarginPct)})`,
);
console.log(
  `  Realised revenue/cost:     ${report.realisedMultiple?.toFixed(2) ?? 'n/a'}x  (gate target 3x)`,
);
console.log(`  Spend on non-payers:       ${pct(report.freeUserCostShare)}`);
console.log(`  Credit utilisation:        ${pct(report.creditUtilisation)}\n`);
console.table(
  report.tiers.map((t) => ({
    tier: t.tier,
    finished: t.finished,
    failed: t.failed,
    apiCost: usd(t.apiCostUsd),
    perFinished: usd(t.avgCostPerFinishedUsd),
    wasted: usd(t.wastedCostUsd),
  })),
);
