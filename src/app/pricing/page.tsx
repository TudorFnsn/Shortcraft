import type { Metadata } from 'next';
import { siteConfig } from '@/config/site';
import { PricingView } from './pricing-view';

export const metadata: Metadata = { title: `Plans and credits — ${siteConfig.name}` };

export default function PricingPage() {
  return <PricingView />;
}
