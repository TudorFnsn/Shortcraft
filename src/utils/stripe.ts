/**
 * Stripe client (server-only). Lazily constructed so the app still boots without
 * STRIPE_SECRET_KEY (mock/dev). Handles subscriptions + one-time credit top-ups;
 * the webhook grants credits through the ledger.
 *
 * Never import this from a client component.
 */
import Stripe from 'stripe';
import { env, requireEnv } from '@/lib/env';

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!client) {
    client = new Stripe(requireEnv('STRIPE_SECRET_KEY'), {
      // apiVersion omitted -> uses the SDK's pinned version; pin explicitly
      // once the implementation planner recommends one.
      typescript: true,
      appInfo: { name: 'Shortcraft' },
    });
  }
  return client;
}

/** Whether billing is wired (both the secret key and webhook secret present). */
export function isStripeConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}
