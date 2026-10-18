/**
 * Finance report: MRR, net revenue, API spend, cost per video by tier and cash
 * margin, read from the Supabase project in `.env.local`.
 * READ-ONLY: it only runs `select`s (service role). Definitions live in
 * `src/features/finance/finance.ts`; fixed costs in `src/config/fixed-costs.ts`.
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

const { computeFinance } = await import('@/features/finance/finance');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

async function selectAll<T>(table: string, columns: string, eq?: [string, string]): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = eq ? base.eq(eq[0], eq[1]) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number | null>;
const [subs, jobs, topups] = await Promise.all([
  selectAll<Row>('subscriptions', 'plan_id, status, created_at'),
  selectAll<Row>(
    'render_jobs',
    'status, model_tier, target_duration_sec, api_cost_usd, actual_credits, created_at',
  ),
  selectAll<Row>('credit_transactions', 'delta, created_at', ['reason', 'topup']),
]);

const report = computeFinance({
  now: new Date(),
  subscriptions: subs.map((s) => ({
    planId: String(s.plan_id ?? ''),
    status: String(s.status ?? ''),
  })),
  jobs: jobs.map((j) => ({
    status: String(j.status ?? ''),
    modelTier: String(j.model_tier ?? 'standard'),
    targetDurationSec: Number(j.target_duration_sec ?? 0),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    chargedCredits: Number(j.actual_credits ?? 0),
    createdAt: new Date(String(j.created_at)),
  })),
  topUps: topups.map((t) => ({
    credits: Number(t.delta ?? 0),
    createdAt: new Date(String(t.created_at)),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const pct = (n: number | null) => (n === null ? 'n/a' : `${n}%`);
console.log(`Shortcraft finance — as of ${report.asOf} (last ${report.windowDays} days)\n`);
console.log(
  `MRR            €${report.mrrEur}  (ARR €${report.arrEur}, ${report.payingSubscribers} subscribers: ` +
    `${report.subscribersByPlan.starter} Starter / ${report.subscribersByPlan.pro} Pro / ${report.subscribersByPlan.ultra} Ultra)`,
);
console.log(`Net MRR        $${report.netMrrUsd}  (after VAT + Stripe fees)`);
console.log(
  `Top-ups (net)  $${report.topUpRevenueNetUsd}  (${report.topUpsMatched} matched, ${report.topUpsUnmatched} unmatched)`,
);
console.log(
  `API spend      $${report.apiSpendUsd}  (wasted on failed jobs: $${report.wastedSpendUsd})`,
);
console.log(
  `Fixed (known)  $${report.fixedKnownUsd}  (unknown: ${report.fixedUnknown.join(', ') || 'none'})`,
);
console.log(
  `Cash profit    $${report.cashProfitUsd}  margin ${pct(report.cashMarginPct)}  revenue/API ${report.revenueToApiSpend ?? 'n/a'}x\n`,
);
console.log(`Videos: ${report.doneVideos} done, ${report.failedVideos} failed`);
for (const t of report.byTier) {
  console.log(
    `  ${t.tier.padEnd(9)} ${t.videos} videos · $${t.avgCostPerVideoUsd}/video · ${t.avgCreditsPerVideo} cr/video · ${t.creditsPerApiUsd} cr per API $`,
  );
}
