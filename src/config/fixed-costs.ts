/**
 * Monthly fixed costs (USD) that are not per-video API spend. `null` = the owner
 * hasn't told us yet; the finance report lists those as gaps instead of guessing.
 * The Finance routine asks for every `null` and updates this file in a PR.
 */
export interface FixedCost {
  id: string;
  name: string;
  /** USD per month on the current plan; null = unknown. */
  monthlyUsd: number | null;
  note?: string;
}

export const FIXED_COSTS: readonly FixedCost[] = [
  { id: 'vercel', name: 'Vercel (Hobby/Pro)', monthlyUsd: null },
  { id: 'supabase', name: 'Supabase (database, auth, storage, egress)', monthlyUsd: null },
  { id: 'elevenlabs', name: 'ElevenLabs plan (voice slots + character quota)', monthlyUsd: null },
  { id: 'resend', name: 'Resend (lifecycle email)', monthlyUsd: null },
  { id: 'sentry', name: 'Sentry (errors)', monthlyUsd: null },
  { id: 'domain', name: 'Domain + DNS', monthlyUsd: null },
  {
    id: 'claude-routines',
    name: 'Claude subscription / routines (CEO, Design, Finance)',
    monthlyUsd: null,
  },
];
