/**
 * Sentry options, shared by the server (`instrumentation.ts`) and the browser
 * (`instrumentation-client.ts`). Pure, for tests: takes an env-like record.
 *
 * Errors only: no performance tracing (cost) and no Session Replay (it records
 * the screen and would need cookie/recording consent). Without a DSN this
 * returns null and Sentry stays off, so mock/dev/CI runs need nothing.
 */
import type { ErrorEvent } from '@sentry/nextjs';

type EnvLike = Readonly<Record<string, string | undefined>>;

export interface ObservabilityOptions {
  dsn: string;
  environment: string;
  release?: string;
  tracesSampleRate: 0;
  sendDefaultPii: false;
  beforeSend: (event: ErrorEvent) => ErrorEvent | null;
}

/** Headers that can carry credentials or identify a person. */
const SENSITIVE_HEADERS = [
  'authorization',
  'cookie',
  'x-forwarded-for',
  'x-real-ip',
  'stripe-signature',
];

/**
 * Last line of defence before an event leaves the app: drop the user, cookies,
 * credential headers and query strings (signed URLs and unsubscribe tokens
 * live there). Mutates and returns the event, as Sentry expects.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  delete event.user;
  if (event.request) {
    delete event.request.cookies;
    delete event.request.query_string;
    if (event.request.url) event.request.url = event.request.url.split('?')[0];
    const headers = event.request.headers;
    if (headers) {
      for (const k of Object.keys(headers)) {
        if (SENSITIVE_HEADERS.includes(k.toLowerCase())) delete headers[k];
      }
    }
  }
  return event;
}

export function sentryOptions(e: EnvLike): ObservabilityOptions | null {
  const dsn = e.NEXT_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn) return null;
  return {
    dsn,
    environment: e.NEXT_PUBLIC_VERCEL_ENV || e.VERCEL_ENV || e.NODE_ENV || 'development',
    release: e.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || e.VERCEL_GIT_COMMIT_SHA || undefined,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  };
}
