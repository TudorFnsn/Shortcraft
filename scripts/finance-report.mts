/**
 * Finance report: MRR, 30-day API spend, cost per video by tier, wasted spend
 * on failed jobs, fixed costs and profit. READ-ONLY (selects only, service role
 * from `.env.local`). Definitions: `src/features/finance/unit-economics.ts`.
 * Fixed costs come from `src/config/fixed-costs.ts` (owner-maintained).
 *
 * Run: npx tsx scripts/finance-report.mts           (table)
 *      npx tsx scripts/finance-report.mts --json    (raw report, for the digest)
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
const { FIXED_COSTS } = await import('@/config/fixed-costs');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');
const { summarizeBreakdowns } = await import('@/features/finance/cost-breakdown');
type CostBreakdown = import('@/features/finance/cost-breakdown').CostBreakdown;

const admin = createSupabaseAdminClient();
const PAGE = 1000;

async function selectAll(
  table: string,
  columns: string,
  eq?: { column: string; value: string },
): Promise<Record<string, string | number>[]> {
  const rows: Record<string, string | number>[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = eq ? base.eq(eq.column, eq.value) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as unknown as Record<string, string | number>[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const JOB_COLUMNS = 'status, model_tier, api_cost_usd, actual_credits, created_at';
/** Jobs with their per-step cost (0014); without it on a database that predates it. */
async function selectJobs() {
  try {
    return await selectAll('render_jobs', `${JOB_COLUMNS}, cost_breakdown`);
  } catch (e) {
    if (!String(e).includes('cost_breakdown')) throw e;
    return selectAll('render_jobs', JOB_COLUMNS);
  }
}

const [subs, jobs, topups] = await Promise.all([
  selectAll('subscriptions', 'plan_id, status, created_at'),
  selectJobs(),
  selectAll('credit_transactions', 'delta, created_at', { column: 'reason', value: 'topup' }),
]);

const report = computeFinance({
  now: new Date(),
  subscriptions: subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    createdAt: new Date(String(j.created_at)),
    apiCostUsd: Number(j.api_cost_usd),
    actualCredits: Number(j.actual_credits),
  })),
  topups: topups.map((t) => ({
    credits: Number(t.delta),
    createdAt: new Date(String(t.created_at)),
  })),
  fixedCosts: FIXED_COSTS,
});

// Per-step split of the window's jobs (only those rendered after 0014 have one).
const since = Date.now() - report.windowDays * 86_400_000;
const steps = summarizeBreakdowns(
  jobs
    .filter((j) => new Date(String(j.created_at)).getTime() >= since)
    .map((j) => (j as { cost_breakdown?: CostBreakdown }).cost_breakdown),
);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ...report, steps }, null, 2));
  process.exit(0);
}

const usd = (n: number) => `$${n.toFixed(2)}`;
console.log(`Shortcraft finance — as of ${report.asOf} (last ${report.windowDays} days)\n`);
console.log(
  `MRR gross:           €${report.mrrGrossEur.toFixed(2)} (${report.payingSubscribers} subscribers)`,
);
console.log(`MRR net (VAT+fees):  ${usd(report.mrrNetUsd)}`);
console.log(
  `Top-ups net (30d):   ${usd(report.topupNetUsd)}${report.unpricedTopups ? ` (+${report.unpricedTopups} unpriced)` : ''}`,
);
console.log(`Net revenue:         ${usd(report.netRevenueUsd)}`);
console.log(
  `API cost (30d):      ${usd(report.apiCostUsd)}  = ${report.apiCostShare ?? 'n/a'} of net revenue`,
);
console.log(
  `Fixed costs:         ${usd(report.fixedCostsUsd)}${report.unknownFixedCosts.length ? `  UNKNOWN: ${report.unknownFixedCosts.join(', ')}` : ''}`,
);
console.log(
  `Profit (30d):        ${usd(report.profitUsd)}   cost ratio ${report.costRatio ?? 'n/a'} (below 1 = profit)\n`,
);
console.table(report.tiers);

console.log(
  `\nCost by step (${steps.jobsWithBreakdown} jobs with a breakdown, ${usd(steps.usd)}):`,
);
if (steps.steps.length === 0) console.log('  none yet (needs migration 0014 and new renders)');
else
  console.table(
    steps.steps.map((s) => ({
      step: s.step,
      providers: s.providers.join(', '),
      usd: usd(s.usd),
      share: `${Math.round(s.share * 100)}%`,
      perJob: usd(s.usdPerJob),
      usage: Object.entries(s.usage)
        .map(([k, v]) => `${k} ${v}`)
        .join(', '),
    })),
  );
