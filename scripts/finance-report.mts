/**
 * Finance report: MRR, API spend, wasted spend, cost per finished video and
 * whether MRR covers burn, read from the Supabase project in `.env.local`.
 * READ-ONLY: it only runs `select`s (service role, so it sees every user).
 * Definitions live in `src/features/finance/unit-economics.ts`; recurring
 * bills in `src/config/fixed-costs.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts [--days=30]          (table)
 *      npx tsx scripts/finance-report.mts --json               (raw, for the digest)
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
const { TOPUP_PACKS } = await import('@/config/plans');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;
const daysArg = process.argv.find((a) => a.startsWith('--days='));
const windowDays = daysArg ? Number(daysArg.split('=')[1]) : 30;
if (!Number.isFinite(windowDays) || windowDays <= 0) throw new Error('--days must be > 0');
const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();

type Row = Record<string, string | number | null>;

/** Every row of a select, paged (PostgREST caps a response at 1,000 rows). */
async function selectAll(table: string, columns: string, sinceCol?: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = sinceCol ? base.gte(sinceCol, since) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const [subs, jobs, topups] = await Promise.all([
  selectAll('subscriptions', 'plan_id, status'),
  selectAll(
    'render_jobs',
    'status, model_tier, created_at, api_cost_usd, actual_credits',
    'created_at',
  ),
  selectAll('credit_transactions', 'delta, reason, created_at', 'created_at'),
]);

// Top-up revenue in the window: match each top-up grant to the pack with that many credits.
const packByCredits = new Map(TOPUP_PACKS.map((p) => [p.credits, p.priceCents]));
const oneOffRevenueEurCents = topups
  .filter((t) => t.reason === 'topup')
  .reduce((s, t) => s + (packByCredits.get(Number(t.delta)) ?? 0), 0);

const report = computeFinance({
  now: new Date(),
  windowDays,
  subscriptions: subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    createdAt: new Date(String(j.created_at)),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    actualCredits: Number(j.actual_credits ?? 0),
  })),
  oneOffRevenueEurCents,
  fixedCosts: FIXED_COSTS,
});

const unknownFixed = FIXED_COSTS.filter((c) => c.usdPerMonth === 0).map((c) => c.name);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ...report, unknownFixedCosts: unknownFixed }, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
console.log(`Shortcraft finance — last ${report.windowDays}d, as of ${report.asOf}\n`);
console.log(
  `MRR (net of VAT + fees):  ${usd(report.netMrrUsd)}  (gross €${report.grossMrrEur})  ARR ${usd(report.arrNetUsd)}`,
);
console.log(
  `Paying subscribers:       ${report.payingSubscribers}  ${JSON.stringify(report.byPlan)}`,
);
console.log(
  `API spend:                ${usd(report.apiCostUsd)}  (wasted on failed jobs ${usd(report.wastedApiCostUsd)})`,
);
console.log(`Fixed costs (scaled):     ${usd(report.fixedCostUsd)}`);
console.log(`Burn:                     ${usd(report.burnUsd)}`);
console.log(
  `Contribution:             ${usd(report.contributionUsd)}  coverage ${report.coverage ?? 'n/a'}x`,
);
console.log(
  `API share of MRR:         ${report.apiShareOfMrr === null ? 'n/a' : `${(report.apiShareOfMrr * 100).toFixed(1)}%`}`,
);
console.log(`Finished / failed videos: ${report.finishedVideos} / ${report.failedVideos}`);
console.log(`Cost per finished video:  ${usd(report.costPerFinishedVideoUsd)}\n`);
console.table(report.tiers);
if (unknownFixed.length > 0) {
  console.log(
    `\nFixed costs still at $0 in src/config/fixed-costs.ts (owner to fill): ${unknownFixed.join('; ')}`,
  );
}
