/**
 * Fixed and plan-based monthly costs that no database row records. OWNER-FILLED:
 * `null` means "unknown", and the finance report says so instead of guessing.
 * Amounts are in USD per month, taken from the real invoices/plan pages.
 * Variable API spend (fal.ai, ElevenLabs usage, Anthropic) is not listed here:
 * it comes from `render_jobs.api_cost_usd` and should be reconciled against the
 * provider dashboards (see FinancePlan.md §4).
 */
export interface FixedCost {
  id: string;
  label: string;
  /** USD per month on today's plan; null = owner hasn't told us yet. */
  usdPerMonth: number | null;
  note: string;
}

export const FIXED_COSTS: readonly FixedCost[] = [
  { id: 'vercel', label: 'Vercel', usdPerMonth: 0, note: 'Hobby plan (free) as of 2026-10-11' },
  { id: 'supabase', label: 'Supabase', usdPerMonth: 0, note: 'Free plan; Pro is $25' },
  {
    id: 'elevenlabs-plan',
    label: 'ElevenLabs subscription',
    usdPerMonth: null,
    note: 'Plan fee, separate from usage; custom-voice slots depend on it',
  },
  { id: 'resend', label: 'Resend', usdPerMonth: null, note: 'Lifecycle email; free tier is 3k/mo' },
  { id: 'domain', label: 'Domain', usdPerMonth: null, note: 'Annual price ÷ 12' },
  { id: 'sentry', label: 'Sentry', usdPerMonth: null, note: 'Error tracking' },
  {
    id: 'anthropic-minimum',
    label: 'Anthropic prepaid minimum',
    usdPerMonth: 0,
    note: 'Pay as you go; usage is in api_cost_usd',
  },
];
