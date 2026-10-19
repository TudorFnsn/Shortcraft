/**
 * Finance report: MRR, trailing-30-day net revenue vs API cost, cost per
 * finished video, free-trial burn and break-even subscribers, read from the
 * Supabase project in `.env.local`. READ-ONLY: it only runs `select`s (service
 * role, so it sees every user). Definitions live in
 * `src/features/finance/unit-economics.ts`; fixed costs in
 * `src/config/fixed-costs.ts`.
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

const { computeFinance } = await import('@/features/finance/unit-economics');
const { FIXED_COSTS } = await import('@/config/fixed-costs');
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

type Row = Record<string, string | number | null>;
const [jobs, subs, grants] = await Promise.all([
  selectAll<Row>(
    'render_jobs',
    'user_id, status, model_tier, api_cost_usd, charged_credits, created_at',
  ),
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll<Row>('credit_transactions', 'user_id, reason, delta, created_at', {
    column: 'reason',
    in: PAID_GRANT_REASONS,
  }),
]);

const str = (v: string | number | null | undefined) => String(v ?? '');
const num = (v: string | number | null | undefined) => Number(v ?? 0);
const report = computeFinance({
  now: new Date(),
  subscriptions: subs.map((s) => ({
    userId: str(s.user_id),
    planId: str(s.plan_id),
    status: str(s.status),
  })),
  jobs: jobs.map((j) => ({
    userId: str(j.user_id),
    status: str(j.status),
    modelTier: str(j.model_tier),
    createdAt: new Date(str(j.created_at)),
    apiCostUsd: num(j.api_cost_usd),
    chargedCredits: num(j.charged_credits),
  })),
  paidGrants: grants.map((g) => ({
    userId: str(g.user_id),
    reason: str(g.reason),
    delta: num(g.delta),
    createdAt: new Date(str(g.created_at)),
  })),
  fixedCosts: FIXED_COSTS,
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
const { mrr, topUps30d: top, apiCost30d: c, monthly: m, breakEven: b } = report;
console.log(`Shortcraft finance — as of ${report.asOf} (last ${report.windowDays} days)\n`);
console.log(
  `★ MRR: €${mrr.grossEur} gross · ${usd(mrr.netUsd)} net · ${mrr.payingSubscribers} subscribers`,
);
console.log(`  By plan:                  ${JSON.stringify(mrr.byPlan)}`);
console.log(`  Net ARPU:                 ${usd(mrr.arpuNetUsd)}`);
console.log(
  `  Top-ups (30d):            €${top.grossEur} gross · ${usd(top.netUsd)} net · ${top.packs} packs`,
);
console.log(
  `  API cost (30d):           ${usd(c.totalUsd)} (done ${c.done.jobs}, failed ${c.failed.jobs}, other ${c.other.jobs})`,
);
console.log(`  Cost per finished video:  ${usd(c.perDoneVideoUsd)}`);
console.log(`  Cost per 1k credits:      ${usd(c.costPer1kCreditsUsd)}`);
console.log(`  Free-trial burn:          ${usd(c.acquisitionBurnUsd)}`);
console.log(
  `  Wasted on failed jobs:    ${c.wastedShare === null ? 'n/a' : `${(c.wastedShare * 100).toFixed(1)}%`}`,
);
console.log(`  Fixed costs (known):      ${usd(report.fixed.monthlyUsd)}/mo`);
console.log(
  `  Net revenue / API cost:   ${m.revenueMultiple === null ? 'n/a' : `${m.revenueMultiple.toFixed(2)}x`}`,
);
console.log(`  Contribution:             ${usd(m.contributionUsd)}   Profit: ${usd(m.profitUsd)}`);
console.log(
  `  Break-even subscribers:   ${b.subscribersNeeded ?? 'n/a'} (${usd(b.contributionPerSubscriberUsd)} contribution each)\n`,
);
console.table(c.byTier);
for (const f of report.flags) console.log(`⚠ ${f}`);
