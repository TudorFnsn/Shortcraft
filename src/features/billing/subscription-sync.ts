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
