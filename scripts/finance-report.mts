/**
 * Finance report: MRR, net revenue, API cost per video, waste and gross margin,
 * read from the Supabase project in `.env.local`. READ-ONLY (`select`s only).
 * Definitions live in `src/features/metrics/finance.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts                       (table, 30 days)
 *      npx tsx scripts/finance-report.mts --days=7 --json       (raw, for the digest)
 *      FIXED_MONTHLY_COST_USD=85 npx tsx scripts/finance-report.mts
 *        (fixed costs: hosting + Supabase + ElevenLabs plan + domains; see FinancePlan §4)
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

const { computeFinance } = await import('@/features/metrics/finance');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

async function selectAll(
  table: string,
  columns: string,
  eq?: { column: string; value: string },
): Promise<Record<string, string>[]> {
  const rows: Record<string, string>[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = eq ? base.eq(eq.column, eq.value) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as unknown as Record<string, string>[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const daysArg = process.argv.find((a) => a.startsWith('--days='));
const windowDays = daysArg ? Number(daysArg.slice(7)) : 30;
if (!Number.isFinite(windowDays) || windowDays <= 0) throw new Error('--days must be positive');

const [jobs, subs, topUps] = await Promise.all([
  selectAll('render_jobs', 'status, model_tier, api_cost_usd, created_at'),
  selectAll('subscriptions', 'plan_id, status, created_at'),
  selectAll('credit_transactions', 'delta, created_at', { column: 'reason', value: 'topup' }),
]);

const report = computeFinance({
  now: new Date(),
  windowDays,
  fixedMonthlyCostUsd: Number(process.env.FIXED_MONTHLY_COST_USD ?? 0),
  jobs: jobs.map((j) => ({
    status: j.status ?? '',
    modelTier: j.model_tier ?? 'standard',
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    createdAt: new Date(j.created_at ?? 0),
  })),
  subscriptions: subs.map((s) => ({ planId: s.plan_id ?? '', status: s.status ?? '' })),
  topUps: topUps.map((t) => ({ credits: Number(t.delta), createdAt: new Date(t.created_at ?? 0) })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
console.log(`Shortcraft finance — as of ${report.asOf} (window ${report.windowDays}d)\n`);
console.log(
  `★ MRR:                     €${report.mrrEur}  (${report.payingSubscribers} subscribers)`,
);
console.log(`  Net MRR (after VAT+fees): ${usd(report.netMrrUsd)}`);
console.log(`  Top-ups (window):         €${report.topUpRevenueEur}`);
console.log(`  Net revenue (window):     ${usd(report.revenueNetUsd)}`);
console.log(
  `  API cost (window):        ${usd(report.apiCostUsd)}  (wasted on unfinished: ${usd(report.wastedApiCostUsd)})`,
);
console.log(
  `  Gross margin:             ${usd(report.grossMarginUsd)}  (${pct(report.grossMarginPct)})`,
);
console.log(
  `  Fixed costs (window):     ${usd(report.fixedCostUsd)}  (set FIXED_MONTHLY_COST_USD)`,
);
console.log(`  Contribution:             ${usd(report.contributionUsd)}`);
console.log(`  Videos finished:          ${report.videosFinished}\n`);
console.table(report.byTier);
console.table(report.byPlan);
