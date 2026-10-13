import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AFTER_LOGIN,
  loginAfterOAuthError,
  oauthErrorMessage,
  oauthRedirectTo,
  safeNextPath,
} from '@/features/auth/oauth';

describe('oauthRedirectTo', () => {
  it('points at our callback with Create as next', () => {
    const url = new URL(oauthRedirectTo('https://s.app', { idea: null, theme: null }));
    expect(url.origin + url.pathname).toBe('https://s.app/auth/callback');
    expect(url.searchParams.get('next')).toBe('/create');
  });

  it('carries the idea and theme through to Create', () => {
    const url = new URL(
      oauthRedirectTo('https://s.app', { idea: 'Why cats purr', theme: 'fun-facts' }),
    );
    const next = new URL(url.searchParams.get('next')!, 'https://s.app');
    expect(next.pathname).toBe('/create');
    expect(next.searchParams.get('idea')).toBe('Why cats purr');
    expect(next.searchParams.get('theme')).toBe('fun-facts');
  });
});

describe('safeNextPath (no open redirects)', () => {
  it('keeps same-site paths', () => {
    expect(safeNextPath('/create?idea=x')).toBe('/create?idea=x');
    expect(safeNextPath('/gallery')).toBe('/gallery');
  });

  it.each([
    null,
    '',
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    '/\\/evil.com',
    'javascript:alert(1)',
    '/create\n',
    'create',
  ])('falls back to Create for %j', (next) => {
    expect(safeNextPath(next)).toBe(DEFAULT_AFTER_LOGIN);
  });
});

describe('OAuth errors', () => {
  it('maps callback error codes to plain messages, ignoring unknown ones', () => {
    expect(oauthErrorMessage('oauth_cancelled')).toMatch(/cancelled/);
    expect(oauthErrorMessage('oauth_failed')).toMatch(/didn’t work/);
    expect(oauthErrorMessage('<script>')).toBeNull();
    expect(oauthErrorMessage(null)).toBeNull();
  });

  it('sends a failed sign-in back to login, keeping the carried idea', () => {
    const href = loginAfterOAuthError(
      '/create?idea=Why+cats+purr&theme=fun-facts',
      'oauth_cancelled',
    );
    const url = new URL(href, 'https://s.app');
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('error')).toBe('oauth_cancelled');
    expect(url.searchParams.get('idea')).toBe('Why cats purr');
    expect(url.searchParams.get('theme')).toBe('fun-facts');
  });

  it('never forwards an unsafe next into the login link', () => {
    expect(loginAfterOAuthError('//evil.com/?idea=x', 'oauth_failed')).toBe(
      '/login?error=oauth_failed',
    );
  });
});
