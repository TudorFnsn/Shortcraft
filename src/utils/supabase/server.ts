/**
 * Supabase client for Server Components / Route Handlers, bound to the request's
 * auth cookies. Use this for reads/writes that should run AS THE SIGNED-IN USER
 * (RLS applies). For privileged server work (the orchestrator's writes, credit
 * RPCs), use the admin client instead.
 *
 * Server-only: imports next/headers. Never import from a client component.
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireEnv } from '@/lib/env';

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore; the proxy
            // (src/proxy.ts) refreshes the session cookie on the response.
          }
        },
      },
    },
  );
}
