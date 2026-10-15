/**
 * Finance report: MRR, net MRR, realised API cost per video / per tier,
 * waste, trial burn, per-plan margin and break-even, read from the Supabase
 * project in `.env.local`. READ-ONLY: it only runs `select`s (service role).
 * Definitions live in `src/features/finance/finance.ts`.
 *
 * Fixed costs come from `docs/finance/fixed-costs.json` (owner-maintained;
 * null lines are listed as "missing" and excluded from the totals).
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

const { computeFinance, WINDOW_DAYS } = await import('@/features/finance/finance');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

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
const now = new Date();
const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString();
const [subs, jobs] = await Promise.all([
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll<Row>(
    'render_jobs',
    'user_id, status, model_tier, api_cost_usd, actual_credits, created_at',
    since,
  ),
]);

const fixedFile = resolve('docs/finance/fixed-costs.json');
const fixedRaw = existsSync(fixedFile)
  ? (JSON.parse(readFileSync(fixedFile, 'utf8')) as { monthlyUsd: Record<string, number | null> })
  : { monthlyUsd: {} };
const known = Object.entries(fixedRaw.monthlyUsd).filter(
  (e): e is [string, number] => typeof e[1] === 'number',
);
const missing = Object.entries(fixedRaw.monthlyUsd)
  .filter(([, v]) => v === null)
  .map(([k]) => k);

const report = computeFinance({
  now,
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
    actualCredits: Number(j.actual_credits),
    createdAt: new Date(String(j.created_at)),
  })),
  fixedCosts: known.length ? { monthlyUsd: Object.fromEntries(known) } : undefined,
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ...report, missingFixedCosts: missing }, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
console.log(`Shortcraft finance — as of ${report.asOf} (jobs: last ${report.windowDays}d)\n`);
console.log(
  `MRR (gross):            €${report.mrrEur.toFixed(2)} from ${report.payingSubscribers} subscribers`,
);
console.log(
  `Net MRR (after VAT+fees): ${usd(report.netMrrUsd)}   ARPU: €${report.arpuEur ?? 'n/a'}`,
);
console.log(
  `API cost (window):      ${usd(report.apiCostUsd)}   waste (failed): ${usd(report.wasteUsd)}   trial burn: ${usd(report.trialBurnUsd)}`,
);
console.log(
  `Blended margin multiple: ${report.blendedMultiple ?? 'n/a'}x   gross profit: ${usd(report.grossProfitUsd)}`,
);
console.log(
  `Fixed costs: ${usd(report.fixedCostsUsd)}   operating result: ${usd(report.operatingResultUsd)}   break-even subscribers: ${report.breakEvenSubscribers ?? 'n/a'}`,
);
if (missing.length) console.log(`Missing fixed costs (ask the owner): ${missing.join(', ')}`);
console.log('\nPer plan');
console.table(report.plans);
console.log('Per model tier');
console.table(report.tiers);
