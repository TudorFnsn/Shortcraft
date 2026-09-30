import { describe, expect, it } from 'vitest';
import { PLANS } from '@/config/plans';
import {
  checkPlanLimits,
  cheapestPlanAllowing,
  effectivePlanId,
  FREE_PLAN_ID,
} from '@/features/billing/entitlements';
import { InMemoryStore } from '@/features/render/repository.memory';

describe('effectivePlanId', () => {
  it('gives users without a subscription the free (Starter) limits', () => {
    expect(effectivePlanId(null)).toBe(FREE_PLAN_ID);
  });

  it('honours live subscriptions', () => {
    expect(effectivePlanId({ planId: 'pro', status: 'active' })).toBe('pro');
    expect(effectivePlanId({ planId: 'ultra', status: 'trialing' })).toBe('ultra');
    expect(effectivePlanId({ planId: 'pro', status: 'past_due' })).toBe('pro');
  });

  it('drops canceled subscriptions and unknown plan ids back to free', () => {
    expect(effectivePlanId({ planId: 'pro', status: 'canceled' })).toBe(FREE_PLAN_ID);
    expect(effectivePlanId({ planId: 'enterprise', status: 'active' })).toBe(FREE_PLAN_ID);
    expect(effectivePlanId({ planId: 'toString', status: 'active' })).toBe(FREE_PLAN_ID);
  });
});

describe('checkPlanLimits', () => {
  it('allows requests within the plan', () => {
    const res = checkPlanLimits(PLANS.starter, { targetDurationSec: 30, modelTier: 'standard' });
    expect(res.ok).toBe(true);
  });

  it('rejects over-long videos and names the plan that unlocks them', () => {
    const res = checkPlanLimits(PLANS.starter, { targetDurationSec: 60, modelTier: 'standard' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('plan_limit');
    expect(res.error.message).toContain('Pro');
  });

  it('rejects premium quality on Starter', () => {
    const res = checkPlanLimits(PLANS.starter, { targetDurationSec: 15, modelTier: 'premium' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.message).toContain('premium');
  });

  it('lets Ultra make the longest videos', () => {
    const res = checkPlanLimits(PLANS.ultra, { targetDurationSec: 120, modelTier: 'premium' });
    expect(res.ok).toBe(true);
  });
});

describe('cheapestPlanAllowing', () => {
  it('picks the lowest-priced plan that fits', () => {
    expect(cheapestPlanAllowing({ targetDurationSec: 15, modelTier: 'standard' })?.id).toBe(
      'starter',
    );
    expect(cheapestPlanAllowing({ targetDurationSec: 90, modelTier: 'premium' })?.id).toBe('pro');
    expect(cheapestPlanAllowing({ targetDurationSec: 120, modelTier: 'standard' })?.id).toBe(
      'ultra',
    );
  });

  it('returns null when no plan fits', () => {
    expect(cheapestPlanAllowing({ targetDurationSec: 600, modelTier: 'standard' })).toBeNull();
  });
});

describe('InMemoryStore.planOf', () => {
  it('reflects the subscription lifecycle', async () => {
    const store = new InMemoryStore();
    expect(await store.planOf('u1')).toBe('starter');
    store.setSubscription('u1', 'pro');
    expect(await store.planOf('u1')).toBe('pro');
    store.setSubscription('u1', 'pro', 'canceled');
    expect(await store.planOf('u1')).toBe('starter');
  });
});
