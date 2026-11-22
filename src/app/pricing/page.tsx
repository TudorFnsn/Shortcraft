import type { Metadata } from 'next';
import { siteConfig } from '@/config/site';
import { getCurrentUser } from '@/features/auth/session';
import { getStore } from '@/features/render/store';
import { PricingView } from './pricing-view';

export const metadata: Metadata = { title: `Plans and credits — ${siteConfig.name}` };

export default async function PricingPage() {
  const user = await getCurrentUser();
  // Read-only: the plan a signed-in creator is on. Starter is also what anyone
  // without a subscription gets, so only Pro and Ultra are marked as current.
  // Anyone who has paid has a Stripe customer, so the billing portal works for them.
  const store = getStore();
  const [plan, hasPaid] = user
    ? await Promise.all([store.planOf(user.id), store.hasPaid(user.id)])
    : [null, false];
  return (
    <PricingView currentPlan={plan && plan !== 'starter' ? plan : null} canManagePlan={hasPaid} />
  );
}
