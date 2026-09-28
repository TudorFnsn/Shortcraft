/**
 * GET /api/health/supabase — quick connectivity + migration check.
 * Needs only the URL + anon key. Reports whether we reached the project and
 * whether the schema (0001_init.sql) has been applied.
 */
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

export async function GET() {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    return Response.json({
      ok: false,
      configured: false,
      message: 'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local',
    });
  }

  const supabase = createClient(url, anon);
  // head+count touches the table without returning rows; RLS-safe.
  const { error } = await supabase.from('profiles').select('id', { head: true, count: 'exact' });

  if (!error) {
    return Response.json({ ok: true, connected: true, migrated: true });
  }
  if (error.code === '42P01') {
    return Response.json({
      ok: true,
      connected: true,
      migrated: false,
      hint: 'Connected. Apply supabase/migrations/0001_init.sql in the Supabase SQL editor.',
    });
  }
  return Response.json({
    ok: false,
    connected: false,
    code: error.code,
    error: error.message,
  });
}
