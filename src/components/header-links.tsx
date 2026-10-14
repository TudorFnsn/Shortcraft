'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signedInLinks } from './shell-paths';

const LINKS = {
  videos: { href: '/gallery', label: 'Your videos' },
  create: { href: '/create', label: 'New video' },
} as const;

/**
 * The signed-in header (B.2): press-in links in Inter 600 uppercase to the page
 * you are not on, then the dark credits pill (always in view; it is also the
 * way to top up). Phones keep only the pill; "New video" is the floating +.
 */
export function HeaderLinks({ balance }: { balance: number }) {
  const pathname = usePathname();
  const credits = balance.toLocaleString('en-US');

  return (
    <nav aria-label="Main" className="flex items-center gap-2 sm:gap-3.5">
      {signedInLinks(pathname).map((id) => (
        <Link
          key={id}
          href={LINKS[id].href}
          className="press text-ink hidden min-h-11 items-center rounded-[8px] px-[15px] text-[14px] font-semibold tracking-[1px] uppercase md:inline-flex"
        >
          {LINKS[id].label}
        </Link>
      ))}
      <Link
        href="/pricing"
        aria-label={`${credits} credits. Get more`}
        className="bg-ink text-paper inline-flex min-h-11 items-center rounded-full px-4 text-[14px] font-semibold tabular-nums"
      >
        {credits}
        <span className="ml-1 max-sm:hidden">credits</span>
      </Link>
    </nav>
  );
}
