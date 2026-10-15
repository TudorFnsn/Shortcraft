/**
 * Finance report for the CFO routine: MRR, API spend vs credits burned, cost per
 * finished video by tier, money lost on failed jobs, and realised margin.
 * READ-ONLY: only `select`s (service role, from `.env.local`). Stripe fees, hosting
 * and SaaS bills are not in the database: the routine reads them from the Stripe
 * and Vercel connectors and the cost register in FinancePlan.md.
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

const { PLANS } = await import('@/config/plans');
const { isLiveSubscription } = await import('@/features/billing/entitlements');
const { REVENUE_ASSUMPTIONS } = await import('@/features/billing/margin');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;
type Row = Record<string, string | number | null>;

async function selectAll(table: string, columns: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .order('created_at')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as unknown as Row[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const [jobs, subs] = await Promise.all([
  selectAll('render_jobs', 'status, model_tier, actual_credits, api_cost_usd, created_at'),
  selectAll('subscriptions', 'plan_id, status, created_at'),
]);

const a = REVENUE_ASSUMPTIONS;
const netUsd = (cents: number) => {
  const gross = cents / 100;
  return (
    (gross / (1 + a.vatRate) - (gross * a.stripePercentFee + a.stripeFixedFeeEur)) * a.usdPerEur
  );
};

const now = new Date();
let grossMrrEur = 0;
let netMrrUsd = 0;
const byPlan: Record<string, number> = {};
for (const s of subs) {
  const plan = PLANS[String(s.plan_id) as keyof typeof PLANS];
  const live = isLiveSubscription({ planId: String(s.plan_id), status: String(s.status) });
  if (!plan || !live) continue;
  grossMrrEur += plan.priceCents / 100;
  netMrrUsd += netUsd(plan.priceCents);
  byPlan[plan.id] = (byPlan[plan.id] ?? 0) + 1;
}

const monthAgo = now.getTime() - 30 * 86_400_000;
const recent = jobs.filter((j) => new Date(String(j.created_at)).getTime() >= monthAgo);
const sum = (rows: Row[], k: string) => rows.reduce((t, r) => t + Number(r[k] ?? 0), 0);
const done = recent.filter((j) => j.status === 'done');
const failed = recent.filter((j) => j.status === 'failed');
const tier = (t: string) => done.filter((j) => j.model_tier === t);
const avg = (rows: Row[]) => (rows.length ? sum(rows, 'api_cost_usd') / rows.length : 0);

const apiSpend30d = sum(recent, 'api_cost_usd');
const report = {
  asOf: now.toISOString(),
  grossMrrEur,
  netMrrUsd,
  livePayingSubscribers: Object.values(byPlan).reduce((t, n) => t + n, 0),
  subscribersByPlan: byPlan,
  last30d: {
    jobs: recent.length,
    finished: done.length,
    failed: failed.length,
    apiSpendUsd: apiSpend30d,
    apiSpendOnFailedUsd: sum(failed, 'api_cost_usd'),
    creditsBurned: sum(done, 'actual_credits'),
    avgCostPerVideoUsd: { standard: avg(tier('standard')), premium: avg(tier('premium')) },
    usdPerMillionCredits: sum(done, 'actual_credits')
      ? (sum(done, 'api_cost_usd') / sum(done, 'actual_credits')) * 1e6
      : null,
  },
  apiSpendShareOfNetMrr: netMrrUsd ? apiSpend30d / netMrrUsd : null,
  note: 'Excludes fixed costs (Vercel, Supabase, ElevenLabs/fal plans, Sentry, domain): see FinancePlan.md §4.',
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
const usd = (n: number) => `$${n.toFixed(2)}`;
console.log(`Shortcraft finance — as of ${report.asOf}\n`);
console.log(`MRR: €${grossMrrEur.toFixed(2)} gross · ${usd(netMrrUsd)} net of VAT + Stripe fees`);
console.log(`Paying subscribers: ${report.livePayingSubscribers} ${JSON.stringify(byPlan)}`);
console.log(
  `Last 30d: ${report.last30d.finished} finished, ${report.last30d.failed} failed of ${report.last30d.jobs}`,
);
console.log(
  `API spend: ${usd(apiSpend30d)} (of which on failed jobs: ${usd(report.last30d.apiSpendOnFailedUsd)})`,
);
console.log(
  `Avg API cost / finished video: standard ${usd(report.last30d.avgCostPerVideoUsd.standard)}, premium ${usd(report.last30d.avgCostPerVideoUsd.premium)}`,
);
console.log(
  `API spend as share of net MRR: ${report.apiSpendShareOfNetMrr === null ? 'n/a (no MRR)' : `${(report.apiSpendShareOfNetMrr * 100).toFixed(0)}%`}`,
);
console.log(`\n${report.note}`);
