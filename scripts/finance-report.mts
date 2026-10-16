/**
 * Finance report: MRR, variable API cost per tier, wasted spend on failed jobs,
 * and monthly profit/coverage once fixed costs are given. Same data path as
 * `metrics-report.mts`: read-only selects with the service role from `.env.local`.
 * Math lives in `src/features/finance/unit-economics.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts [--days=30] [--fixed="Vercel=0,Supabase=0,ElevenLabs=22"] [--json]
 * `--fixed` is monthly USD per vendor, read from the vendor dashboards.
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

const { computeFinance } = await import('@/features/finance/unit-economics');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

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

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const windowDays = Math.max(1, Number(arg('days') ?? 30) || 30);
const fixedCosts = (arg('fixed') ?? '')
  .split(',')
  .filter(Boolean)
  .map((p) => {
    const [name = '', usd = '0'] = p.split('=');
    return { name, monthlyUsd: Number(usd) || 0 };
  });

type Row = Record<string, string | number | null>;
const [jobs, subs] = await Promise.all([
  selectAll<Row>('render_jobs', 'status, model_tier, api_cost_usd, actual_credits, created_at'),
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
]);

const report = computeFinance({
  now: new Date(),
  windowDays,
  fixedCosts,
  jobs: jobs.map((j) => ({
    status: String(j.status ?? ''),
    createdAt: new Date(String(j.created_at ?? 0)),
    modelTier: String(j.model_tier ?? 'standard'),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    actualCredits: Number(j.actual_credits ?? 0),
  })),
  subscriptions: subs.map((s) => ({
    userId: String(s.user_id ?? ''),
    planId: String(s.plan_id ?? ''),
    status: String(s.status ?? ''),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
console.log(`Shortcraft finance — as of ${report.asOf} (variable cost window: ${windowDays}d)\n`);
console.log(`★ MRR: €${report.mrrGrossEur} gross · $${report.mrrNetUsd} net of VAT + Stripe fees`);
console.log(`  Paying subscribers:      ${report.payingSubscribers}`, report.subscribersByPlan);
console.log(
  `  API cost (window):       $${report.variableCostUsd}  → $${report.variableCostMonthlyUsd}/month`,
);
console.log(`  Wasted on failed jobs:   $${report.wastedCostUsd}`);
console.log(
  `  Fixed costs given:       $${report.fixedCostUsd}/month${fixedCosts.length ? '' : ' (none passed: use --fixed)'}`,
);
console.log(`  Monthly profit:          $${report.monthlyProfitUsd}`);
console.log(
  `  Coverage (net MRR ÷ cost): ${report.coverage ?? 'n/a'}x   API cost ÷ net MRR: ${pct(report.costToMrr)}`,
);
console.log(`  Credits charged per $ API cost (finished): ${report.creditsPerUsd ?? 'n/a'}\n`);
console.table(report.tiers);
