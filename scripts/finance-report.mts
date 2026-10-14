/**
 * Finance report: MRR, cost per finished video, gross margin and the MRR ratio,
 * read from the Supabase project in `.env.local`. READ-ONLY (`select`s only).
 * Math lives in `src/features/finance/unit-economics.ts`; fixed costs are the
 * owner-maintained list in `src/config/fixed-costs.ts`.
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

const { computeUnitEconomics } = await import('@/features/finance/unit-economics');
const { isLiveSubscription } = await import('@/features/billing/entitlements');
const { FIXED_COSTS } = await import('@/config/fixed-costs');
const { PLANS } = await import('@/config/plans');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;
const daysArg = process.argv.indexOf('--days');
const windowDays = daysArg > -1 ? Number(process.argv[daysArg + 1]) || 30 : 30;

async function selectAll(table: string, columns: string): Promise<Record<string, string>[]> {
  const rows: Record<string, string>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .order('created_at')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as unknown as Record<string, string>[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const [subs, jobs] = await Promise.all([
  selectAll('subscriptions', 'plan_id, status, created_at'),
  selectAll('render_jobs', 'status, api_cost_usd, created_at'),
]);

const report = computeUnitEconomics({
  now: new Date(),
  windowDays,
  fixedCosts: FIXED_COSTS,
  subscriptions: subs.map((s) => {
    const snap = { planId: s.plan_id ?? '', status: s.status ?? '' };
    return {
      live: isLiveSubscription(snap),
      priceCents: isLiveSubscription(snap) ? PLANS[snap.planId].priceCents : 0,
    };
  }),
  jobs: jobs.map((j) => ({
    status: j.status ?? '',
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    createdAt: new Date(j.created_at ?? 0),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
console.log(`Shortcraft finance — last ${windowDays} days\n`);
console.table(report);
if (report.unconfirmedFixedUsd === 0 && report.fixedCostUsd === 0)
  console.log(
    'Fixed costs are all $0 placeholders: fill src/config/fixed-costs.ts for a real ratio.',
  );
