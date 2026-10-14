import type { Metadata } from 'next';
import Link from 'next/link';
import { siteConfig } from '@/config/site';
import { PosterBox } from '@/components/poster-box';
import { buttonClasses } from '@/components/ui/button';

export const metadata: Metadata = { title: `Page not found — ${siteConfig.name}` };

/** 404 for unknown routes and notFound() (DesignPlan §4 B.2). */
export default function NotFound() {
  return (
    <PosterBox word="404" title="This page wandered off">
      <Link href="/" className={buttonClasses({ size: 'lg' })}>
        Take me home
      </Link>
    </PosterBox>
  );
}
