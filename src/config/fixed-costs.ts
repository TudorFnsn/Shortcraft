/**
 * Fixed and semi-fixed monthly costs that no API reports to us, in USD.
 *
 * The finance report (`scripts/finance-report.mts`) can't read Vercel,
 * Supabase, ElevenLabs or domain invoices, so the owner keeps the real numbers
 * here (a one-line PR, or tell the Finance CFO routine and it opens one).
 * `null` = unknown, and the report says so instead of assuming zero.
 */
export interface FixedCost {
  id: string;
  label: string;
  /** Monthly USD, or null when the owner hasn't supplied it yet. */
  monthlyUsd: number | null;
  /** Where the number comes from, so the next reader can check it. */
  note: string;
}

export const FIXED_COSTS: readonly FixedCost[] = [
  { id: 'vercel', label: 'Vercel', monthlyUsd: null, note: 'Hobby = $0; Pro = $20/seat' },
  { id: 'supabase', label: 'Supabase', monthlyUsd: null, note: 'Free tier = $0; Pro = $25' },
  {
    id: 'elevenlabs',
    label: 'ElevenLabs plan',
    monthlyUsd: null,
    note: 'Subscription fee only; per-character usage is in render_jobs.api_cost_usd',
  },
  { id: 'resend', label: 'Resend (email)', monthlyUsd: null, note: 'Free tier = $0' },
  { id: 'sentry', label: 'Sentry', monthlyUsd: null, note: 'Developer plan = $0' },
  { id: 'domain', label: 'Domain', monthlyUsd: null, note: 'Annual price ÷ 12' },
  {
    id: 'claude-routines',
    label: 'Claude routines',
    monthlyUsd: null,
    note: 'CEO + Design + Finance',
  },
];
