import { describe, expect, it } from 'vitest';
import { planTeasers, topUpLine } from '@/components/landing/plan-teaser';
import { PLANS } from '@/config/plans';
import { estimateJobCredits } from '@/features/render/pricing';

describe('landing pricing teaser', () => {
  it('lists every plan, cheapest first, with real prices and credits', () => {
    const t = planTeasers();
    expect(t.map((p) => p.id)).toEqual(['starter', 'pro', 'ultra']);
    expect(t[0]).toMatchObject({ name: 'Starter', price: '€14.99', credits: '30,000' });
    expect(t[1]).toMatchObject({ price: '€29.99', credits: '100,000', featured: true });
  });

  it('derives the video count from the 15s Standard estimate', () => {
    const per = estimateJobCredits({ targetDurationSec: 15, modelTier: 'standard' });
    const t = planTeasers();
    expect(t[0]!.videos).toBe(
      `About ${Math.floor(PLANS.starter.monthlyCredits / per)} videos of 15s`,
    );
  });

  it('describes each plan by its real limits', () => {
    const [starter, pro] = planTeasers();
    expect(starter!.limits).toBe('Up to 30s · Standard quality');
    expect(pro!.limits).toBe('Up to 90s · Premium AI video');
  });

  it('quotes the cheapest top-up', () => {
    expect(topUpLine()).toBe('One-time top-ups start at €12 for 20,000 credits.');
  });
});
