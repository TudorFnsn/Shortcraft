import type { Metadata } from 'next';
import { PRIVACY } from '@/config/legal';
import { siteConfig } from '@/config/site';
import { LegalDocumentView } from '@/components/legal-document';

export const metadata: Metadata = { title: `${PRIVACY.title} — ${siteConfig.name}` };

export default function PrivacyPage() {
  return <LegalDocumentView doc={PRIVACY} />;
}
