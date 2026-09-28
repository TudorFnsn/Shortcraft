/**
 * POST /api/checkout — start a Stripe Checkout for a plan or top-up pack.
 * Body: { key: "<price lookup_key>" } (e.g. "pro_monthly" or "topup_60k").
 * Returns { url } to redirect the browser to.
 */
import { z } from 'zod';
import { getCurrentUser } from '@/features/auth/session';
import { createCheckoutSession } from '@/features/billing/checkout';

const Body = z.object({ key: z.string().min(1).max(64) });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'invalid_input' }, { status: 400 });

  const origin = new URL(request.url).origin;
  const result = await createCheckoutSession({
    userId: user.id,
    email: user.email,
    lookupKey: parsed.data.key,
    origin,
  });
  if (!result.ok) return Response.json({ error: result.error.code }, { status: 400 });
  return Response.json({ url: result.value.url });
}
