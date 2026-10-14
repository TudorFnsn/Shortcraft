/**
 * Finance report: MRR, net ARPU, API spend, wasted spend on failed jobs and cost
 * per tier, read from the Supabase project in `.env.local`. READ-ONLY (selects
 * only). Math lives in `src/features/metrics/unit-economics.ts`.
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

const { computeUnitEconomics } = await import('@/features/metrics/unit-economics');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;
const days = Number(process.argv.find((a) => a.startsWith('--days='))?.slice(7) ?? 30);

async function selectAll(table: string, columns: string, since?: string) {
  const rows: Record<string, string | number>[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = admin.from(table).select(columns);
    if (since) q = q.gte('created_at', since);
    const { data, error } = await q.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as unknown as Record<string, string | number>[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const since = new Date(Date.now() - days * 86_400_000).toISOString();
const [jobs, subs] = await Promise.all([
  selectAll('render_jobs', 'status, model_tier, actual_credits, api_cost_usd, created_at', since),
  selectAll('subscriptions', 'plan_id, status'),
]);

const report = computeUnitEconomics({
  now: new Date(),
  windowDays: days,
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    chargedCredits: Number(j.actual_credits),
    apiCostUsd: Number(j.api_cost_usd),
    createdAt: new Date(String(j.created_at)),
  })),
  subscriptions: subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const { tiers, ...top } = report;
  console.log(`Shortcraft finance — last ${days} days\n`);
  console.table(top);
  console.table(tiers);
}
