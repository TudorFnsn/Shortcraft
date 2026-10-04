/**
 * Map a Stripe Subscription onto our `subscriptions` row (pure, testable).
 *
 * `subscriptions.status` + `plan_id` drive plan limits (see entitlements.ts),
 * so every lifecycle event — upgrade, downgrade, dunning, cancel — funnels
 * through here. The plan comes from the price metadata written by
 * scripts/stripe-setup.mts (`metadata.planId`).
 */
import type Stripe from 'stripe';
import { PLANS, type PlanId } from '@/config/plans';

export interface SubscriptionRowPatch {
  /** Null when no item carries a known plan (keep the stored plan). */
  planId: PlanId | null;
  status: string;
  stripeSubscriptionId: string;
  /** ISO timestamp, or null when Stripe didn't send one. */
  currentPeriodEnd: string | null;
}

const isPlanId = (id: string | undefined): id is PlanId =>
  id !== undefined && Object.hasOwn(PLANS, id);

export function subscriptionRowFromStripe(sub: Stripe.Subscription): SubscriptionRowPatch {
  const items = sub.items?.data ?? [];
  const planItem = items.find((i) => isPlanId(i.price?.metadata?.planId));
  const periodEnds = items.map((i) => i.current_period_end).filter((t) => Number.isFinite(t));

  return {
    planId: (planItem?.price.metadata.planId as PlanId | undefined) ?? null,
    status: sub.status,
    stripeSubscriptionId: sub.id,
    currentPeriodEnd:
      periodEnds.length > 0 ? new Date(Math.max(...periodEnds) * 1000).toISOString() : null,
  };
}

/**
 * Credits to grant immediately when a subscription moves to a HIGHER plan
 * mid-cycle: the difference in monthly allotment (new − old). Floored at 0, so a
 * downgrade, an unchanged plan, or an unknown/first-time old plan grants nothing
 * (we never claw credits back). The new plan still grants its full allotment at
 * the next renewal — this just makes an upgrade felt now, not weeks later.
 */
export function upgradeCreditDelta(fromPlan: string | null | undefined, toPlan: PlanId): number {
  if (!fromPlan || !isPlanId(fromPlan) || fromPlan === toPlan) return 0;
  const delta = PLANS[toPlan].monthlyCredits - PLANS[fromPlan].monthlyCredits;
  return delta > 0 ? delta : 0;
}

/**
 * The subscription state to sync for an event. Stripe doesn't guarantee
 * delivery order, so for `.updated` we re-fetch the current object rather than
 * trust the (possibly stale) payload; `.deleted` is terminal, so its payload is final.
 */
export async function currentSubscriptionFor(
  event: Stripe.CustomerSubscriptionUpdatedEvent | Stripe.CustomerSubscriptionDeletedEvent,
  retrieve: (id: string) => Promise<Stripe.Subscription>,
): Promise<Stripe.Subscription> {
  if (event.type === 'customer.subscription.deleted') return event.data.object;
  return retrieve(event.data.object.id);
}
