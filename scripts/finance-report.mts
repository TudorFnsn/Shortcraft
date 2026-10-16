/**
 * Finance report: MRR, 30-day API spend, cost per video and gross margin, read
 * from the Supabase project in `.env.local`. READ-ONLY (`select`s, service role).
 * Definitions live in `src/features/finance/unit-economics.ts`. Provider
 * invoices (fal.ai, ElevenLabs, Anthropic, Vercel, Supabase) and real Stripe
 * cash are NOT in the database: the Finance routine reads those separately.
 *
 * Run: npx tsx scripts/finance-report.mts           (table)
 *      npx tsx scripts/finance-report.mts --json    (for the digest)
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

const { computeUnitEconomics } = await import('@/features/finance/unit-economics');
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
  selectAll('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll('render_jobs', 'status, model_tier, created_at, api_cost_usd, charged_credits'),
]);

const report = computeUnitEconomics({
  now: new Date(),
  subscriptions: subs.map((s) => ({
    userId: String(s.user_id),
    planId: String(s.plan_id),
    status: String(s.status),
  })),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    createdAt: new Date(String(j.created_at)),
    apiCostUsd: Number(j.api_cost_usd),
    chargedCredits: Number(j.charged_credits),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
const usd = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
console.log(`Shortcraft finance — ${new Date().toISOString()}\n`);
console.log(`Paying subscribers:      ${report.payingSubscribers}`);
console.log(`MRR (gross, EUR):        €${report.mrrGrossEur.toFixed(2)}`);
console.log(`MRR (net of VAT+fees):   ${usd(report.mrrNetUsd)}`);
console.log(`API spend, last 30d:     ${usd(report.apiCost30dUsd)}`);
console.log(`Videos finished, 30d:    ${report.videos30d}`);
console.log(`Avg API cost per video:  ${usd(report.avgCostPerVideoUsd)}`);
console.log(`Credits per API dollar:  ${report.creditsPerApiUsd.toFixed(0)}`);
console.log(`MRR ÷ API spend:         ${report.mrrToCostMultiple?.toFixed(2) ?? 'n/a'}x`);
console.log(`Gross margin (MRR−API):  ${pct(report.grossMargin)}`);
console.log(`API spend by tier:       ${JSON.stringify(report.costByTier)}`);
