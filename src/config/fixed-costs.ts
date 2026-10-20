/**
 * Monthly fixed costs of running Shortcraft, in USD cents. Owned by the Finance
 * routine (see `FinancePlan.md`); the owner confirms the numbers.
 *
 * `null` = not known yet. The finance report lists every null as a gap instead
 * of counting it as zero, so burn is never silently understated. Replace a null
 * with the real invoice amount (or the plan's list price) as soon as you have it.
 * Usage-based vendors (fal.ai, Anthropic, ElevenLabs overage) are NOT here:
 * their spend is variable and arrives through `render_jobs.api_cost_usd`.
 */
export interface FixedCost {
  id: string;
  vendor: string;
  what: string;
  /** USD cents per month, or null when unknown. */
  monthlyCents: number | null;
}

export const FIXED_COSTS: readonly FixedCost[] = [
  { id: 'vercel', vendor: 'Vercel', what: 'Hosting (Hobby/Pro plan)', monthlyCents: null },
  { id: 'supabase', vendor: 'Supabase', what: 'Database, auth, storage', monthlyCents: null },
  {
    id: 'elevenlabs-plan',
    vendor: 'ElevenLabs',
    what: 'Plan fee (custom-voice slots, included characters)',
    monthlyCents: null,
  },
  { id: 'resend', vendor: 'Resend', what: 'Lifecycle email', monthlyCents: null },
  { id: 'sentry', vendor: 'Sentry', what: 'Error tracking', monthlyCents: null },
  { id: 'domain', vendor: 'Registrar', what: 'Domain (monthly share)', monthlyCents: null },
  {
    id: 'claude-routines',
    vendor: 'Anthropic',
    what: 'Claude routines / subscription',
    monthlyCents: null,
  },
];
