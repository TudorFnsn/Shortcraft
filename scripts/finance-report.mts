/**
 * Finance report: MRR, net MRR, API cost per video and cost share of revenue,
 * read from the Supabase project in `.env.local`. READ-ONLY (`select`s only).
 * Math lives in `src/features/metrics/finance.ts`. Provider invoices (fal,
 * ElevenLabs, Anthropic, Vercel, Supabase) are NOT in the DB; the finance
 * routine reads them from their dashboards/connectors and adds them to the plan.
 *
 * Run: npx tsx scripts/finance-report.mts [--json]
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

async function all<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < 1000) return rows;
  }
}

const report = computeFinance(
  await all('subscriptions', 'plan_id, status'),
  await all('render_jobs', 'status, model_tier, target_duration_sec, actual_credits, api_cost_usd'),
);
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  console.log(report);
  console.table(report.byTier);
}
