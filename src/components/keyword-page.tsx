import type { Metadata } from 'next';
import Link from 'next/link';
import { siteConfig } from '@/config/site';
import { THEMES } from '@/config/themes';
import { PLANS } from '@/config/plans';
import { KEYWORD_PAGES, keywordPage } from '@/config/keyword-pages';
import { ThemeFrame } from '@/components/theme-frame';
import { buttonClasses } from '@/components/ui/button';
import { STARTER, createHref, lookFor } from '@/components/ideas';
import { faqJsonLd, ideaPagePath, keywordPagePath } from '@/features/seo/site';

const fmt = (n: number) => n.toLocaleString('en-US');
const wrap = 'mx-auto max-w-[1344px] px-4 sm:px-8 xl:px-12';
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

/** Public, indexable landing page for one search phrase (copy in config/keyword-pages.ts). */
export function KeywordPageView({ slug }: { slug: string }) {
  const page = keywordPage(slug);
  const themes = page.themeIds.flatMap((id) => THEMES.filter((t) => t.id === id));
  const others = KEYWORD_PAGES.filter((p) => p.slug !== slug);

  return (
    <main className={`${wrap} flex flex-col gap-14 py-8 sm:py-14`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: faqJsonLd(page.faq) }}
      />

      <section
        aria-labelledby="kw-h"
        className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]"
      >
        <div className="flex min-w-0 flex-col gap-5">
          <h1
            id="kw-h"
            className="font-display text-[36px] leading-10 font-bold tracking-[-0.025em] sm:text-[52px] sm:leading-[56px]"
          >
            {page.heading}
          </h1>
          {page.intro.map((p) => (
            <p key={p} className="text-ink-muted max-w-[620px] text-[17px] leading-[26px]">
              {p}
            </p>
          ))}
          <Link
            href={createHref(STARTER)}
            className={buttonClasses({ size: 'lg', className: 'self-start' })}
          >
            Make your first video free
          </Link>
          <span className="text-ink-muted text-sm">
            {fmt(siteConfig.trialCredits)} free credits to start. No card needed. Plans from{' '}
            {eur(lowestPrice)} a month.
          </span>
        </div>
        <div
          aria-hidden="true"
          className="shadow-sheet mx-auto w-[220px] overflow-hidden rounded-[26px] border-[6px] border-[#050506]"
        >
          <ThemeFrame themeId={themes[0]?.id ?? STARTER.themeId} variant="phone" />
        </div>
      </section>

      <section aria-labelledby="how-h" className="flex flex-col gap-6">
        <h2 id="how-h" className="font-display text-[28px] leading-8 font-bold tracking-[-0.015em]">
          How it works
        </h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {page.steps.map((step, i) => (
            <li
              key={step}
              className="bg-surface border-line rounded-panel flex flex-col gap-2 border p-5"
            >
              <span className="text-ember text-sm font-semibold">Step {i + 1}</span>
              <span className="text-[17px] leading-6">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="start-h" className="flex flex-col gap-6">
        <h2
          id="start-h"
          className="font-display text-[28px] leading-8 font-bold tracking-[-0.015em]"
        >
          Start from a format that works
        </h2>
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {themes.map((t) => (
            <li key={t.id} className="flex flex-col gap-2.5">
              <Link href={ideaPagePath(t.id)} className="group flex flex-col gap-2.5">
                <ThemeFrame themeId={t.id} variant="card" className="rounded-card" />
                <span className="flex flex-col gap-0.5">
                  <span className="text-[15px] leading-5 font-semibold group-hover:underline">
                    {t.label} ideas
                  </span>
                  <span className="text-ink-muted text-[13px] leading-[18px]">{t.blurb}</span>
                </span>
              </Link>
              <Link
                href={createHref({ themeId: t.id, topic: lookFor(t.id).ideas[0]! })}
                className="text-[15px] underline"
                aria-label={`Make a ${t.label} video`}
              >
                Make one
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="faq-h" className="flex flex-col gap-4">
        <h2 id="faq-h" className="text-[21px] leading-7 font-semibold">
          Questions
        </h2>
        <dl className="flex max-w-[760px] flex-col gap-5">
          {page.faq.map((f) => (
            <div key={f.q} className="flex flex-col gap-1.5">
              <dt className="font-semibold">{f.q}</dt>
              <dd className="text-ink-muted">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <nav
        aria-label="Related"
        className="text-ink-muted flex flex-wrap gap-x-6 gap-y-2 text-[15px]"
      >
        <Link href="/ideas" className="hover:text-ink underline">
          All video ideas
        </Link>
        <Link href="/pricing" className="hover:text-ink underline">
          Pricing
        </Link>
        {others.map((p) => (
          <Link key={p.slug} href={keywordPagePath(p.slug)} className="hover:text-ink underline">
            {p.heading}
          </Link>
        ))}
      </nav>
    </main>
  );
}
