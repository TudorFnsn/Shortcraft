/**
 * Fixed monthly costs that don't show up in `render_jobs.api_cost_usd`
 * (hosting, database, seats, tooling). Owner-maintained: the CFO routine reads
 * this file and asks for any `null` it needs. Amounts are USD per month,
 * `null` = not provided yet (counted as unknown, never as zero).
 */
export interface FixedCost {
  id: string;
  label: string;
  monthlyUsd: number | null;
  /** Where to confirm the number (dashboard or invoice). */
  source: string;
}

export const FIXED_COSTS: readonly FixedCost[] = [
  { id: 'vercel', label: 'Vercel (Hobby/Pro + usage)', monthlyUsd: null, source: 'Vercel billing' },
  {
    id: 'supabase',
    label: 'Supabase plan + compute',
    monthlyUsd: null,
    source: 'Supabase billing',
  },
  {
    id: 'elevenlabs',
    label: 'ElevenLabs plan (voice slots, quota)',
    monthlyUsd: null,
    source: 'ElevenLabs billing',
  },
  {
    id: 'fal',
    label: 'fal.ai minimum / prepaid top-up',
    monthlyUsd: null,
    source: 'fal.ai billing',
  },
  { id: 'anthropic', label: 'Anthropic API (script writer)', monthlyUsd: null, source: 'Console' },
  { id: 'resend', label: 'Resend (lifecycle email)', monthlyUsd: null, source: 'Resend billing' },
  { id: 'sentry', label: 'Sentry', monthlyUsd: null, source: 'Sentry billing' },
  { id: 'domain', label: 'Domain (monthly share)', monthlyUsd: null, source: 'Registrar' },
];
