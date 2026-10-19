/**
 * Recurring costs that are not per-video API usage, in USD per month.
 *
 * Owner-maintained: the finance routine cannot see invoices, so it reads this
 * file. `null` means "not supplied yet" and shows up in the finance report as
 * a missing input (it is NOT treated as zero). Update when a plan changes.
 */
export interface FixedCost {
  id: string;
  label: string;
  /** USD per month, or null until the owner supplies it. */
  usdPerMonth: number | null;
  note: string;
}

export const FIXED_COSTS: readonly FixedCost[] = [
  {
    id: 'vercel',
    label: 'Vercel hosting',
    usdPerMonth: 0,
    note: 'Hobby plan (decided 2026-10-11). Hobby forbids commercial use: re-check at the first paying customer.',
  },
  {
    id: 'supabase',
    label: 'Supabase (db + auth + storage)',
    usdPerMonth: 0,
    note: 'Free plan (TheMasterPlan §5). Storage/egress limits matter once videos pile up.',
  },
  {
    id: 'elevenlabs-plan',
    label: 'ElevenLabs subscription',
    usdPerMonth: null,
    note: 'Owner to supply: plan price, included characters and custom-voice slots.',
  },
  {
    id: 'resend',
    label: 'Resend (email)',
    usdPerMonth: null,
    note: 'Owner to supply (free tier = 0).',
  },
  {
    id: 'sentry',
    label: 'Sentry (errors)',
    usdPerMonth: null,
    note: 'Owner to supply (free tier = 0).',
  },
  {
    id: 'domain',
    label: 'Domain',
    usdPerMonth: null,
    note: 'Owner to supply (annual price / 12).',
  },
  {
    id: 'claude-routines',
    label: 'Claude subscription (CEO + Design + Finance routines)',
    usdPerMonth: null,
    note: 'Owner to supply: the plan that runs the routines.',
  },
];
