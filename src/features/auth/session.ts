/**
 * Server-side auth helpers. `getCurrentUser` reads the signed-in user from the
 * request cookies; returns null when nobody is signed in or Supabase auth isn't
 * configured (so pages degrade gracefully in mock/dev mode).
 */
import { env } from '@/lib/env';
import { createSupabaseServerClient } from '@/utils/supabase/server';

export function isAuthConfigured(): boolean {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function getCurrentUser() {
  if (!isAuthConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}
