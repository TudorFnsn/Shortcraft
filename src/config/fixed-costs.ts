/**
 * Fixed monthly costs of running Shortcraft, in USD, for the finance report
 * (`scripts/finance-report.mts`). The Finance CFO routine cannot read vendor
 * invoices, so the owner keeps this list current (plan changes, new vendors).
 * Variable provider spend is NOT here: it is measured per job
 * (`render_jobs.api_cost_usd`).
 *
 * Amounts are the owner's to confirm; 0 with a note means "free tier today".
 */
export interface FixedCost {
  vendor: string;
  monthlyUsd: number;
  note: string;
}

export const FIXED_COSTS: readonly FixedCost[] = [
  {
    vendor: 'Vercel',
    monthlyUsd: 0,
    note: 'Hobby plan. Pro is $20/seat once commercial use is flagged.',
  },
  { vendor: 'Supabase', monthlyUsd: 0, note: 'Free tier (paused after 1 week idle; Pro is $25).' },
  { vendor: 'Resend', monthlyUsd: 0, note: 'Free tier, 100 emails/day.' },
  { vendor: 'Sentry', monthlyUsd: 0, note: 'Developer plan.' },
  { vendor: 'Domain', monthlyUsd: 0, note: 'Owner to fill in once a custom domain exists.' },
];
