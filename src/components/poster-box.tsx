import type { ReactNode } from 'react';

/**
 * The ember box with a League Gothic poster word (DesignPlan §4 B.2, Not found
 * and error): "404" or "OOPS" with the deep-red shadow, one Fraunces line and
 * one action.
 */
export function PosterBox({
  word,
  title,
  children,
}: {
  word: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="flex flex-1 px-2 pt-2 pb-2 sm:px-6 sm:pb-6">
      <section
        aria-labelledby="poster-h"
        className="box-ember rounded-box flex w-full flex-col items-center justify-center gap-8 overflow-hidden px-5 py-16 text-center sm:min-h-[70vh]"
      >
        <p
          aria-hidden="true"
          className="font-poster m-0 text-[clamp(10rem,30vw,28rem)] leading-[.75] uppercase [text-shadow:10px_10px_0_var(--shadow-red)]"
        >
          {word}
        </p>
        <h1
          id="poster-h"
          className="font-display m-0 max-w-[16ch] text-[clamp(2.5rem,5vw,4.5rem)] leading-[.9] font-normal tracking-[-0.03em]"
        >
          {title}
        </h1>
        {children}
      </section>
    </main>
  );
}
