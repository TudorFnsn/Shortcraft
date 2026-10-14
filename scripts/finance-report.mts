/**
 * Finance report: net MRR, ARPU, API cost per finished video, gross margin and
 * break-even, read from the Supabase project in `.env.local`. READ-ONLY.
 * Fixed costs come from `src/config/finance.ts` (owner-maintained).
 * Math lives in `src/features/finance/unit-economics.ts`.
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

const { computeFinance } = await import('@/features/finance/unit-economics');
const { FIXED_COSTS } = await import('@/config/finance');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

async function selectAll(table: string, columns: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .order('created_at')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const [subs, jobs] = await Promise.all([
  selectAll('subscriptions', 'plan_id, status, created_at'),
  selectAll('render_jobs', 'status, created_at, api_cost_usd, actual_credits'),
]);

const report = computeFinance({
  now: new Date(),
  subscriptions: subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    createdAt: new Date(String(j.created_at)),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    actualCredits: Number(j.actual_credits ?? 0),
  })),
  fixedCosts: FIXED_COSTS,
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
console.log(`Shortcraft finance — as of ${report.asOf} (last ${report.windowDays}d)\n`);
console.log(`★ Net MRR:                 ${usd(report.mrrNetUsd)}  (ARR ${usd(report.arrNetUsd)})`);
console.log(`  Paying subscribers:      ${report.subscribers}  (ARPU ${usd(report.arpuNetUsd)})`);
console.log(`  Videos finished:         ${report.videosFinished}`);
console.log(`  API cost / video:        ${usd(report.apiCostPerVideoUsd)}`);
console.log(`  API cost / 1k credits:   ${usd(report.apiCostPer1kCreditsUsd)}`);
console.log(`  API cost (failed jobs):  ${usd(report.failedCostUsd)}`);
console.log(`  Gross margin:            ${report.grossMarginPct?.toFixed(1) ?? 'n/a'}%`);
console.log(`  Fixed costs known:       ${usd(report.fixedCostsKnownUsd)}/mo`);
console.log(`  Fixed costs MISSING:     ${report.fixedCostsUnknown.join(', ') || 'none'}`);
console.log(`  Break-even net MRR:      ${usd(report.breakEvenMrrUsd)}`);
console.log(`  Monthly net (est.):      ${usd(report.monthlyNetUsd)}\n`);
console.table(report.byPlan);
