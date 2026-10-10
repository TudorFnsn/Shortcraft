/**
 * POST /api/checkout — start a Stripe Checkout for a plan or top-up pack.
 * Body: { key: "<price lookup_key>", acceptTerms: true } (e.g. "pro_monthly" or "topup_60k").
 * `acceptTerms` records the Terms + EU withdrawal-waiver consent; without it → 400.
 * Returns { url } to redirect the browser to.
 */
import { getCurrentUser } from '@/features/auth/session';
import { createCheckoutSession } from '@/features/billing/checkout';
import { CheckoutBody, checkoutConsentMetadata } from '@/features/billing/consent';

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  const parsed = CheckoutBody.safeParse(body);
  if (!parsed.success) {
    const termsMissing =
      typeof body === 'object' &&
      body !== null &&
      (body as { acceptTerms?: unknown }).acceptTerms !== true;
    return Response.json(
      { error: termsMissing ? 'terms_not_accepted' : 'invalid_input' },
      { status: 400 },
    );
  }

  const origin = new URL(request.url).origin;
  const result = await createCheckoutSession({
    userId: user.id,
    email: user.email,
    lookupKey: parsed.data.key,
    origin,
    consent: checkoutConsentMetadata(new Date()),
  });
  if (!result.ok) return Response.json({ error: result.error.code }, { status: 400 });
  return Response.json({ url: result.value.url });
}
