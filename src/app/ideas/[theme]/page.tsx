import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { siteConfig } from '@/config/site';
import { THEMES } from '@/config/themes';
import { THEME_GUIDES } from '@/config/theme-guides';
import { ThemeFrame } from '@/components/theme-frame';
import { buttonClasses } from '@/components/ui/button';
import { createHref, lookFor } from '@/components/ideas';
import { ideaPagePath } from '@/features/seo/site';

const fmt = (n: number) => n.toLocaleString('en-US');
const wrap = 'mx-auto max-w-[1344px] px-4 sm:px-8 xl:px-12';

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

/** Public, indexable theme page: what the format is, ready-made ideas, one-click start. */
export default async function ThemeIdeasPage({ params }: PageProps<'/ideas/[theme]'>) {
  const { theme: themeId } = await params;
  const theme = THEMES.find((t) => t.id === themeId);
  const guide = THEME_GUIDES[themeId];
  if (!theme || !guide) notFound();
  const look = lookFor(theme.id);
  const others = THEMES.filter((t) => t.id !== theme.id);

  return (
    <main className={`${wrap} flex flex-col gap-14 py-8 sm:py-14`}>
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/ideas" className="hover:text-ink underline">
          Video ideas
        </Link>{' '}
        / <span aria-current="page">{theme.label}</span>
      </nav>

      <section
        aria-labelledby="theme-h"
        className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]"
      >
        <div className="flex min-w-0 flex-col gap-5">
          <h1
            id="theme-h"
            className="font-display text-[36px] leading-10 font-bold tracking-[-0.025em] sm:text-[52px] sm:leading-[56px]"
          >
            {guide.heading}
          </h1>
          {guide.intro.map((p) => (
            <p key={p} className="text-ink-muted max-w-[620px] text-[17px] leading-[26px]">
              {p}
            </p>
          ))}
          <Link
            href={createHref({ themeId: theme.id, topic: look.ideas[0]! })}
            className={buttonClasses({ size: 'lg', className: 'self-start' })}
          >
            Make a {theme.label} video free
          </Link>
          <span className="text-ink-muted text-sm">
            {fmt(siteConfig.trialCredits)} free credits to start. No card needed.
          </span>
        </div>
        <div
          aria-hidden="true"
          className="shadow-sheet mx-auto w-[220px] overflow-hidden rounded-[26px] border-[6px] border-[#050506]"
        >
          <ThemeFrame themeId={theme.id} variant="phone" />
        </div>
      </section>

      <section aria-labelledby="list-h" className="flex flex-col gap-6">
        <h2
          id="list-h"
          className="font-display text-[28px] leading-8 font-bold tracking-[-0.015em]"
        >
          {look.ideas.length} {theme.label.toLowerCase()} ideas you can make now
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {look.ideas.map((idea) => (
            <li
              key={idea}
              className="bg-surface border-line rounded-panel flex flex-col gap-4 border p-5"
            >
              <span className="text-[17px] leading-6 font-semibold">{idea}</span>
              <Link
                href={createHref({ themeId: theme.id, topic: idea })}
                className={buttonClasses({
                  variant: 'secondary',
                  className: 'mt-auto min-h-11 self-start',
                })}
                aria-label={`Make this video: ${idea}`}
              >
                Make this video
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="tips-h"
        className="bg-surface rounded-panel flex flex-col gap-4 p-6"
      >
        <h2 id="tips-h" className="text-[21px] leading-7 font-semibold">
          What makes a good {theme.label.toLowerCase()} Short
        </h2>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          {guide.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="text-ink-muted text-[15px]">
          Every video is a 9:16 MP4 with a voiceover, word-by-word captions and an AI-generated
          label, ready for TikTok, Reels and Shorts.
        </p>
      </section>

      <section aria-labelledby="more-h" className="flex flex-col gap-4">
        <h2 id="more-h" className="text-[21px] leading-7 font-semibold">
          More video ideas
        </h2>
        <ul className="flex flex-wrap gap-2">
          {others.map((t) => (
            <li key={t.id}>
              <Link
                href={ideaPagePath(t.id)}
                className="border-line-strong hover:border-ember inline-flex min-h-11 items-center rounded-full border px-4 text-[15px]"
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
