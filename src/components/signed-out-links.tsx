'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Typed } from './motion/typed';

const LINK =
  'text-ink inline-flex min-h-11 items-center rounded-[8px] px-2 text-[13px] font-semibold tracking-[.5px] uppercase hover:text-ember-ink sm:px-3 sm:text-[14px] sm:tracking-[1px]';
const PRESS =
  'press text-ink inline-flex min-h-11 items-center whitespace-nowrap rounded-[8px] px-3 text-[13px] font-semibold tracking-[.5px] uppercase sm:px-[15px] sm:text-[14px] sm:tracking-[1px]';
const TYPED = ['make', 'post', 'go'] as const;

/**
 * Signed-out header (B.2): Sign in · Start free. The landing adds Looks and
 * Pricing, and its Start button types "Let's make|post|go".
 */
export function SignedOutLinks() {
  const landing = usePathname() === '/';
  return (
    <nav aria-label="Main" className="flex items-center gap-0.5 sm:gap-3">
      {landing && (
        <>
          <Link href="/ideas" className={`${LINK} max-md:hidden`}>
            Looks
          </Link>
          <Link href="/pricing" className={`${LINK} max-md:hidden`}>
            Pricing
          </Link>
        </>
      )}
      <Link href="/login" className={LINK}>
        Sign in
      </Link>
      <Link href="/login" className={`${PRESS} min-w-[112px] justify-end sm:min-w-[150px]`}>
        {landing ? (
          <>
            Let&apos;s&nbsp;
            <Typed words={TYPED} label="make a video, free" />
          </>
        ) : (
          'Start free'
        )}
      </Link>
    </nav>
  );
}
