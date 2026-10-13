/**
 * GET /auth/callback — the end of Google sign-in (features/auth/oauth.ts).
 * Supabase redirects here with `?code=` (PKCE); we exchange it for a session
 * (set as cookies by the server client) and redirect to the safe `next` path.
 * New accounts get their trial credits from the existing `handle_new_user`
 * trigger, exactly like email sign-ups.
 */
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { loginAfterOAuthError, safeNextPath } from '@/features/auth/oauth';
import { createSupabaseServerClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get('next'));
  const code = url.searchParams.get('code');
  const redirect = (path: string) => NextResponse.redirect(new URL(path, url.origin));

  // The user closed or denied Google's consent screen.
  if (!code) {
    const cancelled = url.searchParams.get('error') === 'access_denied';
    return redirect(loginAfterOAuthError(next, cancelled ? 'oauth_cancelled' : 'oauth_failed'));
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw new Error(error.message);
  } catch (e) {
    // Expired/reused code, a verifier cookie from another browser, or no Supabase config.
    logger.warn('oauth code exchange failed', { error: (e as Error).message });
    return redirect(loginAfterOAuthError(next, 'oauth_failed'));
  }
  return redirect(next);
}
