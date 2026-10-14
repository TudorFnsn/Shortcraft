/**
 * Finance report: what the videos cost us (api_cost_usd metered per job) versus
 * the credits they burned, by quality tier, plus spend on failed jobs and a
 * 4-week trend. READ-ONLY (`select`s with the service role from `.env.local`).
 * Revenue, Stripe fees, refunds and MRR come from the Stripe connector, not here;
 * the FinOps routine joins the two (see FinancePlan.md §4).
 *
 * Run: npx tsx scripts/finance-report.mts           (table)
 *      npx tsx scripts/finance-report.mts --json    (for the digest)
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

const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');
const admin = createSupabaseAdminClient();
const PAGE = 1000;

type Job = {
  status: string;
  model_tier: string;
  target_duration_sec: number;
  actual_credits: number;
  api_cost_usd: number;
  created_at: string;
};

const jobs: Job[] = [];
for (let from = 0; ; from += PAGE) {
  const { data, error } = await admin
    .from('render_jobs')
    .select('status, model_tier, target_duration_sec, actual_credits, api_cost_usd, created_at')
    .order('created_at')
    .range(from, from + PAGE - 1);
  if (error) throw new Error(`render_jobs: ${error.message}`);
  jobs.push(...(data as Job[]));
  if (!data || data.length < PAGE) break;
}

const round = (n: number, d = 4) => Number(n.toFixed(d));
const week = (iso: string) => {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

function summarize(rows: Job[]) {
  const done = rows.filter((j) => j.status === 'done');
  const failed = rows.filter((j) => j.status === 'failed');
  const cost = (xs: Job[]) => xs.reduce((s, j) => s + Number(j.api_cost_usd), 0);
  const credits = done.reduce((s, j) => s + Number(j.actual_credits), 0);
  return {
    jobs: rows.length,
    done: done.length,
    failed: failed.length,
    apiCostUsd: round(cost(rows), 2),
    wastedOnFailedUsd: round(cost(failed), 2),
    avgCostPerVideoUsd: done.length ? round(cost(done) / done.length) : null,
    avgCreditsPerVideo: done.length ? Math.round(credits / done.length) : null,
    // dollars of API spend per 1,000 credits burned: compare with 1 / (plan credits per euro)
    usdPer1kCredits: credits ? round((cost(done) / credits) * 1000) : null,
  };
}

const byTier: Record<string, ReturnType<typeof summarize>> = {};
for (const tier of [...new Set(jobs.map((j) => j.model_tier))]) {
  byTier[tier] = summarize(jobs.filter((j) => j.model_tier === tier));
}
const weeks = [...new Set(jobs.map((j) => week(j.created_at)))].sort().slice(-4);
const trend = weeks.map((w) => ({
  week: w,
  ...summarize(jobs.filter((j) => week(j.created_at) === w)),
}));

const report = { asOf: new Date().toISOString(), all: summarize(jobs), byTier, trend };

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
console.log(`Shortcraft finance (API side) — as of ${report.asOf}\n`);
console.table({ all: report.all, ...byTier });
console.table(trend);
