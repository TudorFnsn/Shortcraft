/**
 * Finance report: MRR, API spend, cost per finished video and coverage, read
 * from the Supabase project in `.env.local`. READ-ONLY (`select`s, service role).
 * Definitions live in `src/features/finance/unit-economics.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts [--days 30]   (table)
 *      npx tsx scripts/finance-report.mts --json        (raw report, for the digest)
 *
 * It cannot see what the vendors actually bill (fal.ai, ElevenLabs, Anthropic,
 * Vercel, Supabase): compare `apiSpendUsd` with their invoices/usage pages and
 * record the gap in FinancePlan.md.
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

const daysArg = process.argv.indexOf('--days');
const days = daysArg > -1 ? Number(process.argv[daysArg + 1]) : 30;
if (!Number.isFinite(days) || days <= 0) throw new Error('--days must be a positive number');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

async function selectAll<T>(table: string, columns: string, since?: Date): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = admin.from(table).select(columns);
    if (since) q = q.gte('created_at', since.toISOString());
    const { data, error } = await q.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number>;
const to = new Date();
const from = new Date(to.getTime() - days * 86_400_000);
const [subs, jobs, grants] = await Promise.all([
  selectAll<Row>('subscriptions', 'user_id, plan_id, status'),
  selectAll<Row>('render_jobs', 'user_id, status, model_tier, api_cost_usd, created_at', from),
  selectAll<Row>('credit_transactions', 'reason, delta, created_at', from),
]);

const report = computeFinance({
  subscriptions: subs.map((s) => ({
    userId: String(s.user_id),
    planId: String(s.plan_id),
    status: String(s.status),
  })),
  jobs: jobs.map((j) => ({
    userId: String(j.user_id),
    status: String(j.status),
    modelTier: String(j.model_tier),
    apiCostUsd: Number(j.api_cost_usd),
    createdAt: new Date(String(j.created_at)),
  })),
  grants: grants.map((g) => ({
    reason: String(g.reason),
    delta: Number(g.delta),
    createdAt: new Date(String(g.created_at)),
  })),
  from,
  to,
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ days, ...report }, null, 2));
} else {
  const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
  const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(0)}%`);
  console.log(`Window: last ${days} days`);
  console.table({
    'MRR (EUR)': report.mrrEur.toFixed(2),
    'Net MRR (USD, after VAT + Stripe)': usd(report.netMrrUsd),
    Subscribers: JSON.stringify(report.subscribersByPlan),
    'ARPU (EUR)': report.arpuEur?.toFixed(2) ?? 'n/a',
    'Top-up cash (EUR)': report.topUpCashEur.toFixed(2),
    'Jobs / done': `${report.jobsInWindow} / ${report.jobsDone}`,
    'API spend': usd(report.apiSpendUsd),
    'Spend by tier': JSON.stringify(report.spendByTierUsd),
    'Spend on failed jobs': usd(report.wastedSpendUsd),
    'Avg cost / finished video': usd(report.avgCostPerDoneVideoUsd),
    'Net MRR ÷ monthly API spend': report.coverage?.toFixed(2) ?? 'n/a',
    'Share of spend from non-subscribers': pct(report.freeUserSpendShare),
  });
}
