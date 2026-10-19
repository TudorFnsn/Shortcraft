/**
 * Fixed monthly costs of running Shortcraft that don't scale with videos, in
 * USD. The finance report subtracts them from net revenue to show cash left
 * after the month. `null` = the owner hasn't told us yet; the report lists
 * these as gaps instead of assuming zero.
 *
 * Owner: fill the `null`s from the billing pages (FinancePlan §6).
 */
export interface FixedCost {
  id: string;
  label: string;
  monthlyUsd: number | null;
  note: string;
}

export const FIXED_COSTS: readonly FixedCost[] = [
  { id: 'vercel', label: 'Vercel', monthlyUsd: 0, note: 'Hobby plan (TheMasterPlan §5 Phase 3).' },
  {
    id: 'supabase',
    label: 'Supabase',
    monthlyUsd: 0,
    note: 'Free plan (leaked-password protection is Pro-only).',
  },
  { id: 'resend', label: 'Resend', monthlyUsd: 0, note: 'Free tier, 100 emails/day.' },
  {
    id: 'elevenlabs-plan',
    label: 'ElevenLabs plan',
    monthlyUsd: null,
    note: 'Custom-voice slots need a paid plan; usage is metered per call.',
  },
  { id: 'domain', label: 'Domain', monthlyUsd: null, note: 'Custom domain not bought yet?' },
  { id: 'sentry', label: 'Sentry', monthlyUsd: null, note: 'Free tier assumed; confirm.' },
  {
    id: 'claude-subscription',
    label: 'Claude (routines + dev)',
    monthlyUsd: null,
    note: 'The CEO/Design/Finance routines run on the owner’s plan.',
  },
];
