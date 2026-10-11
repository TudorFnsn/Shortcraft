'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef } from 'react';
import { ThemeToggle } from './theme/theme-toggle';
import { SignOutButton } from './sign-out-button';
import { buttonClasses } from './ui/button';

/**
 * Phone navigation (DesignPlan D3): Library · Create · Account, fixed to the
 * bottom of the screen below `md`. Create is the one ember action; Account opens
 * a bottom sheet (a native modal <dialog>: focus trap, Esc, backdrop close).
 */
export function TabBar({ email, balance }: { email: string | null; balance: number }) {
  const pathname = usePathname();
  const sheet = useRef<HTMLDialogElement>(null);
  const onLibrary = pathname.startsWith('/gallery');
  const onCreate = pathname.startsWith('/create');
  const initial = (email?.trim()[0] ?? '?').toUpperCase();

  return (
    <>
      {/* Reserves the bar's height so page content never hides behind it. */}
      <div aria-hidden="true" className="h-[72px] md:hidden" />
      <nav
        aria-label="Main"
        className="bg-paper border-line fixed inset-x-0 bottom-0 z-40 grid h-[72px] grid-cols-3 items-center border-t px-3 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <Link
          href="/gallery"
          aria-current={onLibrary ? 'page' : undefined}
          className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-xs font-semibold ${
            onLibrary ? 'text-ink' : 'text-ink-muted'
          }`}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="4" y="3" width="7" height="11" rx="2" />
            <rect x="13" y="3" width="7" height="7" rx="2" />
            <rect x="13" y="12" width="7" height="9" rx="2" />
            <rect x="4" y="16" width="7" height="5" rx="2" />
          </svg>
          Library
        </Link>
        <Link
          href="/create"
          aria-label="Create"
          aria-current={onCreate ? 'page' : undefined}
          className={`bg-ember text-on-ember flex h-11 w-14 items-center justify-center justify-self-center rounded-2xl ${
            onCreate ? 'shadow-selected' : ''
          }`}
        >
          <svg
            width="22"
            height="22"
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
        <button
          type="button"
          onClick={() => sheet.current?.showModal()}
          aria-haspopup="dialog"
          className="text-ink-muted flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-xs font-semibold"
        >
          <span
            aria-hidden="true"
            className="bg-raised border-line-strong text-ink flex size-[22px] items-center justify-center rounded-full border text-[11px]"
          >
            {initial}
          </span>
          Account
        </button>
      </nav>

      <dialog
        ref={sheet}
        aria-labelledby="account-sheet-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) sheet.current?.close();
        }}
        className="bg-surface text-ink shadow-sheet backdrop:bg-scrim m-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-3xl p-0 md:hidden"
      >
        <div className="flex flex-col gap-4 px-4 pt-2.5 pb-[calc(28px+env(safe-area-inset-bottom))]">
          <span aria-hidden="true" className="bg-line-strong h-1 w-10 self-center rounded-full" />
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col">
              <h2
                id="account-sheet-title"
                className="truncate text-[17px] leading-[22px] font-semibold"
              >
                {email ?? 'Your account'}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => sheet.current?.close()}
              aria-label="Close"
              className="border-line flex size-11 shrink-0 items-center justify-center rounded-full border"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
          <div className="bg-paper rounded-card flex items-center justify-between gap-3 px-4 py-3.5">
            <span className="flex flex-col">
              <span className="text-ink-muted text-[13px]">Credits</span>
              <span className="text-xl leading-[26px] font-bold tabular-nums">
                {balance.toLocaleString('en-US')}
              </span>
            </span>
            <Link
              href="/pricing"
              onClick={() => sheet.current?.close()}
              className={buttonClasses()}
            >
              Get more
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">Appearance</span>
            <ThemeToggle />
          </div>
          <nav aria-label="Account" className="flex flex-col">
            <Link
              href="/pricing"
              onClick={() => sheet.current?.close()}
              className="border-line flex min-h-12 items-center border-b"
            >
              Plans and pricing
            </Link>
            <Link
              href="/terms"
              onClick={() => sheet.current?.close()}
              className="border-line flex min-h-12 items-center border-b"
            >
              Terms and privacy
            </Link>
            <div className="py-1">
              <SignOutButton />
            </div>
          </nav>
        </div>
      </dialog>
    </>
  );
}
