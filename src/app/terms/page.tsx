import type { Metadata } from 'next';
import { TERMS } from '@/config/legal';
import { siteConfig } from '@/config/site';
import { LegalDocumentView } from '@/components/legal-document';

export const metadata: Metadata = { title: `${TERMS.title} — ${siteConfig.name}` };

export default function TermsPage() {
  return <LegalDocumentView doc={TERMS} />;
}
