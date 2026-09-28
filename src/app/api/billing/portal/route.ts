/**
 * POST /api/billing/portal — open the Stripe Customer Portal so the user can
 * manage or cancel their subscription and see invoices.
 */
import { getCurrentUser } from '@/features/auth/session';
import { getStripe } from '@/utils/stripe';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle();

  const customer = profile?.stripe_customer_id as string | null | undefined;
  if (!customer) return Response.json({ error: 'no_customer' }, { status: 400 });

  const origin = new URL(request.url).origin;
  const session = await getStripe().billingPortal.sessions.create({
    customer,
    return_url: `${origin}/gallery`,
  });
  return Response.json({ url: session.url });
}
