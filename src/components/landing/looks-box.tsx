'use client';

import Link from 'next/link';
import { useState } from 'react';
import { THEMES } from '@/config/themes';
import { ColourIn } from '@/components/motion/colour-in';
import { ThemeFrame } from '@/components/theme-frame';
import { Note } from '@/components/ui/note';
import { ideaPagePath } from '@/features/seo/site';

/**
 * The landing's sky looks box (B.2, board Main): the eight looks as stacked
 * Fraunces names (B.1 motion #7). Hovering, focusing or tapping one shows its
 * sample beside them, in colour as it scrolls in, with a link to its ideas.
 * Without JavaScript the first look shows and every look page is in the footer
 * and on /ideas.
 */
export function LooksBox() {
  const [active, setActive] = useState(2);
  const look = THEMES[active] ?? THEMES[0]!;

  return (
    <div className="flex flex-col gap-10 lg:flex-row lg:gap-[4%]">
      <ul aria-label="Looks" className="m-0 flex min-w-0 list-none flex-col p-0 lg:flex-[1_1_55%]">
        {THEMES.map((t, i) => {
          const on = i === active;
          return (
            <li key={t.id}>
              <button
                type="button"
                aria-pressed={on}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onClick={() => setActive(i)}
                className={`font-display text-ink block min-h-11 cursor-pointer py-1 text-left text-[clamp(2.4rem,6vw,7rem)] leading-[.75] whitespace-nowrap transition-all duration-300 ${
                  on
                    ? 'font-black tracking-[-0.04em] [text-shadow:1px_1px_0_rgb(255_255_255/.8)]'
                    : 'font-extralight tracking-[-0.03em] opacity-80'
                }`}
              >
                {t.label}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="relative flex min-w-0 flex-col items-center gap-5 lg:flex-[1_1_36%]">
        <Note rotate={-20} className="-ml-[40%] text-[40px] max-lg:hidden xl:text-[48px]">
          Hover a look!
        </Note>
        <ColourIn className="shadow-hero w-[220px] overflow-hidden rounded-[8px] sm:w-[300px]">
          <ThemeFrame themeId={look.id} variant="phone" />
        </ColourIn>
        <p className="m-0 text-[20px] font-semibold tracking-[3px] uppercase" aria-live="polite">
          {look.label}
        </p>
        <p className="m-0 text-center text-[24px] font-light">{look.blurb}</p>
        <Link
          href={ideaPagePath(look.id)}
          className="press inline-flex min-h-11 items-center rounded-[8px] px-4 text-[15px] font-semibold"
        >
          See {look.label} ideas
        </Link>
      </div>
    </div>
  );
}
