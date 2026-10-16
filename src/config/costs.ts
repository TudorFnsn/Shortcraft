/**
 * Fixed monthly costs of running Shortcraft, EUR cents, for the Finance CEO
 * routine's P&L (`features/finance/pnl.ts`). Owner-maintained: `null` means
 * "not filled in yet", and the finance report lists those lines so the P&L is
 * never silently optimistic. Variable provider spend is NOT here; it is metered
 * per job (`render_jobs.api_cost_usd`).
 *
 * Fill from the invoices, then commit. No secrets belong in this file.
 */
import type { FixedCost } from '@/features/finance/pnl';

export const FIXED_COSTS: readonly FixedCost[] = [
  { id: 'vercel', label: 'Vercel (hosting, bandwidth, functions)', monthlyCents: null },
  { id: 'supabase', label: 'Supabase (database, auth, storage, egress)', monthlyCents: null },
  { id: 'elevenlabs', label: 'ElevenLabs plan (voices, custom-voice slots)', monthlyCents: null },
  { id: 'resend', label: 'Resend (lifecycle email)', monthlyCents: null },
  { id: 'sentry', label: 'Sentry (error tracking)', monthlyCents: null },
  { id: 'domain', label: 'Domain', monthlyCents: null },
  {
    id: 'claude-code',
    label: 'Claude subscription / routines used to run the project',
    monthlyCents: null,
  },
];
