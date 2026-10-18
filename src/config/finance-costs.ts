/**
 * Fixed (non-per-video) monthly costs, in USD, for the Finance routine's
 * profit-and-loss view. Owner-maintained: the routine cannot see vendor
 * invoices, so these are PLAN prices until Tudor replaces them with real bills.
 * `source: 'list'` = public list price, `source: 'invoice'` = seen on a bill.
 * Per-video API costs are NOT here; they come from `render_jobs.api_cost_usd`.
 */
export interface FixedCost {
  vendor: string;
  what: string;
  monthlyUsd: number;
  source: 'list' | 'invoice' | 'unknown';
}

export const FIXED_COSTS: readonly FixedCost[] = [
  { vendor: 'Vercel', what: 'Hosting (Hobby/Pro) + functions', monthlyUsd: 20, source: 'unknown' },
  { vendor: 'Supabase', what: 'Database, auth, storage', monthlyUsd: 25, source: 'unknown' },
  { vendor: 'ElevenLabs', what: 'Plan with custom-voice slots', monthlyUsd: 22, source: 'unknown' },
  { vendor: 'Resend', what: 'Lifecycle email', monthlyUsd: 0, source: 'unknown' },
  { vendor: 'Sentry', what: 'Error tracking', monthlyUsd: 0, source: 'unknown' },
  { vendor: 'Domain', what: 'shortcraft domain', monthlyUsd: 2, source: 'unknown' },
];
