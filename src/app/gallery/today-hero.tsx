'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createHref, type Idea } from '@/components/ideas';
import { buttonClasses } from '@/components/ui/button';

/**
 * Home's one big action (Studio, DesignPlan §4 S): today's idea as a headline
 * with "Make it". "Another idea" steps through the day's ideas (they rotate
 * daily and lean on the creator's usual theme). Replaces the old Tomorrow block
 * and the three-idea row.
 */
export function TodayHero({ ideas }: { ideas: readonly Idea[] }) {
  const [at, setAt] = useState(0);
  const idea = ideas[at % Math.max(ideas.length, 1)];
  if (!idea) return null;

  return (
    <section aria-labelledby="today-h" className="flex flex-col gap-6 lg:pt-10">
      <h2 id="today-h" className="text-ink-muted text-[15px] font-medium">
        Today&apos;s idea · {idea.themeLabel}
      </h2>
      <p
        aria-live="polite"
        className="font-display max-w-[760px] text-[40px] leading-[44px] font-bold sm:text-[56px] sm:leading-[60px] xl:text-[68px] xl:leading-[72px]"
      >
        {idea.topic}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={createHref(idea)}
          className={buttonClasses({ size: 'lg', className: 'rounded-full px-8' })}
        >
          Make it
          <svg
            width="18"
            height="18"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 10h12M11 5l5 5-5 5" />
          </svg>
        </Link>
        {ideas.length > 1 && (
          <button
            type="button"
            onClick={() => setAt((i) => i + 1)}
            className="text-ink-muted hover:text-ink inline-flex min-h-11 items-center px-3 text-[16px] font-medium transition-colors"
          >
            Another idea
          </button>
        )}
      </div>
    </section>
  );
}
