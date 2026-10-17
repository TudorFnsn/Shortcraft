/**
 * Finance report: MRR, our measured API cost, and the real margin, read from
 * the Supabase project in `.env.local`. READ-ONLY (`select`s with the service
 * role). The Finance CEO routine runs this first; see `FinancePlan.md`.
 *
 * MRR is plan price × live subscriptions (EUR, gross of VAT and Stripe fees).
 * Cost is `render_jobs.api_cost_usd` as metered by the orchestrator. Cost that
 * is not on a job (script/voice-design calls outside jobs, hosting, SaaS
 * plans) is NOT here: the routine adds it from Vercel/Supabase/ElevenLabs/etc.
 *
 * Run: npx tsx scripts/finance-report.mts           (tables)
 *      npx tsx scripts/finance-report.mts --json    (raw, for the digest)
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

const { PLANS } = await import('@/config/plans');
const { isLiveSubscription } = await import('@/features/billing/entitlements');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;
const DAY = 86_400_000;

async function selectAll(table: string, columns: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .order('created_at')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as unknown as Record<string, unknown>[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const [jobs, subs] = await Promise.all([
  selectAll(
    'render_jobs',
    'status, model_tier, target_duration_sec, api_cost_usd, charged_credits, created_at',
  ),
  selectAll('subscriptions', 'plan_id, status'),
]);

const now = Date.now();
const num = (v: unknown) => Number(v ?? 0) || 0;

// ── MRR ─────────────────────────────────────────────────────────────────────
const live = subs
  .map((s) => ({ planId: String(s.plan_id ?? ''), status: String(s.status ?? '') }))
  .filter(isLiveSubscription);
const byPlan = Object.values(PLANS).map((p) => {
  const n = live.filter((s) => s.planId === p.id).length;
  return { plan: p.name, subscribers: n, mrrEur: (n * p.priceCents) / 100 };
});
const mrrEur = byPlan.reduce((a, r) => a + r.mrrEur, 0);

// ── Cost per window and per tier ────────────────────────────────────────────
function window(days: number) {
  const from = now - days * DAY;
  const inWin = jobs.filter((j) => new Date(String(j.created_at)).getTime() >= from);
  const done = inWin.filter((j) => j.status === 'done');
  const failed = inWin.filter((j) => j.status === 'failed');
  const cost = (rows: typeof jobs) => rows.reduce((a, j) => a + num(j.api_cost_usd), 0);
  return {
    days,
    jobs: inWin.length,
    finished: done.length,
    failed: failed.length,
    apiCostUsd: +cost(inWin).toFixed(2),
    costPerFinishedUsd: done.length ? +(cost(inWin) / done.length).toFixed(3) : null,
    wastedOnFailedUsd: +cost(failed).toFixed(2),
    creditsCharged: inWin.reduce((a, j) => a + num(j.charged_credits), 0),
  };
}

const tiers = ['standard', 'premium'].map((tier) => {
  const rows = jobs.filter((j) => j.model_tier === tier && num(j.charged_credits) > 0);
  const cost = rows.reduce((a, j) => a + num(j.api_cost_usd), 0);
  const credits = rows.reduce((a, j) => a + num(j.charged_credits), 0);
  return {
    tier,
    jobs: rows.length,
    apiCostUsd: +cost.toFixed(2),
    creditsCharged: credits,
    usdPer1kCredits: credits ? +((cost / credits) * 1000).toFixed(4) : null,
  };
});

const w30 = window(30);
const report = {
  asOf: new Date(now).toISOString(),
  mrrEur,
  byPlan,
  last7d: window(7),
  last30d: w30,
  tiers,
  // Rough: EUR→USD treated 1:1 and VAT/Stripe fees ignored; use margin.ts for net figures.
  grossMarginPct30d: mrrEur ? +(((mrrEur - w30.apiCostUsd) / mrrEur) * 100).toFixed(1) : null,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log(`Shortcraft finance — as of ${report.asOf}\n`);
console.log(`★ MRR: €${mrrEur.toFixed(2)}  (30d metered API cost: $${w30.apiCostUsd})`);
console.log(`  Gross margin on MRR vs 30d API cost: ${report.grossMarginPct30d ?? 'n/a'}%\n`);
console.table(byPlan);
console.table([report.last7d, report.last30d]);
console.table(tiers);
