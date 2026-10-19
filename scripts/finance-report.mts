/**
 * Finance report: API cost per finished video (by tier) vs credits burned, plus
 * the margin gate. READ-ONLY (service-role `select`s from `.env.local`).
 * Revenue side (MRR, churn, refunds) comes from Stripe, not this script.
 *
 * Run: npx tsx scripts/finance-report.mts [--days 30] [--json]
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
const { assessMargins } = await import('@/features/billing/margin');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const daysArg = process.argv.indexOf('--days');
const days = daysArg > -1 ? Number(process.argv[daysArg + 1]) || 30 : 30;
const admin = createSupabaseAdminClient();
const PAGE = 1000;

type Row = Record<string, string | number>;
const rows: Row[] = [];
for (let from = 0; ; from += PAGE) {
  const { data, error } = await admin
    .from('render_jobs')
    .select('status, model_tier, target_duration_sec, actual_credits, api_cost_usd, created_at')
    .order('created_at')
    .range(from, from + PAGE - 1);
  if (error) throw new Error(`render_jobs: ${error.message}`);
  rows.push(...(data as Row[]));
  if (!data || data.length < PAGE) break;
}

const econ = computeUnitEconomics(
  rows.map((r) => ({
    status: String(r.status),
    modelTier: String(r.model_tier),
    targetDurationSec: Number(r.target_duration_sec),
    actualCredits: Number(r.actual_credits),
    apiCostUsd: Number(r.api_cost_usd),
    createdAt: new Date(String(r.created_at)),
  })),
  new Date(),
  days,
);
const gate = assessMargins();

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ econ, gateOk: gate.ok, trialCostUsd: gate.trialCostUsd }, null, 2));
  process.exit(0);
}
console.log(`Unit economics, last ${days}d`);
console.log(
  `Finished ${econ.finished}, failed ${econ.failed} (lost $${econ.failedCostUsd}); total API spend $${econ.totalApiCostUsd}`,
);
console.table(econ.tiers);
console.log(
  `Margin gate: ${gate.ok ? 'PASS' : 'FAIL'}; trial burn per signup $${gate.trialCostUsd.toFixed(2)}`,
);
