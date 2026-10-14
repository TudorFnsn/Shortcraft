import type { Metadata } from 'next';
import Link from 'next/link';
import { siteConfig } from '@/config/site';
import { THEMES } from '@/config/themes';
import { ThemeFrame } from '@/components/theme-frame';
import { lookFor } from '@/components/ideas';
import { KEYWORD_PAGES } from '@/config/keyword-pages';
import { ideaPagePath, keywordPagePath } from '@/features/seo/site';

const description =
  'Ready-made ideas for faceless TikTok, Reels and Shorts videos in eight styles, from horror stories to fun facts. Pick one and make it with AI.';

export const metadata: Metadata = {
  title: `Faceless video ideas for TikTok, Reels and Shorts | ${siteConfig.name}`,
  description,
  alternates: { canonical: '/ideas' },
};

/** Public hub that links every theme page (and is linked from the landing + footer). */
export default function IdeasIndexPage() {
  return (
    <main className="mx-auto flex max-w-[1344px] flex-col gap-8 px-4 py-8 sm:px-8 sm:py-14 xl:px-12">
      <div className="flex max-w-[680px] flex-col gap-3">
        <h1 className="font-display text-[36px] leading-10 font-bold tracking-[-0.025em] sm:text-[52px] sm:leading-[56px]">
          Faceless video ideas
        </h1>
        <p className="text-ink-muted text-[17px] leading-[26px]">
          Eight formats that work without showing your face, each with ideas you can turn into a
          narrated, captioned vertical video in minutes.
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {THEMES.map((t) => (
          <li key={t.id}>
            <Link href={ideaPagePath(t.id)} className="group flex flex-col gap-2.5">
              <ThemeFrame themeId={t.id} variant="card" className="rounded-card" />
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] leading-5 font-semibold group-hover:underline">
                  {t.label} ideas
                </span>
                <span className="text-ink-muted text-[13px] leading-[18px]">
                  {t.blurb} · {lookFor(t.id).ideas.length} ideas
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <nav
        aria-label="Guides"
        className="text-ink-muted flex flex-wrap gap-x-6 gap-y-2 text-[15px]"
      >
        {KEYWORD_PAGES.map((p) => (
          <Link key={p.slug} href={keywordPagePath(p.slug)} className="hover:text-ink underline">
            {p.heading}
          </Link>
        ))}
      </nav>
    </main>
  );
}
