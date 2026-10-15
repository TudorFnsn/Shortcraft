/**
 * Finance report: MRR and per-tier video cost, read from the Supabase project in
 * `.env.local`. READ-ONLY (selects only). Definitions: `src/features/finance/unit-economics.ts`.
 * Provider invoices (fal.ai, ElevenLabs, Anthropic, Vercel, Supabase) are not in the
 * database; the Finance routine reads them from the owner-maintained ledger in FinancePlan.md.
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

const [subs, jobs] = await Promise.all([
  selectAll('subscriptions', 'plan_id, status, created_at'),
  selectAll('render_jobs', 'status, model_tier, created_at, actual_credits, api_cost_usd'),
]);

const report = computeFinance({
  now: new Date(),
  subscriptions: subs.map((s) => ({ planId: s.plan_id ?? '', status: s.status ?? '' })),
  jobs: jobs.map((j) => ({
    status: j.status ?? '',
    modelTier: j.model_tier ?? 'standard',
    createdAt: new Date(j.created_at ?? 0),
    actualCredits: Number(j.actual_credits ?? 0),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
console.log(`Shortcraft finance — as of ${report.asOf}\n`);
console.log(`MRR (gross, EUR): ${report.mrrEur}   paying subscribers: ${report.payingSubscribers}`);
console.table(report.byPlan);
console.log(`Last 30 days: ${JSON.stringify(report.last30d)}`);
console.table(report.tiers);
