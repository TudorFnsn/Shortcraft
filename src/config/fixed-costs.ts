/**
 * Monthly fixed costs of running Shortcraft, in USD. Owner-maintained: the
 * finance routine cannot see invoices, so `null` means "not supplied yet" and
 * the finance report lists it as a gap instead of assuming zero.
 *
 * Update when a plan changes. Variable provider cost is NOT here; it is stored
 * per job in `render_jobs.api_cost_usd`.
 */
import type { FixedCost } from '@/features/finance/unit-economics';

export const FIXED_COSTS: readonly FixedCost[] = [
  { name: 'Vercel (Hobby/Pro plan + usage)', monthlyUsd: null },
  { name: 'Supabase (plan + compute add-ons)', monthlyUsd: null },
  { name: 'ElevenLabs (subscription tier, incl. voice slots)', monthlyUsd: null },
  { name: 'Resend (email plan)', monthlyUsd: null },
  { name: 'Sentry (plan)', monthlyUsd: null },
  { name: 'Domain + DNS', monthlyUsd: null },
  { name: 'Claude / Claude Code subscription running the routines', monthlyUsd: null },
];
