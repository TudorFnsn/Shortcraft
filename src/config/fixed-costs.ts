/**
 * Monthly fixed costs that are NOT visible in the database (hosting, seats,
 * plans). The Finance routine can't read provider invoices, so the owner fills
 * these in; `null` means "unknown" and the report says so instead of guessing.
 * Amounts are USD per month. Update from the real invoices, then date the change
 * in FinancePlan.md §6.
 */
export interface FixedCost {
  id: string;
  label: string;
  usdPerMonth: number | null;
}

export const FIXED_COSTS: readonly FixedCost[] = [
  { id: 'vercel', label: 'Vercel (Hobby → Pro when needed)', usdPerMonth: null },
  { id: 'supabase', label: 'Supabase (free → Pro)', usdPerMonth: null },
  {
    id: 'elevenlabs-plan',
    label: 'ElevenLabs subscription (custom-voice slots)',
    usdPerMonth: null,
  },
  {
    id: 'fal-minimum',
    label: 'fal.ai (prepaid credits are variable; list any minimum)',
    usdPerMonth: null,
  },
  {
    id: 'anthropic-minimum',
    label: 'Anthropic (usage-based; list any minimum)',
    usdPerMonth: null,
  },
  { id: 'resend', label: 'Resend (email)', usdPerMonth: null },
  { id: 'sentry', label: 'Sentry', usdPerMonth: null },
  { id: 'domain', label: 'Domain (monthly share)', usdPerMonth: null },
  { id: 'claude-routines', label: 'Claude plan running the routines', usdPerMonth: null },
];
