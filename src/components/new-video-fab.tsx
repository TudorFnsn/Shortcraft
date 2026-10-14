'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Floating "New video" button on phones; hidden on Create, where Make video is the action. */
export function NewVideoFab() {
  const pathname = usePathname();
  if (pathname.startsWith('/create')) return null;
  // In a landmark so screen-reader users find it with the rest of the page (axe "region").
  return (
    <nav aria-label="Quick actions" className="md:hidden">
      <Link
        href="/create"
        aria-label="New video"
        className="bg-ink text-paper shadow-sheet fixed right-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-40 flex size-14 items-center justify-center rounded-[20px] md:hidden"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M10 4v12M4 10h12" />
        </svg>
      </Link>
    </nav>
  );
}
