/**
 * Next.js Proxy (Next 16's renamed Middleware). One per project. Refreshes the
 * Supabase session on each request via the helper in utils/supabase/proxy.ts.
 */
import type { NextRequest } from 'next/server';
import { updateSession } from '@/utils/supabase/proxy';

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Run on everything except Next internals and static asset files.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
