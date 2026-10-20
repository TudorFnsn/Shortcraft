/**
 * Fixed monthly operating costs, in USD, for the Finance CEO's burn and
 * break-even math (`features/finance/unit-economics.ts`).
 *
 * Provider usage is NOT here: it is variable and recorded per job as
 * `render_jobs.api_cost_usd`. This file holds the subscriptions and fees we pay
 * whether or not anyone renders. `null` = unknown; the report prints it as
 * "unknown" and leaves it out of the total (so burn is a lower bound until the
 * owner fills it in from the invoices).
 *
 * Owner: update from the real invoices; the Finance CEO may open a PR that
 * proposes changes here, never invent a number.
 */
export interface OpsCostLine {
  id: string;
  label: string;
  /** USD per month, or null while unknown. */
  usdPerMonth: number | null;
  note: string;
}

export const OPS_COSTS: readonly OpsCostLine[] = [
  { id: 'vercel', label: 'Vercel', usdPerMonth: 0, note: 'Hobby plan (decided 2026-10-11)' },
  { id: 'supabase', label: 'Supabase', usdPerMonth: 0, note: 'Free plan; Pro is $25/mo' },
  {
    id: 'elevenlabs',
    label: 'ElevenLabs plan',
    usdPerMonth: null,
    note: 'Owner: fill from invoice. Custom-voice slots cap sign-ups (TheMasterPlan §8)',
  },
  { id: 'resend', label: 'Resend', usdPerMonth: 0, note: 'Free tier, 100 emails/day' },
  { id: 'domain', label: 'Domain', usdPerMonth: null, note: 'Owner: fill (yearly cost / 12)' },
  { id: 'sentry', label: 'Sentry', usdPerMonth: 0, note: 'Free tier' },
];
