/**
 * Google sign-in (Supabase OAuth, PKCE). The browser starts the flow with
 * `signInWithOAuth`; Google returns to Supabase, which redirects to our
 * `/auth/callback?code=…&next=…`; the callback swaps the code for a session
 * cookie and sends the user on to `next`. Pure helpers, unit-tested.
 */
import { createHrefAfterLogin, type Carried } from './carry';

export const OAUTH_CALLBACK_PATH = '/auth/callback';

/** Where signed-in users land when `next` is missing or unsafe. */
export const DEFAULT_AFTER_LOGIN = '/create';

/**
 * The `redirectTo` for signInWithOAuth: our callback on this origin, carrying
 * where to go afterwards (Create, prefilled with a carried idea).
 * Supabase only honours it if it matches the project's Redirect URLs list.
 */
export function oauthRedirectTo(origin: string, carried: Carried): string {
  const next = createHrefAfterLogin(carried);
  return `${origin}${OAUTH_CALLBACK_PATH}?${new URLSearchParams({ next }).toString()}`;
}

/**
 * `next` from the callback URL, made safe: only a same-site path. Anything
 * else (absolute URLs, protocol-relative `//evil.com`, backslash tricks,
 * control characters) falls back to Create, so the callback can't be used as
 * an open redirect.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return DEFAULT_AFTER_LOGIN;
  }
  if (/[\u0000-\u001f\\]/.test(next)) return DEFAULT_AFTER_LOGIN;
  return next;
}

/** Login page message for `?error=` set by the callback. */
export function oauthErrorMessage(code: string | null | undefined): string | null {
  if (code === 'oauth_cancelled') return 'Google sign-in was cancelled. Try again, or use email.';
  if (code === 'oauth_failed') return 'Google sign-in didn’t work. Try again, or use email.';
  return null;
}

/**
 * Where the callback sends a failed sign-in: back to login with a message,
 * keeping a carried idea and referral code (read from the `next` Create link).
 */
export function loginAfterOAuthError(next: string, error: 'oauth_cancelled' | 'oauth_failed') {
  const q = new URLSearchParams({ error });
  const path = safeNextPath(next);
  const inner = new URL(path, 'http://x').searchParams;
  for (const k of ['idea', 'theme', 'ref']) {
    const v = inner.get(k);
    if (v) q.set(k, v);
  }
  return `/login?${q.toString()}`;
}

/** The referral code carried in the callback's `next` link, if any (unvalidated). */
export function refFromNext(next: string): string | null {
  return new URL(safeNextPath(next), 'http://x').searchParams.get('ref');
}
