'use client';

import { useLayoutEffect, useRef } from 'react';
import { gsap, motionAllowed } from './gsap';
import type { MotionProps } from './polymorphic';

/**
 * Colour comes in (B.1 motion #5): a thumbnail starts grey and takes its colour
 * as it scrolls up, scrubbed from "top bottom" to "top top". The ends are
 * clamped so a short page (or the last row) still reaches full colour.
 */
export function ColourIn({ as: Tag = 'div', ...props }: MotionProps) {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !motionAllowed()) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { filter: 'grayscale(1)' },
        {
          filter: 'grayscale(0)',
          ease: 'none',
          scrollTrigger: {
            trigger: el,
            start: 'clamp(top bottom)',
            end: 'clamp(top top)',
            scrub: 1,
          },
        },
      );
    }, el);
    return () => ctx.revert();
  }, []);

  return <Tag ref={ref as React.Ref<never>} {...props} />;
}
