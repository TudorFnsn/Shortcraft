/**
 * Finance report: what videos cost us vs what we charged, from the Supabase
 * project in `.env.local`. READ-ONLY (`select`s with the service role).
 *
 * Per model tier (standard / premium) over a window: finished videos, failures,
 * API cost (sum of `render_jobs.api_cost_usd`), credits charged, average cost
 * per finished video, and cost per 1,000 credits charged. The Finance CFO
 * routine pairs this with Stripe revenue (MRR, churn) and the vendor bills.
 *
 * Run: npx tsx scripts/finance-report.mts [--days=30] [--json]
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

const days = Number(process.argv.find((a) => a.startsWith('--days='))?.split('=')[1] ?? 30);
const since = new Date(Date.now() - days * 86_400_000).toISOString();
const PAGE = 1000;

interface Job {
  status: string;
  model_tier: string;
  target_duration_sec: number;
  api_cost_usd: number | string;
  charged_credits: number | string;
}

const jobs: Job[] = [];
for (let from = 0; ; from += PAGE) {
  const { data, error } = await admin
    .from('render_jobs')
    .select('status, model_tier, target_duration_sec, api_cost_usd, charged_credits')
    .gte('created_at', since)
    .order('created_at')
    .range(from, from + PAGE - 1);
  if (error) throw new Error(`render_jobs: ${error.message}`);
  jobs.push(...(data as Job[]));
  if (!data || data.length < PAGE) break;
}

const rows = ['standard', 'premium'].map((tier) => {
  const mine = jobs.filter((j) => j.model_tier === tier);
  const done = mine.filter((j) => j.status === 'done');
  const failed = mine.filter((j) => j.status === 'failed');
  const cost = mine.reduce((s, j) => s + Number(j.api_cost_usd), 0);
  const credits = mine.reduce((s, j) => s + Number(j.charged_credits), 0);
  return {
    tier,
    jobs: mine.length,
    done: done.length,
    failed: failed.length,
    apiCostUsd: Number(cost.toFixed(2)),
    creditsCharged: credits,
    costPerDoneVideoUsd: done.length ? Number((cost / done.length).toFixed(3)) : null,
    costPer1kCreditsUsd: credits ? Number(((cost / credits) * 1000).toFixed(4)) : null,
  };
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ windowDays: days, since, rows }, null, 2));
  process.exit(0);
}
console.log(`Shortcraft finance — last ${days} days (since ${since})\n`);
console.table(rows);
console.log(
  '\nNote: failed jobs still cost money (spent steps are metered, credits refunded). ' +
    'Compare costPer1kCreditsUsd with the catalog in src/config/models.ts.',
);
