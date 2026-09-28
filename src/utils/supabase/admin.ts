/**
 * Service-role Supabase client — bypasses RLS. This is how the SERVER performs
 * privileged work: creating render jobs/scenes/assets and calling the credit
 * RPCs. The service role key is a full-access secret.
 *
 * SERVER-ONLY. Never import this from a client component and never expose the
 * key to the browser. requireEnv() is called lazily (inside the factory) so the
 * app still boots in mock/dev mode without the key set.
 */
import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/lib/env';

export function createSupabaseAdminClient() {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
