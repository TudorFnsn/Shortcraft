'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { fabVisible } from './shell-paths';

/**
 * The phone "+" (B.2, board PhoneHome): a 64px ink square with a blush plus, on
 * Your videos and the voice pages only (Create has Make video instead).
 */
export function NewVideoFab() {
  if (!fabVisible(usePathname())) return null;
  return (
    <Link
      href="/create"
      aria-label="New video"
      className="text-blush fixed right-5 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-40 flex size-16 items-center justify-center rounded-[8px] bg-[#212121] shadow-[10px_10px_24px_rgb(0_0_0/.35)] md:hidden"
    >
      <svg
        width="26"
        height="26"
        viewBox="0 0 26 26"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M13 3v20M3 13h20" />
      </svg>
    </Link>
  );
}
