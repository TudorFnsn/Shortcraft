/**
 * Idempotent credit grants for paid events.
 *
 * Every grant the Stripe webhook makes carries a key. The ledger stores it under a
 * unique index (migration 0003), so a replayed or retried event can never grant
 * twice, independently of the `stripe_events` claim. That frees handlers to grant
 * BEFORE other writes when a retry would otherwise lose the grant (see the
 * mid-cycle upgrade in webhook.ts).
 *
 * Keys:
 *  - checkout / renewal: one grant per Stripe event (`eventGrantKey`).
 *  - upgrade: one bonus per subscription, billing period and target plan
 *    (`upgradeGrantKey`). Keying by period rather than by event means two
 *    `.updated` events describing the same upgrade can't both pay out, and
 *    toggling Pro → Starter → Pro inside one period (net-zero after Stripe
 *    proration) earns the bonus only once.
 */
import type { createSupabaseAdminClient } from '@/utils/supabase/admin';
import type { PlanId } from '@/config/plans';
import { upgradeCreditDelta } from './subscription-sync';

export type GrantReason = 'topup' | 'monthly_grant';

/** Event-scoped grants. One event can make at most one grant per purpose. */
export type EventGrantPurpose = 'checkout' | 'renewal';

export type GrantOutcome = 'granted' | 'duplicate';

export const eventGrantKey = (eventId: string, purpose: EventGrantPurpose): string =>
  `stripe:event:${eventId}:${purpose}`;

export const upgradeGrantKey = (
  subscriptionId: string,
  periodEnd: string,
  toPlan: string,
): string => `stripe:upgrade:${subscriptionId}:${periodEnd}:${toPlan}`;

export interface UpgradeGrant {
  credits: number;
  key: string;
}

/**
 * The mid-cycle upgrade bonus for a live subscription moving `fromPlan` → `toPlan`,
 * or null when there is none (not an upgrade, or not a live, paid status).
 */
export function upgradeGrantFor(args: {
  eventId: string;
  subscriptionId: string;
  currentPeriodEnd: string | null;
  status: string;
  fromPlan: string | null | undefined;
  toPlan: PlanId;
}): UpgradeGrant | null {
  if (args.status !== 'active' && args.status !== 'trialing') return null;
  const credits = upgradeCreditDelta(args.fromPlan, args.toPlan);
  if (credits <= 0) return null;
  // No period end on the payload (shouldn't happen for a live sub): fall back to
  // the event, which still makes retries of this event safe.
  const period = args.currentPeriodEnd ?? `event-${args.eventId}`;
  return { credits, key: upgradeGrantKey(args.subscriptionId, period, args.toPlan) };
}

/** Port: Supabase in prod, in-memory in tests. */
export interface CreditGrantLedger {
  grantOnce(
    userId: string,
    credits: number,
    reason: GrantReason,
    key: string,
  ): Promise<GrantOutcome>;
}

interface Log {
  warn(message: string, fields?: Record<string, unknown>): void;
}

interface RpcError {
  code?: string;
  message?: string;
}

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Narrowest client surface we need, so tests can pass a fake. */
type RpcClient = Pick<Admin, 'rpc'>;

const isMissingFunction = (error: RpcError): boolean =>
  error.code === '42883' || // raw Postgres: undefined_function
  error.code === 'PGRST202' || // PostgREST: function not in schema cache
  /could not find the function/i.test(error.message ?? '');

export class SupabaseCreditGrantLedger implements CreditGrantLedger {
  constructor(
    private readonly admin: RpcClient,
    private readonly log: Log,
  ) {}

  async grantOnce(
    userId: string,
    credits: number,
    reason: GrantReason,
    key: string,
  ): Promise<GrantOutcome> {
    const { data, error } = await this.admin.rpc('grant_credits_once', {
      p_user: userId,
      p_delta: credits,
      p_reason: reason,
      p_key: key,
    });
    if (!error) return data === false ? 'duplicate' : 'granted';

    if (isMissingFunction(error)) {
      // Migration 0003 not applied yet: grant without the ledger key, so paying
      // customers still get credits (the stripe_events claim still dedupes).
      this.log.warn('grant_credits_once missing; granting without ledger key (run migration 0003)');
      const fallback = await this.admin.rpc('add_credits', {
        p_user: userId,
        p_delta: credits,
        p_reason: reason,
        p_job: null,
      });
      if (fallback.error) throw new Error(`add_credits failed: ${fallback.error.message}`);
      return 'granted';
    }
    // Throw so the event is released and retried: a silent failure here means a
    // customer paid and got nothing.
    throw new Error(`grant_credits_once failed: ${error.message}`);
  }
}

export class InMemoryCreditGrantLedger implements CreditGrantLedger {
  readonly grants = new Map<string, { userId: string; credits: number; reason: GrantReason }>();

  async grantOnce(
    userId: string,
    credits: number,
    reason: GrantReason,
    key: string,
  ): Promise<GrantOutcome> {
    if (this.grants.has(key)) return 'duplicate';
    this.grants.set(key, { userId, credits, reason });
    return 'granted';
  }

  balance(userId: string): number {
    let total = 0;
    for (const g of this.grants.values()) if (g.userId === userId) total += g.credits;
    return total;
  }
}
