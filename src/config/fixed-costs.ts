/**
 * Monthly fixed costs (USD) that are not per-video API spend. OWNER-MAINTAINED:
 * the Finance CFO routine cannot see invoices, so these are the numbers it uses
 * for the MRR ratio. Update when a plan changes; set `confirmed: true` once the
 * amount matches a real invoice. Unconfirmed lines are reported as assumptions.
 */
export interface FixedCost {
  name: string;
  monthlyUsd: number;
  confirmed: boolean;
  note?: string;
}

export const FIXED_COSTS: readonly FixedCost[] = [
  { name: 'Vercel', monthlyUsd: 0, confirmed: false, note: 'Hobby today; Pro is $20/seat' },
  { name: 'Supabase', monthlyUsd: 0, confirmed: false, note: 'Free today; Pro is $25' },
  {
    name: 'ElevenLabs plan',
    monthlyUsd: 0,
    confirmed: false,
    note: 'Owner: plan + custom-voice slots',
  },
  { name: 'Resend', monthlyUsd: 0, confirmed: false },
  { name: 'Sentry', monthlyUsd: 0, confirmed: false },
  { name: 'Domain', monthlyUsd: 0, confirmed: false },
];
