'use client';

import { useLayoutEffect, useRef } from 'react';
import { gsap, MOTION, motionAllowed, SplitText } from './gsap';
import type { MotionProps } from './polymorphic';

/**
 * Line stagger (B.1 motion #2): a title or section heading is split into lines
 * that rise from 100px below their mask with a .12s stagger. Plays when it
 * enters the viewport and reverses when you scroll back above it. SplitText
 * keeps the full text on the element for screen readers.
 */
export function SplitLines({ as: Tag = 'h2', ...props }: MotionProps) {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!motionAllowed()) {
      el.setAttribute('data-split-ready', '');
      return;
    }
    const split = SplitText.create(el, {
      type: 'lines',
      mask: 'lines',
      autoSplit: true,
      onSplit: (self) => {
        el.setAttribute('data-split-ready', '');
        return gsap.from(self.lines, {
          y: MOTION.lines.y,
          scale: MOTION.lines.scale,
          duration: MOTION.lines.duration,
          delay: MOTION.lines.delay,
          stagger: MOTION.lines.stagger,
          ease: MOTION.lines.ease,
          scrollTrigger: {
            trigger: el,
            start: 'top bottom',
            toggleActions: 'play none none reverse',
          },
        });
      },
    });
    return () => split.revert();
  }, []);

  return <Tag ref={ref as React.Ref<never>} data-split="" {...props} />;
}
