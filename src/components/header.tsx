import Link from 'next/link';
import { siteConfig } from '@/config/site';
import { getCurrentUser } from '@/features/auth/session';
import { getStore } from '@/features/render/store';
import { AccountMenu } from './account-menu';
import { BrandMark } from './brand-mark';
import { NavLinks } from './nav-links';
import { buttonClasses } from './ui/button';

export async function Header() {
  const user = await getCurrentUser();
  const balance = user ? await getStore().balance(user.id) : null;

  return (
    <header className="border-line flex h-16 shrink-0 items-center justify-between gap-4 border-b px-4 sm:px-8">
      <div className="flex items-center gap-6 sm:gap-10">
        <Link href="/" className="flex items-center gap-2.5 max-md:min-h-11">
          <BrandMark />
          <span className="font-display text-xl font-bold tracking-tight">{siteConfig.name}</span>
        </Link>
        {/* Phones get the bottom tab bar instead (MobileNav). */}
        {user && (
          <div className="hidden md:block">
            <NavLinks />
          </div>
        )}
      </div>

      {user ? (
        <div className="flex items-center gap-3">
          {/* The balance is always in view; the pill doubles as the way to top up. */}
          <Link
            href="/pricing"
            className="border-line bg-surface hover:bg-raised flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm max-md:min-h-11"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
              className="text-ember-ink"
            >
              <circle cx="8" cy="8" r="6.2" />
              <path d="M8 4.8v6.4M5.6 8h4.8" />
            </svg>
            <span className="font-semibold tabular-nums">{(balance ?? 0).toLocaleString()}</span>
            <span className="text-ink-muted hidden sm:inline">credits</span>
            <span className="text-ember-ink ml-1 hidden font-semibold md:inline">Get more</span>
          </Link>
          <div className="hidden md:block">
            <AccountMenu email={user.email ?? null} />
          </div>
        </div>
      ) : (
        <nav aria-label="Main" className="flex items-center gap-2">
          <Link
            href="/pricing"
            className="text-ink-muted hover:text-ink rounded-full px-3.5 py-2 text-[15px] font-medium max-md:inline-flex max-md:min-h-11 max-md:items-center"
          >
            Pricing
          </Link>
          <Link href="/login" className={buttonClasses({ size: 'sm', className: 'max-md:h-11' })}>
            Log in
          </Link>
        </nav>
      )}
    </header>
  );
}
