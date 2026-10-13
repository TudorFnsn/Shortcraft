import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ErrorEvent } from '@sentry/nextjs';
import { SUBPROCESSORS } from '@/config/legal';
import { logger, setErrorReporter } from '@/lib/logger';
import { scrubEvent, sentryOptions } from '@/lib/observability';

describe('sentryOptions', () => {
  it('keeps Sentry off without a DSN', () => {
    expect(sentryOptions({})).toBeNull();
    expect(sentryOptions({ NEXT_PUBLIC_SENTRY_DSN: '  ' })).toBeNull();
  });

  it('reports errors only, without PII, tagged with the deployment', () => {
    const o = sentryOptions({
      NEXT_PUBLIC_SENTRY_DSN: 'https://k@o1.ingest.sentry.io/1',
      VERCEL_ENV: 'preview',
      VERCEL_GIT_COMMIT_SHA: 'abc123',
    });
    expect(o).toMatchObject({
      environment: 'preview',
      release: 'abc123',
      tracesSampleRate: 0,
      sendDefaultPii: false,
    });
  });
});

describe('scrubEvent', () => {
  it('drops the user, cookies, credential headers and query strings', () => {
    const event = {
      type: undefined,
      user: { id: 'u1', email: 'a@x.com' },
      request: {
        url: 'https://s.app/api/email/unsubscribe?u=1&t=secret',
        query_string: 'u=1&t=secret',
        cookies: { sb: 'session' },
        headers: { Authorization: 'Bearer x', Cookie: 'sb=1', 'user-agent': 'UA' },
      },
    } as unknown as ErrorEvent;
    const out = scrubEvent(event);
    expect(out.user).toBeUndefined();
    expect(out.request).toEqual({
      url: 'https://s.app/api/email/unsubscribe',
      headers: { 'user-agent': 'UA' },
    });
  });
});

describe('logger error reporter', () => {
  afterEach(() => setErrorReporter(null));

  it('forwards errors and alert-tagged warnings, not plain warnings', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const seen: string[] = [];
    setErrorReporter((m, _f, level) => seen.push(`${level}:${m}`));
    logger.error('boom');
    logger.warn('stuck', { alert: 'stripe_event_stuck' });
    logger.warn('just a warning');
    logger.info('fine');
    expect(seen).toEqual(['error:boom', 'warn:stuck']);
  });

  it('never lets a failing reporter break the caller', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    setErrorReporter(() => {
      throw new Error('sentry down');
    });
    expect(() => logger.error('boom')).not.toThrow();
  });
});

describe('privacy policy', () => {
  it('lists Sentry as a processor', () => {
    expect(SUBPROCESSORS.map((s) => s.name)).toContain('Sentry');
  });
});
