/**
 * Server instrumentation (Next.js `register` + `onRequestError`): starts Sentry
 * when NEXT_PUBLIC_SENTRY_DSN is set, and routes the logger's errors and
 * `alert`-tagged warnings to it. A no-op without a DSN.
 */
import * as Sentry from '@sentry/nextjs';
import { setErrorReporter } from '@/lib/logger';
import { sentryOptions } from '@/lib/observability';

export function register() {
  const options = sentryOptions(process.env);
  if (!options) return;
  Sentry.init(options);
  setErrorReporter((message, fields, level) => {
    Sentry.captureMessage(message, {
      level: level === 'error' ? 'error' : 'warning',
      extra: fields,
      tags: typeof fields?.alert === 'string' ? { alert: fields.alert } : undefined,
    });
  });
}

/** Errors thrown while rendering, in route handlers, server actions and the proxy. */
export const onRequestError = Sentry.captureRequestError;
