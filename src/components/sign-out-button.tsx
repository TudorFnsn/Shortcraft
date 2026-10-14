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
      className="hover:bg-raised min-h-11 w-full rounded-lg px-2 py-2 text-left text-[15px] font-medium md:min-h-0"
    >
      Sign out
    </button>
  );
}
