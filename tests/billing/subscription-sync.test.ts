import { describe, expect, it } from 'vitest';
import { effectivePlanId } from '@/features/billing/entitlements';
import {
  subscriptionUpdateFromStripe,
  type StripeSubscriptionLike,
} from '@/features/billing/subscription-sync';

type Item = StripeSubscriptionLike['items']['data'][number];

const item = (planId: string | null, periodEnd: number | null = 1_790_000_000): Item => ({
  current_period_end: periodEnd,
  price: { metadata: planId ? { kind: 'subscription', planId } : {} },
});

const sub = (status: string, ...items: Item[]): StripeSubscriptionLike => ({
  status,
  items: { data: items },
});

describe('subscriptionUpdateFromStripe', () => {
  it('reads plan, status and period end from the subscription', () => {
    expect(subscriptionUpdateFromStripe(sub('active', item('pro', 1_790_000_000)))).toEqual({
      status: 'active',
      planId: 'pro',
      currentPeriodEnd: new Date(1_790_000_000 * 1000).toISOString(),
    });
  });

  it('follows a portal upgrade/downgrade to the new price', () => {
    expect(subscriptionUpdateFromStripe(sub('active', item('ultra'))).planId).toBe('ultra');
    expect(subscriptionUpdateFromStripe(sub('active', item('starter'))).planId).toBe('starter');
  });

  it('passes dunning/terminal statuses through so entitlements can drop them', () => {
    for (const status of ['unpaid', 'incomplete_expired', 'paused', 'canceled']) {
      const next = subscriptionUpdateFromStripe(sub(status, item('pro')));
      expect(next.status).toBe(status);
      expect(effectivePlanId({ planId: next.planId ?? 'pro', status: next.status })).toBe(
        'starter',
      );
    }
    const pastDue = subscriptionUpdateFromStripe(sub('past_due', item('pro')));
    expect(effectivePlanId({ planId: pastDue.planId ?? '', status: pastDue.status })).toBe('pro');
  });

  it('returns a null plan (keep stored plan) for unknown or non-plan prices', () => {
    expect(subscriptionUpdateFromStripe(sub('active', item('enterprise'))).planId).toBeNull();
    expect(subscriptionUpdateFromStripe(sub('active', item('toString'))).planId).toBeNull();
    expect(subscriptionUpdateFromStripe(sub('active', item(null))).planId).toBeNull();
    expect(
      subscriptionUpdateFromStripe(
        sub('active', { current_period_end: 1, price: { metadata: { planId: 'pro' } } }),
      ).planId,
    ).toBeNull(); // missing kind=subscription
    expect(subscriptionUpdateFromStripe(sub('active', { price: null })).planId).toBeNull();
  });

  it('takes the latest item period end, or null when none is reported', () => {
    const next = subscriptionUpdateFromStripe(sub('active', item('pro', 100), item(null, 200)));
    expect(next.currentPeriodEnd).toBe(new Date(200_000).toISOString());
    expect(next.planId).toBe('pro');
    expect(subscriptionUpdateFromStripe(sub('active', item('pro', null))).currentPeriodEnd).toBe(
      null,
    );
    expect(subscriptionUpdateFromStripe(sub('active')).currentPeriodEnd).toBeNull();
  });
});
