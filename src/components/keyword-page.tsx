import type { Metadata } from 'next';
import Link from 'next/link';
import { siteConfig } from '@/config/site';
import { THEMES } from '@/config/themes';
import { PLANS } from '@/config/plans';
import { KEYWORD_PAGES, keywordPage } from '@/config/keyword-pages';
import { ThemeFrame } from '@/components/theme-frame';
import { ColourIn } from '@/components/motion/colour-in';
import { SplitLines } from '@/components/motion/split-lines';
import { Box } from '@/components/ui/box';
import { buttonClasses } from '@/components/ui/button';
import { STARTER, createHref, lookFor } from '@/components/ideas';
import { faqJsonLd, ideaPagePath, keywordPagePath } from '@/features/seo/site';

const fmt = (n: number) => n.toLocaleString('en-US');
const lowestPrice = Math.min(...Object.values(PLANS).map((p) => p.priceCents));
const eur = (cents: number) => `€${(cents / 100).toFixed(2)}`;

/** Metadata for a keyword landing page (title, description, canonical, Open Graph). */
export function keywordPageMetadata(slug: string): Metadata {
  const page = keywordPage(slug);
  const title = `${page.title} | ${siteConfig.name}`;
  const url = keywordPagePath(slug);
  return {
    title,
    description: page.description,
    alternates: { canonical: url },
    openGraph: { title, description: page.description, url, type: 'website' },
  };
}

const eyebrow = 'm-0 text-[clamp(1rem,2vw,1.5rem)] font-semibold tracking-[3px] uppercase';
const heading =
  'font-display m-0 text-[clamp(2.75rem,6vw,6.5rem)] leading-[.85] font-normal tracking-[-0.04em]';

/**
 * Public, indexable landing page for one search phrase (copy in
 * config/keyword-pages.ts). Boxes marketing scale (DesignPlan §4 B.2): a
 * hero-gradient box with the heading stagger, then alternating blush and sky
 * boxes that pop in, an idea form and the dark footer from the shell.
 */
export function KeywordPageView({ slug }: { slug: string }) {
  const page = keywordPage(slug);
  const themes = page.themeIds.flatMap((id) => THEMES.filter((t) => t.id === id));
  const others = KEYWORD_PAGES.filter((p) => p.slug !== slug);

  return (
    <main className="flex flex-col gap-3 px-2 pt-4 pb-6 sm:gap-6 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: faqJsonLd(page.faq) }}
      />

      <Box
        tone="hero"
        aria-labelledby="kw-h"
        className="flex flex-col gap-10 px-5 py-10 sm:px-12 sm:py-16 lg:flex-row lg:items-center lg:px-20 lg:py-24"
      >
        <div className="flex min-w-0 flex-col gap-5 lg:flex-[1_1_60%]">
          <nav
            aria-label="Breadcrumb"
            className="font-label text-ink-muted text-[15px] tracking-[1px] uppercase"
          >
            <Link href="/" className="hover:text-ink underline underline-offset-4">
              {siteConfig.name}
            </Link>{' '}
            / <span aria-current="page">{page.heading}</span>
          </nav>
          <SplitLines as="h1" id="kw-h" className={heading}>
            {page.heading}
          </SplitLines>
          {page.intro.map((p) => (
            <p key={p} className="m-0 max-w-[680px] text-[19px] leading-[1.45] font-light">
              {p}
            </p>
          ))}
          {/* A plain GET form, like the landing: carries the idea into Create (or sign-up). */}
          <form action="/create" method="get" className="flex max-w-[620px] flex-col gap-4">
            <input type="hidden" name="theme" value={STARTER.themeId} />
            <label
              htmlFor="kw-idea"
              className="text-ember-ink text-[14px] font-semibold tracking-[3px] uppercase"
            >
              What&apos;s your first video about?
            </label>
            <input
              id="kw-idea"
              name="idea"
              type="text"
              maxLength={300}
              placeholder={STARTER.topic}
              className="field-line text-ink min-h-11 px-1 py-2.5 text-[24px] sm:text-[28px]"
            />
            <button
              type="submit"
              className={buttonClasses({ size: 'lg', className: 'self-start' })}
            >
              Make your first video free
            </button>
          </form>
          <span className="text-ink-muted text-[15px]">
            {fmt(siteConfig.trialCredits)} free credits to start. No card needed. Plans from{' '}
            {eur(lowestPrice)} a month.
          </span>
        </div>
        <ColourIn
          aria-hidden="true"
          className="shadow-hero mx-auto w-[220px] shrink-0 overflow-hidden rounded-[8px] sm:w-[260px]"
        >
          <ThemeFrame themeId={themes[0]?.id ?? STARTER.themeId} variant="phone" />
        </ColourIn>
      </Box>

      <Box
        tone="blush"
        pop
        aria-labelledby="how-h"
        className="flex flex-col gap-8 px-5 py-14 sm:px-12 lg:px-20 lg:py-24"
      >
        <p className={`${eyebrow} text-ember-ink`}>Four steps</p>
        <SplitLines id="how-h" className={heading}>
          How it works
        </SplitLines>
        <ol className="m-0 grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {page.steps.map((step, i) => (
            <li key={step} className="flex items-baseline gap-4">
              <span aria-hidden="true" className="font-poster text-ember text-[64px] leading-[.8]">
                {i + 1}
              </span>
              <span className="font-display text-[22px] leading-[1.2] font-light">{step}</span>
            </li>
          ))}
        </ol>
      </Box>

      <Box
        tone="sky"
        pop
        alternate
        aria-labelledby="start-h"
        className="flex flex-col gap-8 px-5 py-14 sm:px-12 lg:px-20 lg:py-24"
      >
        <p className={eyebrow}>Looks</p>
        <SplitLines id="start-h" className={heading}>
          Start from a format that works
        </SplitLines>
        <ul className="m-0 grid list-none grid-cols-2 gap-5 p-0 md:grid-cols-4">
          {themes.map((t) => (
            <li key={t.id} className="flex flex-col gap-2.5">
              <Link href={ideaPagePath(t.id)} className="group flex flex-col gap-2.5">
                <ColourIn className="overflow-hidden rounded-[8px]">
                  <ThemeFrame themeId={t.id} variant="card" className="rounded-[8px]" />
                </ColourIn>
                <span className="flex flex-col gap-0.5">
                  <span className="font-display text-[22px] leading-tight group-hover:underline">
                    {t.label} ideas
                  </span>
                  <span className="text-[14px] leading-[18px]">{t.blurb}</span>
                </span>
              </Link>
              <Link
                href={createHref({ themeId: t.id, topic: lookFor(t.id).ideas[0]! })}
                className="press inline-flex min-h-11 items-center self-start rounded-[8px] px-3 text-[15px] font-semibold"
                aria-label={`Make a ${t.label} video`}
              >
                Make one
              </Link>
            </li>
          ))}
        </ul>
      </Box>

      <Box
        tone="blush"
        pop
        aria-labelledby="faq-h"
        className="flex flex-col gap-8 px-5 py-14 sm:px-12 lg:px-20 lg:py-24"
      >
        <SplitLines id="faq-h" className={heading}>
          Questions
        </SplitLines>
        <dl className="m-0 flex max-w-[860px] flex-col gap-6">
          {page.faq.map((f) => (
            <div key={f.q} className="flex flex-col gap-1.5">
              <dt className="font-display text-[24px] leading-tight">{f.q}</dt>
              <dd className="m-0 text-[17px] leading-[1.45]">{f.a}</dd>
            </div>
          ))}
        </dl>
      </Box>

      <nav
        aria-label="Related"
        className="font-label flex flex-wrap gap-x-6 gap-y-1 px-3 pt-4 text-[16px] uppercase sm:px-6"
      >
        <Link
          href="/ideas"
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          All video ideas
        </Link>
        <Link
          href="/pricing"
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Pricing
        </Link>
        {others.map((p) => (
          <Link
            key={p.slug}
            href={keywordPagePath(p.slug)}
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            {p.heading}
          </Link>
        ))}
      </nav>
    </main>
  );
}
