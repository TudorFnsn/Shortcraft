/**
 * Finance report: MRR, 30-day API spend, the MRR ratio and cost per video by
 * tier, read from the Supabase project in `.env.local`. READ-ONLY: it only runs
 * `select`s (service role). Definitions live in `src/features/metrics/finance.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts           (table)
 *      npx tsx scripts/finance-report.mts --json    (raw report, for the digest)
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

/** Every row of a select, paged (PostgREST caps a response at 1,000 rows). */
async function selectAll<T>(table: string, columns: string, since?: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = since ? base.gte('created_at', since) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number | null>;
const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
const [subs, jobs] = await Promise.all([
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll<Row>(
    'render_jobs',
    'user_id, status, model_tier, api_cost_usd, charged_credits, created_at',
    since,
  ),
]);

const report = computeFinance({
  now: new Date(),
  subscriptions: subs.map((s) => ({
    userId: String(s.user_id ?? ''),
    planId: String(s.plan_id ?? ''),
    status: String(s.status ?? ''),
  })),
  jobs: jobs.map((j) => ({
    userId: String(j.user_id ?? ''),
    status: String(j.status ?? ''),
    modelTier: String(j.model_tier ?? 'standard'),
    createdAt: new Date(String(j.created_at ?? 0)),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    chargedCredits: Number(j.charged_credits ?? 0),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number) => `$${n.toFixed(2)}`;
console.log(`Shortcraft finance — as of ${report.asOf} (last ${report.windowDays} days)\n`);
console.log(
  `MRR:                      €${report.mrrEur.toFixed(2)}  (ARR €${report.arrEur.toFixed(2)})`,
);
console.log(`Net MRR (after VAT+fees): ${usd(report.netMrrUsd)}`);
console.log(
  `Paying subscribers:       ${report.payingSubscribers}  (ARPU ${report.arpuEur ?? 'n/a'} EUR)`,
);
console.log(
  `API cost (30d):           ${usd(report.apiCostUsd)}  (failed ${usd(report.failedCostUsd)}, in flight ${usd(report.inFlightCostUsd)})`,
);
console.log(
  `MRR ratio (net MRR ÷ API): ${report.mrrRatio ?? 'n/a'}x  (target ${report.targetRatio}x)`,
);
console.log(
  `Cost per 1k credits:      ${report.costPer1kCreditsUsd === null ? 'n/a' : usd(report.costPer1kCreditsUsd)}`,
);
console.log(
  `Non-paying active users:  ${report.freeActiveUsers}  (their API cost ${usd(report.freeUserCostUsd)})\n`,
);
console.table(report.byPlan);
console.table(report.byTier);
