/**
 * Recurring costs that are not metered per render job. Read by the finance
 * report (`scripts/finance-report.mts`) so it can show whether MRR covers the
 * whole bill, not just provider calls.
 *
 * OWNER: replace each `usdPerMonth` with the real invoice amount (0 = free tier
 * or unknown; the report lists unknowns). Keep the names stable: the finance
 * routine diffs this file to spot vendor changes.
 */
import type { FixedCost } from '@/features/finance/unit-economics';

export const FIXED_COSTS: readonly FixedCost[] = [
  { name: 'Vercel (hosting, functions, bandwidth)', usdPerMonth: 0 },
  { name: 'Supabase (database, auth, storage)', usdPerMonth: 0 },
  { name: 'ElevenLabs plan (voice slots + base credits)', usdPerMonth: 0 },
  { name: 'Resend (lifecycle email)', usdPerMonth: 0 },
  { name: 'Sentry (error tracking)', usdPerMonth: 0 },
  { name: 'Domain', usdPerMonth: 0 },
  { name: 'Claude Code / routines (dev tooling)', usdPerMonth: 0 },
];
