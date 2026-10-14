import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { siteConfig } from '@/config/site';
import { THEMES } from '@/config/themes';
import { THEME_GUIDES } from '@/config/theme-guides';
import { ThemeFrame } from '@/components/theme-frame';
import { ColourIn } from '@/components/motion/colour-in';
import { SplitLines } from '@/components/motion/split-lines';
import { Box } from '@/components/ui/box';
import { buttonClasses } from '@/components/ui/button';
import { createHref, lookFor } from '@/components/ideas';
import { ideaPagePath } from '@/features/seo/site';

const fmt = (n: number) => n.toLocaleString('en-US');

// One static page per theme; an unknown theme is a 404, never rendered on demand.
export const dynamicParams = false;

export function generateStaticParams() {
  return THEMES.map((t) => ({ theme: t.id }));
}

export async function generateMetadata({ params }: PageProps<'/ideas/[theme]'>): Promise<Metadata> {
  const { theme } = await params;
  const guide = THEME_GUIDES[theme];
  if (!guide) return {};
  const title = `${guide.title} | ${siteConfig.name}`;
  return {
    title,
    description: guide.description,
    alternates: { canonical: ideaPagePath(theme) },
    openGraph: { title, description: guide.description, url: ideaPagePath(theme), type: 'website' },
  };
}

/**
 * Public, indexable theme page (DesignPlan §4 B.2): a hero-gradient box with the
 * look, its ideas as blush rows each with Make it (→ Create with the look and
 * idea), tips in a dark box and links to the other looks.
 */
export default async function ThemeIdeasPage({ params }: PageProps<'/ideas/[theme]'>) {
  const { theme: themeId } = await params;
  const theme = THEMES.find((t) => t.id === themeId);
  const guide = THEME_GUIDES[themeId];
  if (!theme || !guide) notFound();
  const look = lookFor(theme.id);
  const others = THEMES.filter((t) => t.id !== theme.id);

  return (
    <main className="flex flex-col gap-3 px-2 pt-4 pb-6 sm:gap-6 sm:px-6">
      <Box
        tone="hero"
        as="section"
        aria-labelledby="theme-h"
        className="flex flex-col gap-10 px-5 py-10 sm:px-12 sm:py-16 lg:flex-row lg:items-center lg:px-20 lg:py-24"
      >
        <div className="flex min-w-0 flex-col gap-5 lg:flex-[1_1_60%]">
          <nav
            aria-label="Breadcrumb"
            className="font-label text-ink-muted text-[15px] tracking-[1px] uppercase"
          >
            <Link href="/ideas" className="hover:text-ink underline underline-offset-4">
              Video ideas
            </Link>{' '}
            / <span aria-current="page">{theme.label}</span>
          </nav>
          <SplitLines
            as="h1"
            id="theme-h"
            className="font-display m-0 text-[clamp(3rem,6vw,7rem)] leading-[.85] font-normal tracking-[-0.04em]"
          >
            {guide.heading}
          </SplitLines>
          {guide.intro.map((p) => (
            <p key={p} className="m-0 max-w-[680px] text-[19px] leading-[1.45] font-light">
              {p}
            </p>
          ))}
          <Link
            href={createHref({ themeId: theme.id, topic: look.ideas[0]! })}
            className={buttonClasses({ size: 'lg', className: 'self-start' })}
          >
            Make a {theme.label} video free
          </Link>
          <span className="text-ink-muted text-[15px]">
            {fmt(siteConfig.trialCredits)} free credits to start. No card needed.
          </span>
        </div>
        <ColourIn
          aria-hidden="true"
          className="shadow-hero mx-auto w-[220px] shrink-0 overflow-hidden rounded-[8px] sm:w-[260px]"
        >
          <ThemeFrame themeId={theme.id} variant="phone" />
        </ColourIn>
      </Box>

      <section aria-labelledby="list-h" className="flex flex-col gap-6 px-3 pt-10 sm:px-6 lg:px-20">
        <SplitLines
          id="list-h"
          className="font-display m-0 text-[clamp(2.25rem,4vw,4rem)] leading-[.9] font-normal tracking-[-0.03em]"
        >
          {`${look.ideas.length} ${theme.label.toLowerCase()} ideas you can make now`}
        </SplitLines>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {look.ideas.map((idea) => (
            <li
              key={idea}
              className="box-blush rounded-box flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8"
            >
              <span className="font-display text-[22px] leading-[1.15] font-light sm:text-[28px]">
                {idea}
              </span>
              <Link
                href={createHref({ themeId: theme.id, topic: idea })}
                className={buttonClasses({ variant: 'ink', size: 'md' })}
                aria-label={`Make it: ${idea}`}
              >
                Make it
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Box
        tone="dark"
        aria-labelledby="tips-h"
        className="mt-6 flex flex-col gap-5 px-5 py-12 sm:px-12 lg:px-20"
      >
        <h2
          id="tips-h"
          className="font-display m-0 text-[clamp(2rem,3.5vw,3.5rem)] leading-[.9] font-normal tracking-[-0.03em]"
        >
          What makes a good {theme.label.toLowerCase()} Short
        </h2>
        <ul className="m-0 flex list-none flex-col gap-3 p-0 text-[17px] leading-[1.45]">
          {guide.tips.map((t) => (
            <li key={t} className="flex gap-3">
              <span aria-hidden="true" className="text-[#F095A1]">
                *
              </span>
              {t}
            </li>
          ))}
        </ul>
        <p className="font-label text-ink-muted m-0 text-[15px] uppercase">
          Every video is a 9:16 MP4 with a voiceover, word-by-word captions and an AI-generated
          label, ready for TikTok, Reels and Shorts.
        </p>
      </Box>

      <section aria-labelledby="more-h" className="flex flex-col gap-4 px-3 py-10 sm:px-6 lg:px-20">
        <h2 id="more-h" className="m-0 text-[16px] font-semibold tracking-[3px] uppercase">
          More video ideas
        </h2>
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {others.map((t) => (
            <li key={t.id}>
              <Link
                href={ideaPagePath(t.id)}
                className="press inline-flex min-h-11 items-center rounded-[8px] px-4 text-[15px] font-semibold"
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
