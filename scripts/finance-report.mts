/**
 * Finance report: MRR, net MRR, metered API cost, gross margin and profit from
 * the Supabase project in `.env.local`. READ-ONLY (selects only).
 * Definitions live in `src/features/metrics/finance.ts`.
 *
 * Fixed monthly costs (hosting, SaaS plans) aren't in the database: pass them as
 *   --fixed "Vercel=20,ElevenLabs=22,Supabase=25"   (USD per month)
 *
 * Run: npx tsx scripts/finance-report.mts [--fixed ...] [--json]
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

const { computeFinance } = await import('@/features/metrics/finance');
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
    rows.push(...(data as unknown as Record<string, string>[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const fixedArg = process.argv.indexOf('--fixed');
const fixedCosts = (fixedArg > 0 ? (process.argv[fixedArg + 1] ?? '') : '')
  .split(',')
  .filter(Boolean)
  .map((pair) => {
    const [name = '', usd = '0'] = pair.split('=');
    return { name, monthlyUsd: Number(usd) || 0 };
  });

const [subs, jobs] = await Promise.all([
  selectAll('subscriptions', 'plan_id, status, created_at'),
  selectAll('render_jobs', 'status, created_at, api_cost_usd, charged_credits'),
]);

const report = computeFinance({
  now: new Date(),
  subscriptions: subs.map((s) => ({ planId: s.plan_id ?? '', status: s.status ?? '' })),
  jobs: jobs.map((j) => ({
    status: j.status ?? '',
    createdAt: new Date(j.created_at ?? 0),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    chargedCredits: Number(j.charged_credits ?? 0),
  })),
  fixedCosts,
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
console.log(`Shortcraft finance — as of ${report.asOf}\n`);
console.log(`MRR (EUR, list):          €${report.mrrEur.toFixed(2)}`);
console.log(`Net MRR (after VAT+fees): ${usd(report.netMrrUsd)}`);
console.log(`API cost, last 30d:       ${usd(report.apiCostUsd30d)}`);
console.log(`  of which failed jobs:   ${usd(report.failedCostUsd30d)}`);
console.log(`Fixed costs / month:      ${usd(report.fixedCostsUsd)}`);
console.log(`Monthly profit:           ${usd(report.monthlyProfitUsd)}`);
console.log(`Gross margin:             ${pct(report.grossMargin)}`);
console.log(`Videos done (30d):        ${report.videosDone30d}`);
console.log(`Cost per finished video:  ${usd(report.costPerVideoUsd)}`);
console.log(`Credits per API dollar:   ${report.creditsPerApiUsd?.toFixed(0) ?? 'n/a'}\n`);
console.table(report.byPlan);
