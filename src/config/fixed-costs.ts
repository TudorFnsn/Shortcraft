/**
 * Recurring costs that are not per-video (USD per month). Owner-maintained: the
 * Finance routine cannot read vendor invoices, so these are what Tudor pays
 * today. `null` = unknown, and the finance report says so instead of guessing.
 * Update this file in the same change as any plan upgrade or new subscription.
 */
export interface FixedCost {
  id: string;
  label: string;
  /** USD per month; null while unknown. */
  monthlyUsd: number | null;
  note?: string;
}

export const FIXED_COSTS: readonly FixedCost[] = [
  { id: 'vercel', label: 'Vercel (hosting, cron, bandwidth)', monthlyUsd: null },
  { id: 'supabase', label: 'Supabase (db, auth, storage)', monthlyUsd: null },
  {
    id: 'elevenlabs',
    label: 'ElevenLabs plan (voices, custom-voice slots)',
    monthlyUsd: null,
    note: 'Usage beyond the plan is also in render_jobs.api_cost_usd',
  },
  { id: 'resend', label: 'Resend (lifecycle email)', monthlyUsd: null },
  { id: 'sentry', label: 'Sentry', monthlyUsd: null },
  { id: 'domain', label: 'Domain', monthlyUsd: null },
  { id: 'claude', label: 'Claude subscription (routines, dev)', monthlyUsd: null },
];
