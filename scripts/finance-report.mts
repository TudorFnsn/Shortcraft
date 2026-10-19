/**
 * Finance report: MRR vs real spend (API cost per job, per tier, plus the fixed
 * monthly bills you pass in). READ-ONLY: it only runs `select`s (service role).
 * Definitions live in `src/features/finance/unit-economics.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts [--days 30] [--fixed "Vercel=20,Supabase=25,ElevenLabs=22"] [--json]
 * `--fixed` is name=USD/month pairs; the database cannot know hosting bills.
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
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const windowDays = Number(arg('--days') ?? 30);
const fixedCosts = (arg('--fixed') ?? '')
  .split(',')
  .filter(Boolean)
  .map((pair) => {
    const [name = '', usd = '0'] = pair.split('=');
    return { name: name.trim(), usdPerMonth: Number(usd) };
  });

const admin = createSupabaseAdminClient();
const PAGE = 1000;

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

type Row = Record<string, string | number>;
const [jobs, subs] = await Promise.all([
  selectAll<Row>(
    'render_jobs',
    'status, model_tier, target_duration_sec, api_cost_usd, actual_credits, created_at',
  ),
  selectAll<Row>('subscriptions', 'plan_id, status, created_at'),
]);

const report = computeFinance({
  now: new Date(),
  windowDays,
  fixedCosts,
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    targetDurationSec: Number(j.target_duration_sec),
    apiCostUsd: Number(j.api_cost_usd),
    actualCredits: Number(j.actual_credits),
    createdAt: new Date(String(j.created_at)),
  })),
  subscriptions: subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const { tiers, ...summary } = report;
console.log(`Shortcraft finance — last ${windowDays} days\n`);
console.table(summary);
console.table(tiers);
if (fixedCosts.length === 0) console.log('No --fixed costs given: MRR/cost ignores hosting bills.');
