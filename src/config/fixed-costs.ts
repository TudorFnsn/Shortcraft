/**
 * Monthly fixed costs in USD that are not metered per job (hosting, database,
 * the ElevenLabs plan, email, domain …). The Finance CEO routine
 * (FinancePlan.md) subtracts them in `scripts/finance-report.mts`.
 *
 * OWNER: fill these from the invoices (label → USD per month). Empty means
 * "unknown", and the report says so instead of showing a profit that ignores
 * them. Example: { vercel: 0, supabase: 0, elevenlabs: 22, resend: 0, domain: 1 }
 */
export const FIXED_COSTS_USD_PER_MONTH: Readonly<Record<string, number>> = {};
