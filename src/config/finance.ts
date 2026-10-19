/**
 * Fixed monthly costs and owner-supplied money facts for the finance report.
 * `null` = the owner has not told us yet (the report prints "unknown" instead of
 * guessing). Amounts are USD per month. Fill these from the vendors' invoices;
 * the Finance CFO routine reads this file and asks the owner for every null.
 */
export interface FixedCost {
  vendor: string;
  /** What it buys, so a reviewer can tell whether it is still needed. */
  purpose: string;
  usdPerMonth: number | null;
}

export const FIXED_COSTS: readonly FixedCost[] = [
  { vendor: 'Vercel', purpose: 'hosting + cron', usdPerMonth: null },
  { vendor: 'Supabase', purpose: 'database, auth, storage', usdPerMonth: null },
  { vendor: 'ElevenLabs', purpose: 'plan fee (voices, custom-voice slots)', usdPerMonth: null },
  { vendor: 'Resend', purpose: 'lifecycle email', usdPerMonth: null },
  { vendor: 'Sentry', purpose: 'error tracking', usdPerMonth: null },
  { vendor: 'Domain', purpose: 'domain name, per month', usdPerMonth: null },
  { vendor: 'Claude / Anthropic dev tools', purpose: 'routines and dev agents', usdPerMonth: null },
];

/** Cash the owner can spend before revenue covers costs (USD). `null` = unknown. */
export const CASH_ON_HAND_USD: number | null = null;
