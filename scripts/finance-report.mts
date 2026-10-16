/**
 * Finance report: MRR, net MRR, API spend vs revenue, MRR-to-cost ratio.
 * READ-ONLY (service-role selects from `.env.local`). Needs no vendor.
 *
 * Fixed monthly costs and measured provider spend are not stored anywhere yet;
 * pass them from the vendor invoices/dashboards:
 *   npx tsx scripts/finance-report.mts --fixed=120 [--api-cost=85] [--json]
 * Without --api-cost, spend is ESTIMATED from credits charged x the catalog's
 * blended cost per credit (marked "estimated").
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

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const num = (v: string | undefined) => (v === undefined ? undefined : Number(v));

const { computeFinance } = await import('@/features/finance/mrr');
const { assessMargins } = await import('@/features/billing/margin');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

const { data: subs, error: e1 } = await admin.from('subscriptions').select('plan_id, status');
if (e1) throw new Error(`subscriptions: ${e1.message}`);

let creditsCharged = 0;
let jobs = 0;
for (let from = 0; ; from += 1000) {
  const { data, error } = await admin
    .from('render_jobs')
    .select('charged_credits')
    .eq('status', 'done')
    .gte('created_at', since)
    .range(from, from + 999);
  if (error) throw new Error(`render_jobs: ${error.message}`);
  for (const j of data ?? []) {
    creditsCharged += Number(j.charged_credits ?? 0);
    jobs += 1;
  }
  if (!data || data.length < 1000) break;
}

// Blended cost per credit: mean of the plans' worst-case cost / credits (conservative).
const m = assessMargins();
const blended =
  m.plans.reduce((s, p) => s + p.worstCaseCostUsd / Math.max(1, p.credits), 0) / m.plans.length;

const report = computeFinance({
  subscriptions: (subs ?? []).map((s) => ({ planId: s.plan_id ?? '', status: s.status ?? '' })),
  creditsCharged,
  blendedUsdPerCredit: blended,
  measuredApiCostUsd: num(arg('api-cost')),
  fixedCostsUsd: num(arg('fixed')) ?? 0,
});
const out = {
  asOf: new Date().toISOString(),
  videos30d: jobs,
  creditsCharged30d: creditsCharged,
  ...report,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 2));
} else {
  const usd = (n: number) => `$${n.toFixed(2)}`;
  console.log(`Shortcraft finance — ${out.asOf}\n`);
  console.log(`Paying subscribers: ${out.payingSubscribers} ${JSON.stringify(out.byPlan)}`);
  console.log(
    `MRR gross €${out.grossMrrEur.toFixed(2)} | net ${usd(out.netMrrUsd)} | ARR ${usd(out.arrNetUsd)}`,
  );
  console.log(`Videos (30d): ${jobs} | credits charged: ${creditsCharged}`);
  console.log(
    `API cost (${out.apiCostSource}): ${usd(out.apiCostUsd)} | fixed: ${usd(out.fixedCostsUsd)}`,
  );
  console.log(`Cost per video: ${jobs ? usd(out.apiCostUsd / jobs) : 'n/a'}`);
  console.log(
    `MRR ÷ cost: ${out.mrrToCostRatio?.toFixed(2) ?? 'n/a'} | gross margin: ${out.grossMarginPct?.toFixed(1) ?? 'n/a'}% | net cash/mo: ${usd(out.burnUsd)}`,
  );
}
