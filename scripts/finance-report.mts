/**
 * Finance report: MRR, measured API cost per video vs the catalog, credits
 * burned per dollar, and measured margin per tier, read from the Supabase
 * project in `.env.local`. READ-ONLY: it only runs `select`s (service role).
 * Vendor invoices (fal.ai, ElevenLabs, Anthropic, Vercel, Supabase) are not
 * in the database; the Finance CEO adds them to FinancePlan.md §4 by hand.
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
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');
const admin = createSupabaseAdminClient();
const PAGE = 1000;

async function selectAll(table: string, columns: string): Promise<Record<string, string>[]> {
  const rows: Record<string, string>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .order('created_at')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as unknown as Record<string, string>[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const [jobs, subs] = await Promise.all([
  selectAll(
    'render_jobs',
    'status, model_tier, target_duration_sec, actual_credits, api_cost_usd, created_at',
  ),
  selectAll('subscriptions', 'plan_id, status'),
]);

// MRR in EUR cents: live subscriptions at list price (no discounts or yearly in the DB).
const live = subs.filter((s) => ['active', 'trialing', 'past_due'].includes(s.status ?? ''));
const mrrCents = live.reduce(
  (sum, s) => sum + (PLANS[(s.plan_id ?? '') as keyof typeof PLANS]?.priceCents ?? 0),
  0,
);

// Measured cost per finished video, by tier; 30-day window and all time.
const since = Date.now() - 30 * 86_400_000;
type Agg = { videos: number; costUsd: number; credits: number; seconds: number };
const agg = (rows: typeof jobs): Record<string, Agg> => {
  const out: Record<string, Agg> = {};
  for (const j of rows.filter((r) => r.status === 'done')) {
    const a = (out[j.model_tier ?? '?'] ??= { videos: 0, costUsd: 0, credits: 0, seconds: 0 });
    a.videos += 1;
    a.costUsd += Number(j.api_cost_usd ?? 0);
    a.credits += Number(j.actual_credits ?? 0);
    a.seconds += Number(j.target_duration_sec ?? 0);
  }
  return out;
};
const failed = jobs.filter((j) => j.status === 'failed').length;
const byTier = (a: Record<string, Agg>) =>
  Object.entries(a).map(([tier, v]) => ({
    tier,
    videos: v.videos,
    apiCostUsd: +v.costUsd.toFixed(2),
    avgCostPerVideoUsd: +(v.costUsd / v.videos).toFixed(3),
    avgCostPerVideoSecUsd: +(v.costUsd / Math.max(1, v.seconds)).toFixed(4),
    creditsPerApiDollar: v.costUsd > 0 ? Math.round(v.credits / v.costUsd) : null,
  }));

const report = {
  asOf: new Date().toISOString(),
  mrrEur: mrrCents / 100,
  liveSubscribers: live.length,
  arpuEur: live.length ? +(mrrCents / 100 / live.length).toFixed(2) : 0,
  apiCostAllTimeUsd: +jobs.reduce((s, j) => s + Number(j.api_cost_usd ?? 0), 0).toFixed(2),
  failedJobs: failed,
  allTime: byTier(agg(jobs)),
  last30d: byTier(agg(jobs.filter((j) => new Date(j.created_at ?? 0).getTime() >= since))),
  note: 'Stripe may be in test mode: MRR here is list price of subscription rows, not cash. Vendor bills are not in the DB.',
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
console.log(`Shortcraft finance — as of ${report.asOf}\n`);
console.log(
  `MRR (list price):  €${report.mrrEur}   subscribers: ${report.liveSubscribers}   ARPU: €${report.arpuEur}`,
);
console.log(
  `API cost all time: $${report.apiCostAllTimeUsd}   failed jobs: ${report.failedJobs}\n`,
);
console.log('Measured cost per finished video — all time');
console.table(report.allTime);
console.log('Last 30 days');
console.table(report.last30d);
console.log(report.note);
