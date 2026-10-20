/**
 * Fixed monthly costs that don't scale with videos (USD). The Finance CFO
 * routine reads this to compute the MRR ratio; the owner keeps it current.
 *
 * `null` = unknown. Unknown costs are reported as a gap, never treated as 0.
 * Per-video API cost is NOT here: it is metered per job in
 * `render_jobs.api_cost_usd` and priced in `models.ts`.
 */
export interface FixedCost {
  vendor: string;
  /** What the bill pays for, so the routine can judge if a cheaper tier fits. */
  covers: string;
  monthlyUsd: number | null;
}

export const FIXED_COSTS: readonly FixedCost[] = [
  { vendor: 'Vercel', covers: 'hosting, cron, bandwidth (Hobby/Pro?)', monthlyUsd: null },
  { vendor: 'Supabase', covers: 'Postgres, auth, storage for media bucket', monthlyUsd: null },
  { vendor: 'ElevenLabs', covers: 'plan with custom-voice slots (Voice Studio)', monthlyUsd: null },
  { vendor: 'Resend', covers: 'lifecycle email', monthlyUsd: null },
  { vendor: 'Sentry', covers: 'error tracking', monthlyUsd: null },
  { vendor: 'Domain', covers: 'shortcraft domain, amortised per month', monthlyUsd: null },
  {
    vendor: 'Anthropic',
    covers: 'minimum / commitment, if any (usage is per job)',
    monthlyUsd: null,
  },
  { vendor: 'fal.ai', covers: 'minimum / commitment, if any (usage is per job)', monthlyUsd: null },
];
