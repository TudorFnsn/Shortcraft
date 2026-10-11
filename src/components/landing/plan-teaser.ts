/**
 * Facts for the landing's pricing teaser, derived from the real catalog so the
 * page can never drift from what checkout sells.
 */
import { PLANS, TOPUP_PACKS } from '@/config/plans';
import { estimateJobCredits } from '@/features/render/pricing';

export interface PlanTeaser {
  id: string;
  name: string;
  price: string;
  credits: string;
  /** "About 14 videos of 15s" (from the 15s Standard estimate, an upper bound). */
  videos: string;
  limits: string;
  featured: boolean;
}

const eur = (cents: number) => `€${(cents / 100).toFixed(2)}`;
const fmt = (n: number) => n.toLocaleString('en-US');

/** The plan we point daily posters to. */
const FEATURED = 'pro';

export function planTeasers(): PlanTeaser[] {
  const perVideo = estimateJobCredits({ targetDurationSec: 15, modelTier: 'standard' });
  return Object.values(PLANS)
    .sort((a, b) => a.priceCents - b.priceCents)
    .map((p) => ({
      id: p.id,
      name: p.name,
      price: eur(p.priceCents),
      credits: fmt(p.monthlyCredits),
      videos: `About ${Math.floor(p.monthlyCredits / perVideo)} videos of 15s`,
      limits: `Up to ${p.limits.maxVideoDurationSec}s · ${
        p.limits.modelTiers.includes('premium') ? 'Premium AI video' : 'Standard quality'
      }`,
      featured: p.id === FEATURED,
    }));
}

/** "One-time top-ups start at €12 for 20,000 credits." */
export function topUpLine(): string {
  const cheapest = [...TOPUP_PACKS].sort((a, b) => a.priceCents - b.priceCents)[0];
  if (!cheapest) return '';
  const euros =
    cheapest.priceCents % 100 === 0 ? `€${cheapest.priceCents / 100}` : eur(cheapest.priceCents);
  return `One-time top-ups start at ${euros} for ${fmt(cheapest.credits)} credits.`;
}
