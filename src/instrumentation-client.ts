/**
 * Browser instrumentation: reports uncaught errors to Sentry when
 * NEXT_PUBLIC_SENTRY_DSN is set. Errors only, no replay, no cookies.
 *
 * The SDK is loaded lazily, after the page, so it never weighs on first load,
 * and not at all when no DSN was set at build time (the branch is dropped).
 */
import { sentryOptions } from '@/lib/observability';

// Spelled out: Next inlines NEXT_PUBLIC_* only for literal `process.env.X` reads.
const options = sentryOptions({
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
  NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  NODE_ENV: process.env.NODE_ENV,
});
if (process.env.NEXT_PUBLIC_SENTRY_DSN && options) {
  void import('@sentry/nextjs').then((Sentry) => Sentry.init(options));
}
