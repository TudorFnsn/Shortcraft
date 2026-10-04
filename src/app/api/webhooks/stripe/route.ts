/**
 * POST /api/webhooks/stripe — Stripe event sink.
 * Verifies the signature against the raw body, then hands off to the handler.
 */
import { requireEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { getStripe } from '@/utils/stripe';
import { handleStripeEvent } from '@/features/billing/webhook';

export async function POST(request: Request) {
  const body = await request.text(); // raw body required for signature check
  const signature = request.headers.get('stripe-signature');
  if (!signature) return new Response('missing signature', { status: 400 });

  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      requireEnv('STRIPE_WEBHOOK_SECRET'),
    );
  } catch (cause) {
    logger.warn('stripe signature verification failed', { cause: String(cause) });
    return new Response('invalid signature', { status: 400 });
  }

  try {
    await handleStripeEvent(event);
  } catch (cause) {
    // `alert` is the stable tag to page on once Sentry/log alerts are wired (Phase 3).
    logger.error('stripe webhook handler error', {
      alert: 'stripe_webhook_failed',
      type: event.type,
      eventId: event.id,
      cause: String(cause),
    });
    return new Response('handler error', { status: 500 }); // Stripe will retry
  }

  return Response.json({ received: true });
}
