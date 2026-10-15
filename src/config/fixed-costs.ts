/**
 * Fixed monthly costs of running Shortcraft, in USD (before VAT recovery).
 *
 * `null` = unknown: the Finance routine asks the owner instead of guessing, and
 * the finance report lists unknown lines so MRR ratios are never silently
 * flattered. Fill from the real invoices (Vercel billing, Supabase, ElevenLabs,
 * Resend, Sentry, domain). Update this file whenever a plan changes.
 */
export interface FixedCost {
  id: string;
  label: string;
  /** Monthly cost in USD, or null while unknown. */
  monthlyUsd: number | null;
  note?: string;
}

export const FIXED_COSTS: readonly FixedCost[] = [
  { id: 'vercel', label: 'Vercel (hosting)', monthlyUsd: null, note: 'Hobby = $0; Pro = $20/seat' },
  {
    id: 'supabase',
    label: 'Supabase (db, auth, storage)',
    monthlyUsd: null,
    note: 'Free or Pro $25',
  },
  {
    id: 'elevenlabs',
    label: 'ElevenLabs plan (voice + custom-voice slots)',
    monthlyUsd: null,
    note: 'Plan fee; per-character usage is metered per job',
  },
  { id: 'resend', label: 'Resend (lifecycle email)', monthlyUsd: null },
  { id: 'sentry', label: 'Sentry (errors)', monthlyUsd: null },
  { id: 'domain', label: 'Domain', monthlyUsd: null, note: 'Per year ÷ 12' },
  { id: 'anthropic-min', label: 'Anthropic minimum spend', monthlyUsd: null, note: 'Usually $0' },
];
