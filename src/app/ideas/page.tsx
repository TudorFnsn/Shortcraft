import type { Metadata } from 'next';
import Link from 'next/link';
import { siteConfig } from '@/config/site';
import { THEMES } from '@/config/themes';
import { lookFor } from '@/components/ideas';
import { SplitLines } from '@/components/motion/split-lines';
import { Box } from '@/components/ui/box';
import { KEYWORD_PAGES } from '@/config/keyword-pages';
import { ideaPagePath, keywordPagePath } from '@/features/seo/site';

const description =
  'Ready-made ideas for faceless TikTok, Reels and Shorts videos in eight styles, from horror stories to fun facts. Pick one and make it with AI.';

export const metadata: Metadata = {
  title: `Faceless video ideas for TikTok, Reels and Shorts | ${siteConfig.name}`,
  description,
  alternates: { canonical: '/ideas' },
};

/**
 * Public hub that links every look's ideas page (DesignPlan §4 B.2: the
 * landing's sky looks box, with the stacked names as links).
 */
export default function IdeasIndexPage() {
  return (
    <main className="flex flex-col gap-10 px-2 pt-4 pb-6 sm:px-6 sm:pb-6">
      <Box
        tone="sky"
        aria-labelledby="ideas-h"
        className="flex flex-col gap-3 px-5 py-14 sm:px-12 sm:py-20 lg:px-20 lg:py-[120px]"
      >
        <p className="m-0 text-[clamp(1rem,2vw,1.5rem)] font-semibold tracking-[3px] uppercase">
          Eight looks
        </p>
        <SplitLines
          as="h1"
          id="ideas-h"
          className="font-display m-0 text-[clamp(3.5rem,8vw,9rem)] leading-[.8] font-normal tracking-[-0.04em]"
        >
          Faceless video ideas
        </SplitLines>
        <p className="m-0 mt-4 max-w-[760px] text-[clamp(1.25rem,1.75vw,2rem)] leading-[1.25] font-light">
          Eight formats that work without showing your face, each with ideas you can turn into a
          narrated, captioned vertical video in minutes.
        </p>
        <ul className="m-0 mt-8 flex list-none flex-col p-0 sm:mt-14">
          {THEMES.map((t) => (
            <li key={t.id}>
              <Link
                href={ideaPagePath(t.id)}
                className="group font-display flex min-h-11 flex-wrap items-baseline gap-x-5 py-1 leading-[.8]"
              >
                <span className="text-[clamp(2.4rem,6vw,7rem)] font-extralight tracking-[-0.03em] transition-all duration-300 group-hover:font-black group-hover:tracking-[-0.04em] group-hover:[text-shadow:1px_1px_0_rgb(255_255_255/.8)] group-focus-visible:font-black">
                  {t.label}
                </span>
                <span className="font-sans text-[15px] font-semibold tracking-[1px] uppercase">
                  {lookFor(t.id).ideas.length} ideas
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Box>
      <nav
        aria-label="Guides"
        className="font-label flex flex-wrap gap-x-6 gap-y-2 px-3 text-[16px] uppercase sm:px-6"
      >
        {KEYWORD_PAGES.map((p) => (
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
