/**
 * FinOps report: MRR, real API cost per video and realised margin, read from the
 * Supabase project in `.env.local`. READ-ONLY: it only runs `select`s (service role).
 *
 * MRR is computed from live subscriptions x the catalog price (`config/plans.ts`).
 * Realised margin compares what jobs really cost (`render_jobs.api_cost_usd`) with
 * the net revenue per credit, and with the 3x gate in `features/billing/margin.ts`.
 *
 * Run: npx tsx scripts/finops-report.mts           (table)
 *      npx tsx scripts/finops-report.mts --json    (raw report, for the digest)
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
const { netRevenueUsd, assessMargins } = await import('@/features/billing/margin');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;
const DAY = 86_400_000;

async function selectAll<T>(table: string, columns: string, since?: Date): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = admin.from(table).select(columns);
    if (since) q = q.gte('created_at', since.toISOString());
    const { data, error } = await q.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number>;
const now = new Date();
const since30 = new Date(now.getTime() - 30 * DAY);
const [subs, jobs30, tx30] = await Promise.all([
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at, current_period_end'),
  selectAll<Row>(
    'render_jobs',
    'status, model_tier, target_duration_sec, actual_credits, api_cost_usd, created_at',
    since30,
  ),
  selectAll<Row>('credit_transactions', 'reason, delta, created_at', since30),
]);

// ── MRR (net of VAT + Stripe fees, USD, same assumptions as the margin gate) ──
const live = subs.filter((s) =>
  isLiveSubscription({ planId: String(s.plan_id), status: String(s.status) } as never),
);
const byPlan = Object.values(PLANS).map((p) => {
  const n = live.filter((s) => s.plan_id === p.id).length;
  return {
    plan: p.id,
    subscribers: n,
    grossMrrEur: (n * p.priceCents) / 100,
    netMrrUsd: n * netRevenueUsd(p.priceCents),
  };
});
const grossMrrEur = byPlan.reduce((a, r) => a + r.grossMrrEur, 0);
const netMrrUsd = byPlan.reduce((a, r) => a + r.netMrrUsd, 0);
const topUps30 = tx30.filter((t) => t.reason === 'topup').length;

// ── Cost of the last 30 days ──────────────────────────────────────────────────
const done = jobs30.filter((j) => j.status === 'done');
const costUsd = (rows: Row[]) => rows.reduce((a, j) => a + Number(j.api_cost_usd), 0);
const credits = (rows: Row[]) => rows.reduce((a, j) => a + Number(j.actual_credits), 0);
const tier = (t: string) => done.filter((j) => j.model_tier === t);
const failed = jobs30.filter((j) => j.status === 'failed');

const margins = assessMargins();
const report = {
  asOf: now.toISOString(),
  mrr: { grossEur: grossMrrEur, netUsd: netMrrUsd, subscribers: live.length, byPlan, topUps30 },
  last30d: {
    jobs: jobs30.length,
    finished: done.length,
    failed: failed.length,
    apiCostUsd: costUsd(jobs30),
    apiCostPerFinishedVideoUsd: done.length ? costUsd(done) / done.length : null,
    standard: { videos: tier('standard').length, costUsd: costUsd(tier('standard')) },
    premium: {
      videos: tier('premium').length,
      costUsd: costUsd(tier('premium')),
      costPerVideoUsd: tier('premium').length
        ? costUsd(tier('premium')) / tier('premium').length
        : null,
    },
    creditsSpent: credits(done),
    realisedUsdPerCredit: credits(done) ? costUsd(done) / credits(done) : null,
    // Cost of jobs that failed after spending provider money (refunded to the user = pure loss).
    failedJobCostUsd: costUsd(failed),
  },
  grossMarginPct: netMrrUsd > 0 ? (1 - costUsd(jobs30) / netMrrUsd) * 100 : null,
  marginGate: { ok: margins.ok, trialCostUsd: margins.trialCostUsd },
  notes: [
    'Hosting, ElevenLabs/Anthropic invoices and Supabase/Vercel plan fees are NOT in the database: read them from the vendor dashboards/connectors and add them in FinancePlan.md section 3.',
    'Anthropic tokens are not stored per job (only the dollar cost); see FinancePlan.md section 6 (gap G1).',
  ],
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
console.log(`Shortcraft FinOps — as of ${report.asOf}\n`);
console.log(
  `★ MRR: €${grossMrrEur.toFixed(2)} gross / ${usd(netMrrUsd)} net  (${live.length} subscribers)`,
);
console.log(`  Top-ups (30d):                 ${topUps30}`);
console.log(`  Jobs 30d: ${jobs30.length} (finished ${done.length}, failed ${failed.length})`);
console.log(`  API cost 30d:                  ${usd(report.last30d.apiCostUsd)}`);
console.log(`  API cost / finished video:     ${usd(report.last30d.apiCostPerFinishedVideoUsd)}`);
console.log(`  Premium cost / video:          ${usd(report.last30d.premium.costPerVideoUsd)}`);
console.log(`  Cost wasted on failed jobs:    ${usd(report.last30d.failedJobCostUsd)}`);
console.log(
  `  Gross margin (net MRR - API):  ${report.grossMarginPct === null ? 'n/a' : report.grossMarginPct.toFixed(1) + '%'}`,
);
console.log(`  Margin gate:                   ${margins.ok ? 'PASS' : 'FAIL'}\n`);
console.table(byPlan);
for (const n of report.notes) console.log(`note: ${n}`);
