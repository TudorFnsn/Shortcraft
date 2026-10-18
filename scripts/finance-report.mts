/**
 * Finance report: MRR, 30-day AI/API cost, waste (failed jobs), trial burn and
 * cost-to-MRR, read from the Supabase project in `.env.local`.
 * READ-ONLY: it only runs `select`s (service role, so it sees every user).
 * Definitions live in `src/features/metrics/finance.ts`.
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
const { PAID_GRANT_REASONS } = await import('@/features/billing/entitlements');
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

type Row = Record<string, string | number | null>;
const [jobs, subs, grants] = await Promise.all([
  selectAll<Row>(
    'render_jobs',
    'user_id, status, model_tier, created_at, api_cost_usd, actual_credits',
  ),
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll<Row>('credit_transactions', 'user_id, created_at', {
    column: 'reason',
    in: PAID_GRANT_REASONS,
  }),
]);

const str = (v: Row[string] | undefined) => String(v ?? '');
const report = computeFinance({
  now: new Date(),
  jobs: jobs.map((j) => ({
    userId: str(j.user_id),
    status: str(j.status),
    modelTier: str(j.model_tier),
    createdAt: new Date(str(j.created_at)),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    chargedCredits: Number(j.actual_credits ?? 0),
  })),
  subscriptions: subs.map((s) => ({
    userId: str(s.user_id),
    planId: str(s.plan_id),
    status: str(s.status),
  })),
  payerIds: new Set(grants.map((g) => str(g.user_id))),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number) => `$${n.toFixed(2)}`;
console.log(`Shortcraft finance — as of ${report.asOf} (last ${report.windowDays} days)\n`);
console.log(
  `★ MRR (gross):          €${report.mrrEur.toFixed(2)}  (net of VAT + fees: ${usd(report.netMrrUsd)})`,
);
console.log(
  `  Paying subscribers:   ${report.payingSubscribers}  ${JSON.stringify(report.subscribersByPlan)}`,
);
console.log(`  API cost (30d):       ${usd(report.apiCostUsd)}`);
console.log(`  Waste (failed jobs):  ${usd(report.wasteUsd)}`);
console.log(`  Trial burn:           ${usd(report.trialBurnUsd)}`);
console.log(
  `  Cost-to-MRR:          ${report.costToMrr === null ? 'n/a (no MRR yet)' : `${(report.costToMrr * 100).toFixed(1)}%`}`,
);
console.log(
  `  Gross profit (30d):   ${usd(report.grossProfitUsd)}  (before hosting + fixed fees)\n`,
);
console.table(report.byTier);
console.log(
  '\nNot in this report (read via connectors): Stripe MRR/churn/refunds, fal.ai + ElevenLabs + Anthropic invoices, Vercel/Supabase billing.',
);
