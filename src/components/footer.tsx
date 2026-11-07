import Link from 'next/link';
import { CARRIED_IDEA_MAX_CHARS, siteConfig } from '@/config/site';
import { getCurrentUser } from '@/features/auth/session';
import { FooterSwitch } from './footer-switch';
import { Note } from './ui/note';
import { buttonClasses } from './ui/button';

const LEGAL = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/terms#refunds', label: 'Refunds' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/ideas', label: 'Video ideas' },
] as const;

/**
 * Boxes footer (DesignPlan §4 B.2, boards Main and PhoneLanding). On the
 * landing, pricing, legal, keyword and ideas pages it is a dark box: the
 * Urbanist line, an idea form (a plain GET into Create, or sign-up first), the
 * handwritten "Go on... post one today!", a giant SHORTCRAFT and the links split
 * by thin blush rules. App pages keep a slim row of the same links.
 */
export async function Footer() {
  const user = await getCurrentUser();
  const action = user ? '/create' : '/login';

  const big = (
    <footer className="box-dark rounded-box mx-2 mb-2 flex flex-col gap-14 overflow-hidden px-5 pt-14 pb-8 sm:mx-6 sm:mb-6 sm:gap-20 sm:px-12 sm:pt-24 sm:pb-10 lg:px-20">
      <div className="flex flex-wrap justify-between gap-10 lg:gap-16">
        <div className="flex flex-col gap-5">
          <p className="font-label m-0 text-[24px] leading-[1.2] uppercase sm:text-[32px]">
            The video studio
            <br />
            for faceless channels
          </p>
          <p className="font-label m-0 text-[16px] uppercase">Made in the EU</p>
        </div>
        <Note
          colour="orange"
          rotate={-23}
          className="mt-6 text-center text-[40px] sm:mt-14 sm:text-[48px]"
        >
          Go on... post
          <br />
          one today!
        </Note>
        {/* A plain GET form: works without JavaScript and carries the idea into Create. */}
        <form action={action} method="get" className="flex w-full max-w-[480px] flex-col gap-5">
          <label htmlFor="footer-idea" className="text-[16px]">
            Your idea
          </label>
          <input
            id="footer-idea"
            name="idea"
            type="text"
            maxLength={CARRIED_IDEA_MAX_CHARS}
            placeholder="Why honey never spoils"
            className="field-line px-1 py-2.5 text-[24px] text-white sm:text-[28px]"
          />
          <button type="submit" className={buttonClasses({ size: 'lg', className: 'w-full' })}>
            Make it
          </button>
        </form>
      </div>
      <p
        aria-hidden="true"
        className="font-poster m-0 text-center text-[25vw] leading-[.7] uppercase select-none lg:text-[min(25vw,26rem)]"
      >
        {siteConfig.name}
      </p>
      <nav
        aria-label="Footer"
        className="font-label flex flex-wrap justify-center text-[16px] uppercase"
      >
        {LEGAL.map((l, i) => (
          <Link
            key={l.href}
            href={l.href}
            className={`inline-flex min-h-11 items-center px-5 hover:underline ${
              i < LEGAL.length - 1 ? 'border-r border-[rgb(240_226_221/.5)]' : ''
            }`}
          >
            {l.label}
          </Link>
        ))}
        <a
          href={`mailto:${siteConfig.supportEmail}`}
          className="inline-flex min-h-11 items-center px-5 normal-case hover:underline"
        >
          {siteConfig.supportEmail}
        </a>
      </nav>
    </footer>
  );

  const slim = (
    <footer className="font-label text-ink-muted flex flex-wrap items-center justify-center gap-x-5 gap-y-1 px-6 py-4 text-[13px] uppercase">
      <span>© {siteConfig.name}</span>
      {LEGAL.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="hover:text-ink inline-flex min-h-11 items-center px-1"
        >
          {l.label}
        </Link>
      ))}
      <a
        href={`mailto:${siteConfig.supportEmail}`}
        className="hover:text-ink inline-flex min-h-11 items-center px-1 normal-case"
      >
        {siteConfig.supportEmail}
      </a>
    </footer>
  );

  return <FooterSwitch big={big} slim={slim} />;
}
