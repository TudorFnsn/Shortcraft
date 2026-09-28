'use client';

import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/utils/supabase/client';

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await createSupabaseBrowserClient().auth.signOut();
        router.push('/');
        router.refresh();
      }}
      className="rounded-md px-3 py-1.5 text-sm text-neutral-300 hover:text-white"
    >
      Sign out
    </button>
  );
}
