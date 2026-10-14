/**
 * Unit-economics report for the Finance CFO routine: MRR from active
 * subscriptions, measured API cost per finished video (render_jobs.api_cost_usd)
 * vs credits charged, and cost split by model tier. READ-ONLY (selects only).
 * Fixed costs (Vercel, Supabase, ElevenLabs plan, ...) are not in the DB: the
 * routine adds them from the provider connectors / invoices.
 *
 * Run: npx tsx scripts/finance-report.mts           (table)
 *      npx tsx scripts/finance-report.mts --json    (raw, for the digest)
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

const { PLANS } = await import('@/config/plans');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;
const DAY = 86_400_000;

async function selectAll<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .order('created_at')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number | null>;
const [subs, jobs] = await Promise.all([
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll<Row>(
    'render_jobs',
    'status, model_tier, target_duration_sec, actual_credits, api_cost_usd, created_at',
  ),
]);

// Plan prices are EUR; the report stays in EUR for revenue and USD for API cost, as in the catalog.
const active = subs.filter((s) => s.status === 'active' || s.status === 'trialing');
const mrrEurCents = active.reduce(
  (sum, s) => sum + (PLANS[s.plan_id as keyof typeof PLANS]?.priceCents ?? 0),
  0,
);
const byPlan: Record<string, number> = {};
for (const s of active) byPlan[String(s.plan_id)] = (byPlan[String(s.plan_id)] ?? 0) + 1;

const since = Date.now() - 30 * DAY;
const recent = jobs.filter((j) => new Date(String(j.created_at)).getTime() >= since);
const done = recent.filter((j) => j.status === 'done');
const tiers: Record<string, { videos: number; costUsd: number; credits: number; seconds: number }> =
  {};
for (const j of done) {
  const t = (tiers[String(j.model_tier)] ??= { videos: 0, costUsd: 0, credits: 0, seconds: 0 });
  t.videos += 1;
  t.costUsd += Number(j.api_cost_usd);
  t.credits += Number(j.actual_credits);
  t.seconds += Number(j.target_duration_sec);
}
const failed = recent.filter((j) => j.status === 'failed');
const failedCostUsd = failed.reduce((s, j) => s + Number(j.api_cost_usd), 0);
const totalCostUsd = recent.reduce((s, j) => s + Number(j.api_cost_usd), 0);

const report = {
  asOf: new Date().toISOString(),
  mrrEur: mrrEurCents / 100,
  arrEur: (mrrEurCents * 12) / 100,
  activeSubscribers: active.length,
  subscribersByPlan: byPlan,
  last30d: {
    jobs: recent.length,
    finishedVideos: done.length,
    failedJobs: failed.length,
    apiCostUsdTotal: Number(totalCostUsd.toFixed(2)),
    apiCostUsdWastedOnFailed: Number(failedCostUsd.toFixed(2)),
    byTier: Object.fromEntries(
      Object.entries(tiers).map(([k, t]) => [
        k,
        {
          videos: t.videos,
          apiCostUsd: Number(t.costUsd.toFixed(2)),
          avgCostPerVideoUsd: Number((t.costUsd / t.videos).toFixed(3)),
          avgCostPerVideoSecUsd: Number((t.costUsd / t.seconds).toFixed(4)),
          creditsCharged: t.credits,
        },
      ]),
    ),
  },
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
console.log(`Shortcraft finance — as of ${report.asOf}\n`);
console.log(`MRR: €${report.mrrEur.toFixed(2)}  (ARR €${report.arrEur.toFixed(2)})`);
console.log(`Active subscribers: ${report.activeSubscribers}`, byPlan);
console.log(`\nLast 30 days: ${JSON.stringify({ ...report.last30d, byTier: undefined })}`);
console.table(report.last30d.byTier);
