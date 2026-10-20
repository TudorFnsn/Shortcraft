import { describe, expect, it } from 'vitest';
import { PLANS, planIntervals, planLookupKey, yearlySavingCents } from '@/config/plans';

describe('planLookupKey', () => {
  it('matches the lookup keys stripe-setup creates', () => {
    expect(planLookupKey('pro', 'month')).toBe('pro_monthly');
    expect(planLookupKey('starter', 'year')).toBe('starter_yearly');
  });
});

describe('yearly pricing', () => {
  it('sells a plan yearly only when it has a yearly price', () => {
    for (const plan of Object.values(PLANS)) {
      expect(planIntervals(plan)).toEqual(
        plan.yearlyPriceCents === null ? ['month'] : ['month', 'year'],
      );
    }
  });

  it('never charges more for a year than twelve months', () => {
    for (const plan of Object.values(PLANS)) {
      if (plan.yearlyPriceCents === null) continue;
      expect(plan.yearlyPriceCents).toBeLessThanOrEqual(12 * plan.priceCents);
      expect(yearlySavingCents(plan)).toBeGreaterThanOrEqual(0);
    }
  });

  it('gives Starter two months free and nothing yearly elsewhere yet', () => {
    expect(yearlySavingCents(PLANS.starter)).toBe(2 * PLANS.starter.priceCents);
    expect(yearlySavingCents(PLANS.pro)).toBe(0);
    expect(yearlySavingCents(PLANS.ultra)).toBe(0);
  });
});
