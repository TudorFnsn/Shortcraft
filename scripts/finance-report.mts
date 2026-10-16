/**
 * Finance report: MRR, net MRR (after VAT + Stripe fees), API cost per finished
 * video by tier, failed-job spend and fixed-cost coverage, read from the Supabase
 * project in `.env.local`. READ-ONLY (`select`s only). Math: `features/finance`.
 *
 * Run: npx tsx scripts/finance-report.mts [--fixed-usd=40] [--json]
 * `--fixed-usd` is the monthly fixed bill (Vercel + Supabase + ElevenLabs plan + ...).
 * Token counts are not stored yet (see FinancePlan §6); cost here is `api_cost_usd`.
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
const { isLiveSubscription } = await import('@/features/billing/entitlements');
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

type Row = Record<string, string | number | null>;
const [subs, jobs] = await Promise.all([
  selectAll<Row>('subscriptions', 'plan_id, status, created_at'),
  selectAll<Row>('render_jobs', 'status, model_tier, api_cost_usd, charged_credits, created_at'),
]);

const fixedArg = process.argv.find((a) => a.startsWith('--fixed-usd='));
const report = computeFinance({
  subs: subs.map((s) => ({
    planId: String(s.plan_id ?? ''),
    live: isLiveSubscription({
      planId: String(s.plan_id ?? ''),
      status: String(s.status ?? ''),
    }),
  })),
  jobs: jobs.map((j) => ({
    status: String(j.status ?? ''),
    modelTier: String(j.model_tier ?? 'standard'),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    chargedCredits: Number(j.charged_credits ?? 0),
  })),
  fixedCostsUsd: fixedArg ? Number(fixedArg.split('=')[1]) : 0,
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
console.log(`Shortcraft finance — ${new Date().toISOString()}\n`);
console.log(`MRR (gross, EUR):        ${report.mrrEur}   ARR: ${report.arrEur}`);
console.log(`Net MRR (USD):           ${report.netMrrUsd}`);
console.log(
  `Paying subscribers:      ${report.payingSubscribers}   ARPU: ${report.arpuEur ?? 'n/a'}`,
);
console.log(
  `API cost, all time:      $${report.apiCostUsd}  (failed jobs: $${report.failedCostUsd})`,
);
console.log(
  `Fixed costs / coverage:  $${report.fixedCostsUsd} / ${report.fixedCostCoverage ?? 'n/a'}x\n`,
);
console.table(report.tiers);
