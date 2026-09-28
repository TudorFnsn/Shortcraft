/**
 * Supabase client for browser / client components. Uses the publishable anon key
 * (safe to expose; protected by RLS). Read NEXT_PUBLIC_* directly so the typed
 * server env module is never pulled into the client bundle.
 */
import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
