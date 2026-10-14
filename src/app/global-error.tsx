'use client';

/**
 * Last-resort error screen (replaces the root layout when it crashes) and the
 * report to Sentry for errors no inner boundary caught. Own <html>/<body>, and
 * global styles imported here, as Next requires.
 */
import { useEffect } from 'react';
import './globals.css';

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
      <body className="bg-paper text-ink flex min-h-screen items-center justify-center p-6">
        <title>Something went wrong · Shortcraft</title>
        <main className="max-w-sm text-center">
          <h1 className="font-display text-2xl font-bold">Something went wrong</h1>
          <p className="text-ink-muted mt-2">
            We&apos;ve been notified. Your videos and credits are safe.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            className="bg-blush text-on-blush press rounded-button mt-6 min-h-11 px-5 font-semibold"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
