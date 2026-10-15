/**
 * Finance report: MRR, 30-day API cost per finished video, and contribution
 * after fixed costs, read from the Supabase project in `.env.local`.
 * READ-ONLY: it only runs `select`s. Definitions: `src/features/metrics/finance.ts`.
 * Fixed costs come from `docs/finance/fixed-costs.json` (owner-maintained).
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

const { computeFinance } = await import('@/features/metrics/finance');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

async function selectAll(table: string, columns: string, since?: string) {
  const rows: Record<string, string>[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = admin.from(table).select(columns);
    if (since) q = q.gte('created_at', since);
    const { data, error } = await q.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as unknown as Record<string, string>[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const now = new Date();
const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
const [subs, jobs] = await Promise.all([
  selectAll('subscriptions', 'plan_id, status'),
  selectAll('render_jobs', 'status, model_tier, api_cost_usd, created_at', since),
]);

const fixedFile = resolve('docs/finance/fixed-costs.json');
const fixed = existsSync(fixedFile) ? JSON.parse(readFileSync(fixedFile, 'utf8')) : undefined;

const report = computeFinance({
  now,
  subscriptions: subs.map((s) => ({ planId: s.plan_id ?? '', status: s.status ?? '' })),
  jobs: jobs.map((j) => ({
    status: j.status ?? '',
    modelTier: j.model_tier ?? '',
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    createdAt: new Date(j.created_at ?? 0),
  })),
  fixed,
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number) => `$${n.toFixed(2)}`;
console.log(`Shortcraft finance — as of ${report.asOf}\n`);
console.log(`Paying subscribers:        ${report.payingSubscribers}`);
console.log(`MRR (gross):               €${report.mrrEur.toFixed(2)}  (${usd(report.mrrUsd)})`);
console.log(`MRR (net of VAT + fees):   ${usd(report.netMrrUsd)}`);
console.log(`API cost, last 30 days:    ${usd(report.apiCost30dUsd)}`);
console.log(`  of which failed jobs:    ${usd(report.wastedOnFailedUsd)}`);
console.log(`Fixed costs / month:       ${usd(report.fixedCostsUsd)}`);
console.log(`Contribution / month:      ${usd(report.contributionUsd)}`);
console.log(
  `Coverage (net MRR ÷ cost): ${report.coverage === null ? 'n/a' : `${report.coverage.toFixed(2)}x`}\n`,
);
console.table(
  report.tiers.map((t) => ({
    tier: t.tier,
    jobs: t.jobs,
    done: t.doneJobs,
    cost: usd(t.costUsd),
    perDoneVideo: t.costPerDoneVideoUsd === null ? 'n/a' : usd(t.costPerDoneVideoUsd),
  })),
);
