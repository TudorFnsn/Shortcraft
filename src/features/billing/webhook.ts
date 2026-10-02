/**
 * Stripe webhook processing. Grants credits and syncs subscription state.
 *
 * Credit-grant sources (kept simple + robust across Stripe API versions):
 *  - checkout.session.completed: first purchase — grant credits from the line
 *    items' price metadata (top-up OR the subscription's first month), and
 *    record the subscription + plan.
 *  - invoice.paid (billing_reason=subscription_cycle): renewals — grant that
 *    plan's monthly credits (looked up from our config by the profile's plan).
 *  - customer.subscription.updated: mirror status, plan (upgrades/downgrades
 *    via the portal) and period end. Re-fetches the subscription so an
 *    out-of-order delivery can't regress state.
 *  - customer.subscription.deleted: mark the subscription canceled.
 *
 * Subscription events match our row by stripe_subscription_id, so a stale
 * event for an old subscription never touches a customer's newer one.
 *
 * Idempotent: each event id is recorded once in stripe_events before handling.
 */
import type Stripe from 'stripe';
import { PLANS, type PlanId } from '@/config/plans';
import { logger } from '@/lib/logger';
import { subscriptionUpdateFromStripe } from '@/features/billing/subscription-sync';
import { getStripe } from '@/utils/stripe';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

type Admin = ReturnType<typeof createSupabaseAdminClient>;

const customerId = (c: string | { id: string } | null | undefined): string | null =>
  typeof c === 'string' ? c : (c?.id ?? null);

async function grant(
  admin: Admin,
  userId: string,
  credits: number,
  reason: 'topup' | 'monthly_grant',
): Promise<void> {
  if (credits <= 0) return;
  await admin.rpc('add_credits', {
    p_user: userId,
    p_delta: credits,
    p_reason: reason,
    p_job: null,
  });
}

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  const admin = createSupabaseAdminClient();
  const log = logger.with({ stripeEvent: event.type, id: event.id });

  // Idempotency: first writer wins; a duplicate insert means already processed.
  const { error: seen } = await admin
    .from('stripe_events')
    .insert({ id: event.id, type: event.type });
  if (seen) {
    if (seen.code === '23505') {
      log.info('duplicate stripe event ignored');
      return; // already processed
    }
    const missingTable =
      seen.code === '42P01' || // raw Postgres: undefined_table
      seen.code === 'PGRST205' || // PostgREST: table not in schema cache
      /schema cache|find the table/i.test(seen.message ?? '');
    if (missingTable) {
      // stripe_events table not created yet — idempotency disabled, but don't
      // block delivery. Run migration 0002 to enable it.
      log.warn('stripe_events table missing; idempotency disabled (run migration 0002)');
    } else {
      throw new Error(`stripe_events insert failed: ${seen.message}`); // fail -> Stripe retries
    }
  }

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
      await grant(admin, userId, credits, isSub ? 'monthly_grant' : 'topup');

      if (isSub && session.subscription) {
        await admin.from('subscriptions').upsert(
          {
            user_id: userId,
            plan_id: planId ?? 'starter',
            status: 'active',
            stripe_subscription_id: String(session.subscription),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        );
        await admin
          .from('profiles')
          .update({ plan_id: planId ?? 'starter' })
          .eq('id', userId);
      }
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
      if (plan) await grant(admin, profile.id as string, plan.monthlyCredits, 'monthly_grant');
      log.info('renewal credited', { userId: profile.id, planId: profile.plan_id });
      break;
    }

    case 'customer.subscription.updated': {
      // Events can arrive out of order; Stripe's current object is the truth.
      const sub = await stripe.subscriptions.retrieve(event.data.object.id);
      const next = subscriptionUpdateFromStripe(sub);
      const { data: rows, error } = await admin
        .from('subscriptions')
        .update({
          status: next.status,
          current_period_end: next.currentPeriodEnd,
          ...(next.planId ? { plan_id: next.planId } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_subscription_id', sub.id)
        .select('user_id');
      if (error) throw new Error(`subscription update failed: ${error.message}`);
      const userId = rows?.[0]?.user_id as string | undefined;
      // Renewal grants read profiles.plan_id, so keep it in step with the plan.
      if (userId && next.planId) {
        await admin.from('profiles').update({ plan_id: next.planId }).eq('id', userId);
      }
      if (!userId) log.warn('subscription.updated for unknown subscription', { sub: sub.id });
      if (next.planId === null) log.warn('subscription has no known plan price', { sub: sub.id });
      log.info('subscription synced', { userId, ...next });
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const { error } = await admin
        .from('subscriptions')
        .update({ status: 'canceled', updated_at: new Date().toISOString() })
        .eq('stripe_subscription_id', sub.id);
      if (error) throw new Error(`subscription cancel failed: ${error.message}`);
      log.info('subscription canceled', { sub: sub.id });
      break;
    }

    default:
      break;
  }
}
