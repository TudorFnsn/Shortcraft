'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { ThemeToggle } from './theme/theme-toggle';
import { SignOutButton } from './sign-out-button';

/** Avatar button that opens a small menu: account, plans, theme, sign out. */
export function AccountMenu({ email }: { email: string | null }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const initial = (email?.trim()[0] ?? '?').toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      // Closing unmounts the panel; keep keyboard focus on the trigger.
      if (rootRef.current?.contains(document.activeElement)) buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        className="bg-raised hover:bg-line flex size-11 items-center justify-center rounded-full text-sm font-semibold transition-colors md:size-10"
      >
        {initial}
      </button>
      {open && (
        <div
          id={menuId}
          className="rounded-panel border-line bg-surface shadow-sheet absolute top-11 right-0 z-20 flex w-72 flex-col gap-3 border p-3"
        >
          {email && <p className="text-ink-muted truncate px-2 pt-1 text-sm">{email}</p>}
          <Link
            href="/pricing"
            onClick={() => setOpen(false)}
            className="hover:bg-raised rounded-lg px-2 py-2 text-[15px] font-medium"
          >
            Plans &amp; credits
          </Link>
          <Link
            href="/voices"
            onClick={() => setOpen(false)}
            className="hover:bg-raised rounded-lg px-2 py-2 text-[15px] font-medium"
          >
            My voices
          </Link>
          <div className="flex flex-col gap-2 px-2">
            <span className="text-ink-muted text-sm">Theme</span>
            <ThemeToggle />
          </div>
          <div className="border-line border-t pt-2">
            <SignOutButton />
          </div>
        </div>
      )}
    </div>
  );
}
