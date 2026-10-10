/**
 * Checkout consent: the buyer must accept the Terms and waive the EU right of
 * withdrawal for digital content before we start a Stripe Checkout. The
 * acceptance is stored on the Checkout Session (and its subscription /
 * payment intent) so there is a record of it per purchase, with no migration.
 */
import { z } from 'zod';
import { TERMS_VERSION } from '@/config/legal';

/** Body of POST /api/checkout. `acceptTerms` must be literally `true`. */
export const CheckoutBody = z.object({
  key: z.string().min(1).max(64),
  acceptTerms: z.literal(true),
});

export type CheckoutConsentMetadata = {
  terms_version: string;
  withdrawal_waiver_at: string;
};

export function checkoutConsentMetadata(now: Date): CheckoutConsentMetadata {
  return { terms_version: TERMS_VERSION, withdrawal_waiver_at: now.toISOString() };
}
