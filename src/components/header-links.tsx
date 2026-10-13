'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** The signed-in header's quiet links; marks the page you're on. */
export function HeaderLinks({ balance }: { balance: number }) {
  const pathname = usePathname();
  const onVideos = pathname.startsWith('/gallery');
  const onCreate = pathname.startsWith('/create');

  return (
    <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
      <Link
        href="/gallery"
        aria-current={onVideos ? 'page' : undefined}
        className={`hidden min-h-11 items-center rounded-full px-3.5 text-[15px] font-medium transition-colors md:inline-flex ${
          onVideos ? 'text-ink' : 'text-ink-muted hover:text-ink'
        }`}
      >
        Your videos
      </Link>
      {/* The balance is always in view; it doubles as the way to top up. */}
      <Link
        href="/pricing"
        className="text-ink-muted hover:text-ink inline-flex min-h-11 items-center rounded-full px-3 text-sm tabular-nums transition-colors"
      >
        {balance.toLocaleString('en-US')}
        <span className="ml-1">credits</span>
      </Link>
      {!onCreate && (
        <Link
          href="/create"
          className="bg-raised text-ink hover:bg-line hidden min-h-11 items-center gap-2 rounded-full px-4 text-[15px] font-semibold transition-colors md:inline-flex"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M10 4v12M4 10h12" />
          </svg>
          New video
        </Link>
      )}
    </nav>
  );
}
