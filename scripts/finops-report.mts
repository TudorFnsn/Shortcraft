/**
 * FinOps report: MRR, 30-day API spend, cost per video and cash margin, read
 * from the Supabase project in `.env.local`. READ-ONLY: it only runs `select`s
 * (service role). Definitions live in `src/features/metrics/finops.ts`; fixed
 * monthly costs come from `docs/routines/fixed-costs.json`.
 *
 * Run: npx tsx scripts/finops-report.mts           (table)
 *      npx tsx scripts/finops-report.mts --json    (raw report, for the digest)
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

const { computeFinops } = await import('@/features/metrics/finops');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

/** Every row of a select, paged (PostgREST caps a response at 1,000 rows). */
async function selectAll<T>(
  table: string,
  columns: string,
  where?: { column: string; in: readonly string[] },
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = where ? base.in(where.column, [...where.in]) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string>;
const [jobs, subs, topUps] = await Promise.all([
  selectAll<Row>('render_jobs', 'status, model_tier, api_cost_usd, actual_credits, created_at'),
  selectAll<Row>('subscriptions', 'plan_id, status, created_at'),
  selectAll<Row>('credit_transactions', 'delta, created_at', { column: 'reason', in: ['topup'] }),
]);

const fixedFile = resolve('docs/routines/fixed-costs.json');
const fixedRaw: Record<string, unknown> = existsSync(fixedFile)
  ? JSON.parse(readFileSync(fixedFile, 'utf8'))
  : {};
const fixedCostsUsd = Object.fromEntries(
  Object.entries(fixedRaw).filter(([k, v]) => !k.startsWith('_') && typeof v === 'number'),
) as Record<string, number>;

const date = (s: string | undefined) => new Date(s ?? 0);
const report = computeFinops({
  now: new Date(),
  fixedCostsUsd,
  subscriptions: subs.map((s) => ({ planId: s.plan_id ?? '', status: s.status ?? '' })),
  topUps: topUps.map((t) => ({ credits: Number(t.delta), createdAt: date(t.created_at) })),
  jobs: jobs.map((j) => ({
    status: j.status ?? '',
    modelTier: j.model_tier ?? 'standard',
    apiCostUsd: Number(j.api_cost_usd),
    actualCredits: Number(j.actual_credits),
    createdAt: date(j.created_at),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log(`Shortcraft FinOps — as of ${report.asOf} (last ${report.windowDays} days)\n`);
console.log(
  `MRR gross €${report.mrr.grossEur}  net $${report.mrr.netUsd}  (${report.mrr.subscribers} subscribers)`,
);
console.log(`Top-ups net $${report.topUps.netUsd} (${report.topUps.count})`);
console.log(
  `API cost $${report.apiCostUsd.total}  failed-job waste $${report.apiCostUsd.wastedOnFailed}`,
);
console.log(
  `Videos done ${report.videos.done}, failed ${report.videos.failed}, avg cost $${report.videos.avgCostPerDoneUsd ?? 'n/a'}`,
);
console.log(`API cost per 1k credits spent: $${report.costPer1kCreditsUsd ?? 'n/a'}`);
console.log(`Fixed costs $${report.fixedCostsUsd}  →  CASH MARGIN $${report.cashMarginUsd}`);
console.log(`Revenue / API cost: ${report.revenueToApiCost ?? 'n/a'}x\n`);
console.table(report.mrr.byPlan);
console.table(report.apiCostUsd.byTier);
for (const a of report.alerts) console.log(`ALERT: ${a}`);
