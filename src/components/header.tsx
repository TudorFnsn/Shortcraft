import Link from 'next/link';
import { siteConfig } from '@/config/site';
import { getCurrentUser } from '@/features/auth/session';
import { getStore } from '@/features/render/store';
import { AccountMenu } from './account-menu';
import { BrandMark } from './brand-mark';
import { HeaderLinks } from './header-links';
import { buttonClasses } from './ui/button';

/**
 * Studio header (DesignPlan §4 S): logo, then a few quiet items on the right.
 * Signed in: Your videos · credits (always in view, links to top-ups) · New video
 * · avatar menu (theme, plans, sign out). Phones keep credits and the avatar;
 * "New video" is the floating + (MobileNav).
 */
export async function Header() {
  const user = await getCurrentUser();
  const balance = user ? await getStore().balance(user.id) : null;

  return (
    <header className="flex h-[72px] shrink-0 items-center justify-between gap-4 px-4 sm:px-8 xl:px-12">
      <Link
        href={user ? '/gallery' : '/'}
        className="flex min-h-11 items-center gap-2.5"
        aria-label={user ? `${siteConfig.name}, your videos` : siteConfig.name}
      >
        <BrandMark />
        <span className="font-display text-xl font-bold">{siteConfig.name}</span>
      </Link>

      {user ? (
        <div className="flex items-center gap-2 sm:gap-3">
          <HeaderLinks balance={balance ?? 0} />
          <AccountMenu email={user.email ?? null} />
        </div>
      ) : (
        <nav aria-label="Main" className="flex items-center gap-2">
          <Link
            href="/pricing"
            className="text-ink-muted hover:text-ink inline-flex min-h-11 items-center rounded-full px-3.5 text-[15px] font-medium"
          >
            Pricing
          </Link>
          <Link
            href="/login"
            className={buttonClasses({ size: 'sm', className: 'h-11 rounded-full px-5' })}
          >
            Log in
          </Link>
        </nav>
      )}
    </header>
  );
}
