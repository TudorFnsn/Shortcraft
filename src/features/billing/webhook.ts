/**
 * Stripe webhook processing. Grants credits and syncs subscription state.
 *
 * Credit-grant sources (kept simple + robust across Stripe API versions):
 *  - checkout.session.completed: first purchase — grant credits from the line
 *    items' price metadata (top-up OR the subscription's first month), and
 *    record the subscription + plan.
 *  - invoice.paid (billing_reason=subscription_cycle): renewals — grant that
 *    plan's monthly credits (looked up from our config by the profile's plan).
 *  - customer.subscription.updated / .deleted: sync plan + status (upgrades,
 *    downgrades, dunning, cancel) — these drive plan limits. `.updated` is
 *    re-fetched from Stripe because delivery order isn't guaranteed.
 *
 * Idempotent at two levels: each event id is claimed once in stripe_events
 * before handling, and released again if handling fails so Stripe's retry
 * reprocesses it (see event-ledger.ts). Every grant also carries a ledger
 * idempotency key (credit-grant.ts, migration 0003), so no retry or replay can
 * grant twice, whatever order the writes of a branch run in.
 */
import type Stripe from 'stripe';
import { PLANS, type PlanId } from '@/config/plans';
import { logger } from '@/lib/logger';
import { getStripe } from '@/utils/stripe';
import {
  eventGrantKey,
  SupabaseCreditGrantLedger,
  upgradeGrantFor,
  type CreditGrantLedger,
  type GrantReason,
} from './credit-grant';
import { processStripeEventOnce, SupabaseStripeEventLedger } from './event-ledger';
import { currentSubscriptionFor, subscriptionRowFromStripe } from './subscription-sync';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

type Admin = ReturnType<typeof createSupabaseAdminClient>;

const customerId = (c: string | { id: string } | null | undefined): string | null =>
  typeof c === 'string' ? c : (c?.id ?? null);

type Log = ReturnType<typeof logger.with>;

async function grant(
  ledger: CreditGrantLedger,
  log: Log,
  userId: string,
  credits: number,
  reason: GrantReason,
  key: string,
): Promise<void> {
  if (credits <= 0) return;
  // Throws on failure so the event is released and retried.
  const outcome = await ledger.grantOnce(userId, credits, reason, key);
  if (outcome === 'duplicate') log.info('credit grant already applied', { userId, key });
}

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  const admin = createSupabaseAdminClient();
  const log = logger.with({ stripeEvent: event.type, id: event.id });

  const grants = new SupabaseCreditGrantLedger(admin, log);
  const handle = () => applyStripeEvent(admin, grants, event, log);
  await processStripeEventOnce(new SupabaseStripeEventLedger(admin), event, handle, log);
}

async function applyStripeEvent(
  admin: Admin,
  grants: CreditGrantLedger,
  event: Stripe.Event,
  log: Log,
): Promise<void> {
  const stripe = getStripe();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId = session.metadata?.userId ?? session.client_reference_id ?? undefined;
      if (!userId) break;

      const cust = customerId(session.customer);
      if (cust) await admin.from('profiles').update({ stripe_customer_id: cust }).eq('id', userId);

      const items = await stripe.checkout.sessions.listLineItems(session.id, {
        expand: ['data.price'],
      });
      let credits = 0;
      let planId: string | null = null;
      for (const item of items.data) {
        const md = item.price?.metadata ?? {};
        credits += Number(md.credits ?? 0) * (item.quantity ?? 1);
        if (md.kind === 'subscription' && md.planId) planId = md.planId;
      }

      const isSub = session.mode === 'subscription';
      if (isSub && session.subscription) {
        const { error } = await admin.from('subscriptions').upsert(
          {
            user_id: userId,
            plan_id: planId ?? 'starter',
            status: 'active',
            stripe_subscription_id: String(session.subscription),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        );
        if (error) throw new Error(`subscription record failed: ${error.message}`);
        await admin
          .from('profiles')
          .update({ plan_id: planId ?? 'starter' })
          .eq('id', userId);
      }
      await grant(
        grants,
        log,
        userId,
        credits,
        isSub ? 'monthly_grant' : 'topup',
        eventGrantKey(event.id, 'checkout'),
      );
      log.info('checkout completed', { userId, credits, isSub, planId });
      break;
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice & { billing_reason?: string };
      if (invoice.billing_reason !== 'subscription_cycle') break; // first cycle handled above
      const cust = customerId(invoice.customer);
      if (!cust) break;
      const { data: profile } = await admin
        .from('profiles')
        .select('id, plan_id')
        .eq('stripe_customer_id', cust)
        .maybeSingle();
      if (!profile) break;
      const plan = PLANS[profile.plan_id as PlanId];
      if (plan) {
        await grant(
          grants,
          log,
          profile.id as string,
          plan.monthlyCredits,
          'monthly_grant',
          eventGrantKey(event.id, 'renewal'),
        );
      }
      log.info('renewal credited', { userId: profile.id, planId: profile.plan_id });
      break;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = await currentSubscriptionFor(event, (id) => stripe.subscriptions.retrieve(id));
      const cust = customerId(sub.customer);
      if (!cust) break;
      const { data: profile } = await admin
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', cust)
        .maybeSingle();
      if (!profile) {
        log.warn('subscription event for unknown customer', { customer: cust });
        break;
      }

      const row = subscriptionRowFromStripe(sub);
      const { data: existing } = await admin
        .from('subscriptions')
        .select('stripe_subscription_id, plan_id')
        .eq('user_id', profile.id)
        .maybeSingle();
      const existingRow = existing as {
        stripe_subscription_id: string | null;
        plan_id: string | null;
      } | null;
      // Captured BEFORE the upsert below so we can detect an upgrade transition.
      const oldPlanId = existingRow?.plan_id ?? null;
      // Ignore stale events for a subscription the user has since replaced.
      const storedSubId = existingRow?.stripe_subscription_id;
      if (storedSubId && storedSubId !== row.stripeSubscriptionId) {
        log.info('ignoring event for superseded subscription', { sub: row.stripeSubscriptionId });
        break;
      }

      const planId = row.planId ?? undefined; // unknown plan → keep the stored one
      if (!existing && !planId) {
        log.warn('subscription event without a known plan and no stored row; skipped');
        break;
      }

      // Mid-cycle upgrade: grant the plan-credit difference now instead of making
      // the user wait until the next renewal. Granted BEFORE the plan write: if
      // that write fails, the retry still sees the old plan and recomputes the
      // same bonus, and the ledger key makes the second grant a no-op. (Granting
      // after it lost the bonus whenever a later step failed.)
      const upgrade =
        event.type === 'customer.subscription.updated' && planId
          ? upgradeGrantFor({
              eventId: event.id,
              subscriptionId: row.stripeSubscriptionId,
              currentPeriodEnd: row.currentPeriodEnd,
              status: row.status,
              fromPlan: oldPlanId,
              toPlan: planId,
            })
          : null;
      if (upgrade) {
        await grant(
          grants,
          log,
          profile.id as string,
          upgrade.credits,
          'monthly_grant',
          upgrade.key,
        );
        log.info('mid-cycle upgrade credited', {
          userId: profile.id,
          from: oldPlanId,
          to: planId,
          bonus: upgrade.credits,
        });
      }
      const { error } = await admin.from('subscriptions').upsert(
        {
          user_id: profile.id,
          ...(planId ? { plan_id: planId } : {}),
          status: row.status,
          stripe_subscription_id: row.stripeSubscriptionId,
          current_period_end: row.currentPeriodEnd,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
      if (error) throw new Error(`subscription sync failed: ${error.message}`); // Stripe retries
      if (planId) await admin.from('profiles').update({ plan_id: planId }).eq('id', profile.id);

      log.info('subscription synced', { userId: profile.id, status: row.status, planId });
      break;
    }

    default:
      break;
  }
}
