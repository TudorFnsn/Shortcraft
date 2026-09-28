/**
 * Map a Shortcraft user to a Stripe customer, creating one on first use and
 * caching the id on the profile. Server-only.
 */
import { getStripe } from '@/utils/stripe';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function getOrCreateCustomer(
  userId: string,
  email: string | undefined,
): Promise<string> {
  const admin = createSupabaseAdminClient();

  const { data: profile } = await admin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .maybeSingle();

  const existing = profile?.stripe_customer_id as string | null | undefined;
  if (existing) return existing;

  const customer = await getStripe().customers.create({
    email,
    metadata: { userId },
  });
  await admin.from('profiles').update({ stripe_customer_id: customer.id }).eq('id', userId);
  return customer.id;
}
