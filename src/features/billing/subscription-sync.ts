/**
 * Map a Stripe subscription to the fields we mirror on our `subscriptions` row.
 *
 * Pure (no I/O) so the mapping is unit-tested; the webhook applies the result.
 * The plan comes from the subscription price's metadata (`kind=subscription`,
 * `planId`), set by scripts/stripe-setup.mts — the same source checkout uses.
 */
import { PLANS, type PlanId } from '@/config/plans';

/** The slice of a Stripe.Subscription we read (structural, for easy fixtures). */
export interface StripeSubscriptionLike {
  status: string;
  items: {
    data: ReadonlyArray<{
      current_period_end?: number | null;
      price?: { metadata?: Record<string, string> | null } | null;
    }>;
  };
}

export interface SubscriptionUpdate {
  status: string;
  /** null when no item carries a known plan — keep the stored plan unchanged. */
  planId: PlanId | null;
  /** ISO timestamp, or null if Stripe didn't report one. */
  currentPeriodEnd: string | null;
}

const isPlanId = (id: string): id is PlanId => Object.hasOwn(PLANS, id);

export function subscriptionUpdateFromStripe(sub: StripeSubscriptionLike): SubscriptionUpdate {
  let planId: PlanId | null = null;
  let periodEnd: number | null = null;
  for (const item of sub.items.data) {
    const md = item.price?.metadata ?? {};
    if (md.kind === 'subscription' && md.planId && isPlanId(md.planId)) planId = md.planId;
    // Since Stripe API 2025-03, the period lives on each item; take the latest.
    const end = item.current_period_end;
    if (typeof end === 'number' && (periodEnd === null || end > periodEnd)) periodEnd = end;
  }
  return {
    status: sub.status,
    planId,
    currentPeriodEnd: periodEnd === null ? null : new Date(periodEnd * 1000).toISOString(),
  };
}
