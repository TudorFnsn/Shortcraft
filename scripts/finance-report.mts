/**
 * Finance report: MRR, realized API cost vs credits billed, top-ups, trial burn
 * and the monthly contribution after fixed costs (`docs/finance/costs.json`).
 * READ-ONLY: it only runs `select`s (service role, from `.env.local`).
 * Math lives in `src/features/metrics/finance.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts            (table, last 30 days)
 *      npx tsx scripts/finance-report.mts --json     (raw report, for the digest)
 *      npx tsx scripts/finance-report.mts --days=7
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
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;
const days = Number(process.argv.find((a) => a.startsWith('--days='))?.slice(7) ?? 30);

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
const [subs, jobs, grants] = await Promise.all([
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll<Row>(
    'render_jobs',
    'user_id, status, model_tier, actual_credits, estimated_credits, api_cost_usd, created_at',
  ),
  selectAll<Row>('credit_transactions', 'user_id, reason, delta, created_at', {
    column: 'reason',
    in: ['topup', 'trial_grant'],
  }),
]);

const fixedCosts = JSON.parse(readFileSync(resolve('docs/finance/costs.json'), 'utf8')) as {
  items: Record<string, number | null>;
};

const report = computeFinance({
  now: new Date(),
  windowDays: days,
  fixedCosts,
  subscriptions: subs.map((s) => ({
    userId: String(s.user_id),
    planId: String(s.plan_id),
    status: String(s.status),
  })),
  jobs: jobs.map((j) => ({
    userId: String(j.user_id),
    status: String(j.status),
    modelTier: String(j.model_tier),
    actualCredits: Number(j.actual_credits),
    estimatedCredits: Number(j.estimated_credits),
    apiCostUsd: Number(j.api_cost_usd),
    createdAt: new Date(String(j.created_at)),
  })),
  grants: grants.map((g) => ({
    userId: String(g.user_id),
    reason: String(g.reason),
    delta: Number(g.delta),
    createdAt: new Date(String(g.created_at)),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const eur = (n: number) => `€${n.toFixed(2)}`;
const usd = (n: number) => `$${n.toFixed(2)}`;
console.log(`Shortcraft finance — as of ${report.asOf} (last ${report.windowDays}d)\n`);
console.log(
  `MRR:                      ${eur(report.mrrEur)} (net of VAT+fees ${eur(report.netMrrEur)})`,
);
console.log(
  `Paying subscribers:       ${report.payingSubscribers}  ARPU ${report.arpuEur === null ? 'n/a' : eur(report.arpuEur)}`,
);
console.log(
  `Top-ups (window):         ${report.topUpPacksSold} packs, ${eur(report.topUpRevenueEur)}`,
);
console.log(`Realized API cost:        ${usd(report.apiCostUsd)}`);
console.log(
  `Realized margin multiple: ${report.realizedMarginMultiple ?? 'n/a'}x (target ${report.marginTargetMultiple}x)`,
);
console.log(`Trial credits granted:    ${report.trialCreditsGranted}`);
console.log(
  `Fixed costs:              ${usd(report.fixedCostsUsd)}${report.missingFixedCosts.length ? `  (MISSING: ${report.missingFixedCosts.join(', ')})` : ''}`,
);
console.log(`Monthly contribution:     ${usd(report.monthlyContributionUsd)}`);
console.log(`Break-even subscribers:   ${report.breakEvenSubscribers ?? 'n/a'}\n`);
console.table(report.byPlan);
console.table(report.byTier);
