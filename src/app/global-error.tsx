'use client';

/**
 * Last-resort error screen (replaces the root layout when it crashes) and the
 * report to Sentry for errors no inner boundary caught. Own <html>/<body>, and
 * global styles imported here, as Next requires. Boxes look (DesignPlan §4
 * B.2): the ember box with an "OOPS" poster and one Try again; the fonts fall
 * back to system faces here, since the root layout (which loads them) is gone.
 */
import { useEffect } from 'react';
import './globals.css';
import { PosterBox } from '@/components/poster-box';
import { buttonClasses } from '@/components/ui/button';

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Lazy, like instrumentation-client: no SDK in the bundle without a DSN.
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      void import('@sentry/nextjs').then((Sentry) => Sentry.captureException(error));
    }
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-paper text-ink flex min-h-screen flex-col">
        <title>Something went wrong · Shortcraft</title>
        <PosterBox word="Oops" title="Something went wrong">
          <p className="m-0 max-w-[30ch] text-[24px] leading-[1.3] font-light">
            We&apos;ve been notified. Your videos and credits are safe.
          </p>
          <button type="button" onClick={() => retry()} className={buttonClasses({ size: 'lg' })}>
            Try again
          </button>
        </PosterBox>
      </body>
    </html>
  );
}
