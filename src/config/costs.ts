/**
 * Fixed monthly costs of running Shortcraft (USD) — everything that is NOT a
 * per-video API call (those are metered per job in `render_jobs.api_cost_usd`).
 *
 * UNVERIFIED: amounts are the vendors' public list prices for the tier we
 * believe is in use, not invoices. The Finance CEO routine replaces them with
 * real figures (Vercel `list_billing_charges`, vendor dashboards, owner) and
 * records each change in FinancePlan.md. Set `usdPerMonth` to 0 for a free tier.
 */
export interface FixedCost {
  id: string;
  vendor: string;
  what: string;
  usdPerMonth: number;
  /** 'assumed' = list price guess; 'confirmed' = matches an invoice or dashboard. */
  status: 'assumed' | 'confirmed';
}

export const FIXED_COSTS: readonly FixedCost[] = [
  { id: 'vercel', vendor: 'Vercel', what: 'Pro plan, 1 seat', usdPerMonth: 20, status: 'assumed' },
  { id: 'supabase', vendor: 'Supabase', what: 'Pro plan', usdPerMonth: 25, status: 'assumed' },
  {
    id: 'elevenlabs',
    vendor: 'ElevenLabs',
    what: 'Plan with custom-voice slots',
    usdPerMonth: 22,
    status: 'assumed',
  },
  { id: 'resend', vendor: 'Resend', what: 'Lifecycle email', usdPerMonth: 0, status: 'assumed' },
  { id: 'sentry', vendor: 'Sentry', what: 'Error tracking', usdPerMonth: 0, status: 'assumed' },
  {
    id: 'domain',
    vendor: 'Registrar',
    what: 'Domain (monthly share)',
    usdPerMonth: 2,
    status: 'assumed',
  },
];
