/**
 * Fixed monthly costs of running Shortcraft (not per-video API spend), in USD.
 * Read by `scripts/finance-report.mts` so the Finance CFO routine can compute
 * true monthly profit, burn and break-even.
 *
 * `confirmed: false` means the amount is a placeholder the owner has not
 * verified: the report labels it and never treats it as measured. Fill from the
 * real invoices (Vercel, Supabase, ElevenLabs and Resend dashboards, domain
 * registrar) and flip `confirmed` to true. Only the owner edits amounts.
 */
export interface FixedCost {
  id: string;
  label: string;
  /** Monthly cost in USD (VAT-exclusive). 0 with confirmed:false = unknown. */
  usdPerMonth: number;
  confirmed: boolean;
}

export const FIXED_COSTS: readonly FixedCost[] = [
  {
    id: 'vercel',
    label: 'Vercel (Hobby/Pro, bandwidth, functions)',
    usdPerMonth: 0,
    confirmed: false,
  },
  {
    id: 'supabase',
    label: 'Supabase (database, auth, storage, egress)',
    usdPerMonth: 0,
    confirmed: false,
  },
  {
    id: 'elevenlabs',
    label: 'ElevenLabs plan (voice slots, TTS quota)',
    usdPerMonth: 0,
    confirmed: false,
  },
  { id: 'resend', label: 'Resend (lifecycle email)', usdPerMonth: 0, confirmed: false },
  { id: 'sentry', label: 'Sentry (error tracking)', usdPerMonth: 0, confirmed: false },
  { id: 'domain', label: 'Domain', usdPerMonth: 0, confirmed: false },
  {
    id: 'claude-routines',
    label: 'Claude subscription (CEO routines)',
    usdPerMonth: 0,
    confirmed: false,
  },
];
