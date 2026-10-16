/**
 * Fixed monthly vendor costs in USD, for the finance report. Owner-maintained:
 * `null` means "not told yet" and the report flags it instead of assuming zero.
 * Per-use costs (fal.ai, Anthropic, ElevenLabs credits) are not listed here;
 * they are measured per job in `render_jobs.api_cost_usd`.
 *
 * Fill from the invoices / billing pages, then say so in FinancePlan.md §3.
 */
export const FIXED_VENDOR_COSTS_USD_PER_MONTH: Readonly<Record<string, number | null>> = {
  vercel: null, // Hobby is free, but Hobby forbids commercial use: Pro is $20/seat
  supabase: null, // Free, or Pro $25
  elevenlabs: null, // subscription tier (custom-voice slots, included characters)
  resend: null, // free up to 3k emails/month
  sentry: null,
  domain: null, // yearly price / 12
};
