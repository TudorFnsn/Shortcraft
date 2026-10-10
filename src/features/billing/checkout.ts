/**
 * Create a Stripe Checkout Session for a plan (subscription) or top-up pack
 * (one-time). The price is resolved at runtime by its lookup_key, so no
 * environment-specific price ids live in the code.
 */
import { appError, err, ok, type AppError, type Result } from '@/lib/result';
import { getStripe } from '@/utils/stripe';
import type { CheckoutConsentMetadata } from './consent';
import { getOrCreateCustomer } from './customer';

export interface CheckoutParams {
  userId: string;
  email: string | undefined;
  lookupKey: string;
  origin: string;
  /** Terms version + withdrawal-waiver timestamp, recorded on the session. */
  consent: CheckoutConsentMetadata;
}

export async function createCheckoutSession(
  params: CheckoutParams,
): Promise<Result<{ url: string }, AppError>> {
  const stripe = getStripe();

  const prices = await stripe.prices.list({
    lookup_keys: [params.lookupKey],
    active: true,
    limit: 1,
  });
  const price = prices.data[0];
  if (!price) return err(appError('not_found', `no active price for "${params.lookupKey}"`));

  const mode = price.recurring ? 'subscription' : 'payment';
  const customer = await getOrCreateCustomer(params.userId, params.email);

  const metadata = { userId: params.userId, ...params.consent };
  const session = await stripe.checkout.sessions.create({
    mode,
    customer,
    line_items: [{ price: price.id, quantity: 1 }],
    client_reference_id: params.userId,
    metadata,
    ...(mode === 'subscription'
      ? { subscription_data: { metadata } }
      : { payment_intent_data: { metadata } }),
    allow_promotion_codes: true,
    success_url: `${params.origin}/gallery?checkout=success`,
    cancel_url: `${params.origin}/pricing?checkout=cancel`,
  });

  if (!session.url) return err(appError('internal', 'Stripe returned no checkout URL'));
  return ok({ url: session.url });
}
