/**
 * Plan entitlements — what a user's plan lets them create.
 *
 * Users without a live subscription (trial, canceled, never paid) get the
 * Starter limits: they can make short standard videos and see what upgrading
 * unlocks. Enforced server-side in POST /api/jobs; the create form mirrors it.
 */
import type { ModelTier } from '@/config/models';
import { isTierAllowed, PLANS, type Plan, type PlanId } from '@/config/plans';
import { appError, err, ok, type AppError, type Result } from '@/lib/result';

/** Plan applied to anyone without a live subscription. */
export const FREE_PLAN_ID: PlanId = 'starter';

/** Stripe subscription statuses that still grant the paid plan's limits. */
const LIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);

export interface SubscriptionSnapshot {
  planId: string;
  status: string;
}

const isPlanId = (id: string): id is PlanId => Object.hasOwn(PLANS, id);

export function effectivePlanId(sub: SubscriptionSnapshot | null): PlanId {
  if (!sub || !LIVE_STATUSES.has(sub.status) || !isPlanId(sub.planId)) return FREE_PLAN_ID;
  return sub.planId;
}

/** Cheapest plan that unlocks a request, for "upgrade to X" copy. */
export function cheapestPlanAllowing(req: JobRequest): Plan | null {
  return (
    Object.values(PLANS)
      .sort((a, b) => a.priceCents - b.priceCents)
      .find((p) => withinLimits(p, req)) ?? null
  );
}

export interface JobRequest {
  targetDurationSec: number;
  modelTier: ModelTier;
}

const withinLimits = (plan: Plan, req: JobRequest): boolean =>
  req.targetDurationSec <= plan.limits.maxVideoDurationSec && isTierAllowed(plan, req.modelTier);

export function checkPlanLimits(plan: Plan, req: JobRequest): Result<void, AppError> {
  if (withinLimits(plan, req)) return ok(undefined);
  const upgrade = cheapestPlanAllowing(req);
  const what =
    req.targetDurationSec > plan.limits.maxVideoDurationSec
      ? `${req.targetDurationSec}s videos`
      : `${req.modelTier} quality`;
  return err(
    appError(
      'plan_limit',
      upgrade ? `${what} need the ${upgrade.name} plan.` : `${what} aren't available on any plan.`,
    ),
  );
}

/** Ledger reasons that mean the user paid us: a subscription grant or a top-up. */
export const PAID_GRANT_REASONS = ['monthly_grant', 'topup'] as const;

/** Port: resolve a user's current plan (Supabase in prod, in-memory in tests). */
export interface PlanRepository {
  planOf(userId: string): Promise<PlanId>;
  /**
   * True once the user has ever paid (any subscription grant or top-up), even
   * if the subscription has since lapsed. False = still on the free trial,
   * whose videos carry the "Made with Shortcraft" watermark.
   */
  hasPaid(userId: string): Promise<boolean>;
}
