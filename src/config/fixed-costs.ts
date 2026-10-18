/**
 * Fixed monthly costs we pay whether or not anyone makes a video, in USD.
 * Owner-maintained: the Finance routine cannot read invoices, so this file is
 * its only source for what the stack costs per month. `null` = not entered yet
 * (the report lists it as "unknown" and never counts it as zero).
 *
 * Update the same day a plan changes, and cite the invoice in the comment.
 */
export interface FixedCost {
  id: string;
  label: string;
  /** Monthly USD, or null while the owner hasn't entered it. */
  monthlyUsd: number | null;
}

export const FIXED_COSTS: readonly FixedCost[] = [
  { id: 'vercel', label: 'Vercel (Hobby is $0; Pro is $20/seat)', monthlyUsd: null },
  { id: 'supabase', label: 'Supabase (Free is $0; Pro is $25)', monthlyUsd: null },
  { id: 'elevenlabs', label: 'ElevenLabs subscription (custom-voice slots)', monthlyUsd: null },
  { id: 'resend', label: 'Resend (Free covers launch volume)', monthlyUsd: null },
  { id: 'sentry', label: 'Sentry (Developer is $0)', monthlyUsd: null },
  { id: 'domain', label: 'Domain (monthly share of the yearly price)', monthlyUsd: null },
  { id: 'claude-routines', label: 'Claude plan that runs the routines', monthlyUsd: null },
];
