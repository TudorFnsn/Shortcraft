import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import {
  currentSubscriptionFor,
  subscriptionRowFromStripe,
} from '@/features/billing/subscription-sync';
import { effectivePlanId } from '@/features/billing/entitlements';

/** Minimal Subscription fixture — only the fields the mapper reads. */
function sub(
  status: string,
  items: { planId?: string; periodEnd?: number }[],
  id = 'sub_123',
): Stripe.Subscription {
  return {
    id,
    status,
    items: {
      data: items.map((i) => ({
        current_period_end: i.periodEnd,
        price: { metadata: i.planId ? { planId: i.planId } : {} },
      })),
    },
  } as unknown as Stripe.Subscription;
}

describe('subscriptionRowFromStripe', () => {
  it('maps plan, status, id and period end', () => {
    const row = subscriptionRowFromStripe(
      sub('active', [{ planId: 'pro', periodEnd: 1_790_000_000 }]),
    );
    expect(row).toEqual({
      planId: 'pro',
      status: 'active',
      stripeSubscriptionId: 'sub_123',
      currentPeriodEnd: new Date(1_790_000_000 * 1000).toISOString(),
    });
  });

  it('reflects an upgrade to a new plan', () => {
    expect(subscriptionRowFromStripe(sub('active', [{ planId: 'ultra' }])).planId).toBe('ultra');
  });

  it('returns a null plan for unknown or missing price metadata', () => {
    expect(subscriptionRowFromStripe(sub('active', [{ planId: 'enterprise' }])).planId).toBeNull();
    expect(subscriptionRowFromStripe(sub('active', [{}])).planId).toBeNull();
    expect(subscriptionRowFromStripe(sub('active', [])).planId).toBeNull();
  });

  it('picks the plan item among add-on items and the latest period end', () => {
    const row = subscriptionRowFromStripe(
      sub('active', [{ periodEnd: 100 }, { planId: 'starter', periodEnd: 200 }]),
    );
    expect(row.planId).toBe('starter');
    expect(row.currentPeriodEnd).toBe(new Date(200_000).toISOString());
  });

  it('leaves period end null when Stripe sends none', () => {
    expect(
      subscriptionRowFromStripe(sub('active', [{ planId: 'pro' }])).currentPeriodEnd,
    ).toBeNull();
  });
});

describe('lifecycle → plan limits', () => {
  const limitsAfter = (status: string) => {
    const row = subscriptionRowFromStripe(sub(status, [{ planId: 'pro' }]));
    return effectivePlanId({ planId: row.planId ?? 'starter', status: row.status });
  };

  it('keeps Pro limits while active or in dunning', () => {
    expect(limitsAfter('active')).toBe('pro');
    expect(limitsAfter('past_due')).toBe('pro');
  });

  it('drops to Starter limits once unpaid, paused or canceled', () => {
    expect(limitsAfter('unpaid')).toBe('starter');
    expect(limitsAfter('paused')).toBe('starter');
    expect(limitsAfter('canceled')).toBe('starter');
  });
});

describe('currentSubscriptionFor', () => {
  const event = (type: string, object: Stripe.Subscription) =>
    ({ type, data: { object } }) as unknown as Stripe.CustomerSubscriptionUpdatedEvent;

  it('re-fetches on .updated so a late, stale payload cannot regress state', async () => {
    const stale = sub('incomplete', [{ planId: 'pro' }]);
    const live = sub('active', [{ planId: 'pro' }]);
    const fetched: string[] = [];
    const result = await currentSubscriptionFor(
      event('customer.subscription.updated', stale),
      (id) => {
        fetched.push(id);
        return Promise.resolve(live);
      },
    );
    expect(fetched).toEqual(['sub_123']);
    expect(result.status).toBe('active');
  });

  it('trusts the payload on .deleted (terminal state, no API call)', async () => {
    const canceled = sub('canceled', [{ planId: 'pro' }]);
    const result = await currentSubscriptionFor(
      event('customer.subscription.deleted', canceled),
      () => Promise.reject(new Error('should not fetch')),
    );
    expect(result.status).toBe('canceled');
  });
});
