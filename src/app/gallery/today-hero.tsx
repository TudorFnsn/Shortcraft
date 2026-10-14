'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { createHref, type Idea } from '@/components/ideas';
import { Box } from '@/components/ui/box';
import { buttonClasses } from '@/components/ui/button';

/**
 * Today's idea (DesignPlan §4 B.2, boards Home and PhoneHome): the blush box
 * with the idea as a Fraunces headline, the dark Make it and "Another idea",
 * which steps through the day's ideas (they rotate daily and lean on the
 * creator's usual look). `side` is the video being made, on a frosted card.
 */
export function TodayHero({ ideas, side }: { ideas: readonly Idea[]; side?: ReactNode }) {
  const [at, setAt] = useState(0);
  const idea = ideas[at % Math.max(ideas.length, 1)];
  if (!idea) return null;

  return (
    <Box
      tone="blush"
      pop
      aria-labelledby="today-h"
      className="flex flex-col gap-8 px-5 py-6 sm:p-12 lg:flex-row lg:items-center lg:gap-12"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:gap-4">
        <h2
          id="today-h"
          className="text-ember-ink m-0 text-[12px] font-semibold tracking-[2px] uppercase sm:text-[16px] sm:tracking-[3px]"
        >
          Today&apos;s idea · {idea.themeLabel}
        </h2>
        <p
          aria-live="polite"
          className="font-display m-0 text-[32px] leading-[.95] font-light tracking-[-0.03em] sm:text-[64px] sm:leading-[.9]"
        >
          {idea.topic}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2 sm:mt-3">
          <Link
            href={createHref(idea)}
            className={buttonClasses({ variant: 'ink', size: 'lg', className: 'sm:px-10' })}
          >
            Make it
          </Link>
          {ideas.length > 1 && (
            <button
              type="button"
              onClick={() => setAt((i) => i + 1)}
              className="inline-flex min-h-11 items-center text-[16px] font-semibold underline underline-offset-4"
            >
              Another idea
            </button>
          )}
        </div>
      </div>
      {side}
    </Box>
  );
}
