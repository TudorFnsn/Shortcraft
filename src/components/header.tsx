import Link from 'next/link';
import { siteConfig } from '@/config/site';
import { getCurrentUser } from '@/features/auth/session';
import { getStore } from '@/features/render/store';
import { AccountMenu } from './account-menu';
import { BrandMark } from './brand-mark';
import { HeaderLinks } from './header-links';
import { SignedOutLinks } from './signed-out-links';

/**
 * Boxes header (DesignPlan §4 B.2, boards Create, Home and Main): the box mark
 * on the left, then a few press-in items on the right. Signed in: the link to
 * the page you are not on · the dark credits pill · the blush avatar menu.
 * Signed out: Sign in · Start free (the landing adds Looks, Pricing and the
 * typed "Let's make|").
 */
export async function Header() {
  const user = await getCurrentUser();
  const balance = user ? await getStore().balance(user.id) : null;

  return (
    <header className="flex min-h-[68px] shrink-0 items-center justify-between gap-3 px-3 py-2 sm:px-6 sm:py-3">
      <Link
        href={user ? '/gallery' : '/'}
        className="flex min-h-11 items-center"
        aria-label={user ? `${siteConfig.name}, your videos` : `${siteConfig.name} home`}
      >
        <BrandMark />
      </Link>

      {user ? (
        <div className="flex items-center gap-2 sm:gap-3.5">
          <HeaderLinks balance={balance ?? 0} />
          <AccountMenu email={user.email ?? null} />
        </div>
      ) : (
        <SignedOutLinks />
      )}
    </header>
  );
}
