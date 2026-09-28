import Link from 'next/link';
import { siteConfig } from '@/config/site';
import { getCurrentUser } from '@/features/auth/session';
import { SignOutButton } from './sign-out-button';

export async function Header() {
  const user = await getCurrentUser();

  return (
    <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-3">
      <Link href="/" className="text-lg font-semibold tracking-tight">
        {siteConfig.name}
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/pricing" className="text-neutral-300 hover:text-white">
          Pricing
        </Link>
        {user ? (
          <>
            <Link href="/create" className="text-neutral-300 hover:text-white">
              Create
            </Link>
            <Link href="/gallery" className="text-neutral-300 hover:text-white">
              My Creations
            </Link>
            <SignOutButton />
          </>
        ) : (
          <Link
            href="/login"
            className="rounded-md bg-white px-3 py-1.5 font-medium text-neutral-900 hover:bg-neutral-200"
          >
            Log in
          </Link>
        )}
      </nav>
    </header>
  );
}
