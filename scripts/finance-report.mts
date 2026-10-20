/**
 * Finance report: MRR, cost per finished video by tier, failed-render waste,
 * gross margin and fixed costs, from the Supabase project in `.env.local`.
 * READ-ONLY: it only runs `select`s (service role). Math: `features/finance`.
 *
 * Top-up revenue is not on the DB side as money (the ledger holds credits), so
 * pass it from Stripe: --topups-eur=<gross EUR in the window>. Default 0.
 *
 * Run: npx tsx scripts/finance-report.mts [--days=30] [--eur-usd=1.08] [--topups-eur=0] [--json]
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

const flag = (name: string, fallback: number): number => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  const n = hit ? Number(hit.split('=')[1]) : fallback;
  if (!Number.isFinite(n)) throw new Error(`--${name} must be a number`);
  return n;
};

const { computeFinance } = await import('@/features/finance/unit-economics');
const { REVENUE_ASSUMPTIONS } = await import('@/features/billing/margin');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;
const days = flag('days', 30);
const eurUsd = flag('eur-usd', REVENUE_ASSUMPTIONS.usdPerEur);
const since = new Date(Date.now() - days * 86_400_000);

/** Every row of a select, paged (PostgREST caps a response at 1,000 rows). */
async function selectAll<T>(table: string, columns: string, sinceIso?: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = sinceIso ? base.gte('created_at', sinceIso) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number | null>;
const [jobs, subs] = await Promise.all([
  selectAll<Row>(
    'render_jobs',
    'status, model_tier, target_duration_sec, charged_credits, api_cost_usd, created_at',
    since.toISOString(),
  ),
  selectAll<Row>('subscriptions', 'plan_id, status, created_at'),
]);

const report = computeFinance({
  since,
  eurUsd,
  topUpRevenueCents: Math.round(flag('topups-eur', 0) * 100),
  jobs: jobs.map((j) => ({
    status: String(j.status ?? ''),
    modelTier: String(j.model_tier ?? ''),
    targetDurationSec: Number(j.target_duration_sec ?? 0),
    chargedCredits: Number(j.charged_credits ?? 0),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    createdAt: new Date(String(j.created_at ?? 0)),
  })),
  subscriptions: subs.map((s) => ({
    planId: String(s.plan_id ?? ''),
    status: String(s.status ?? ''),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ days, eurUsd, ...report }, null, 2));
  process.exit(0);
}

const usd = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
console.log(`Shortcraft finance — last ${days} days, EUR→USD ${eurUsd}\n`);
console.log(
  `MRR:                     €${report.mrrEur.toFixed(2)} (${usd(report.mrrUsd)}), ${report.liveSubscribers} live subscribers`,
);
console.log(`Top-up revenue:          ${usd(report.topUpRevenueUsd)} (from --topups-eur)`);
console.log(
  `Jobs in window:          ${report.jobsInWindow} (${report.failedJobs} failed, ${usd(report.failedCostUsd)} spent on them)`,
);
console.log(`Variable API cost:       ${usd(report.variableCostUsd)}`);
console.log(
  `Earned revenue (credits settled, cheapest-plan rate): ${usd(report.earnedRevenueUsd)}`,
);
console.log(`Gross margin on usage:   ${pct(report.grossMargin)}`);
console.log(
  `Fixed costs / month:     ${usd(report.fixedCostUsdPerMonth)}${report.unknownFixedCosts.length ? ` + unknown: ${report.unknownFixedCosts.join(', ')}` : ''}\n`,
);
console.table(
  report.tiers.map((t) => ({
    tier: t.tier,
    videos: t.doneVideos,
    avgCost: t.avgCostUsd === null ? 'n/a' : usd(t.avgCostUsd),
    avgCredits: t.avgCredits === null ? 'n/a' : Math.round(t.avgCredits),
    avgSec: t.avgDurationSec === null ? 'n/a' : t.avgDurationSec.toFixed(1),
    costPerSec: t.costPerSecondUsd === null ? 'n/a' : `$${t.costPerSecondUsd.toFixed(4)}`,
  })),
);
