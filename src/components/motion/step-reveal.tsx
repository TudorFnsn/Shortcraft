'use client';

import { Children, useLayoutEffect, useRef } from 'react';
import { gsap, MOTION, motionAllowed } from './gsap';
import type { MotionProps } from './polymorphic';

/**
 * Step reveal (B.1 motion #8): each step pops in from scale 0 (expo.out 1s).
 * On mount the steps stagger in and the last one waits a second; after that,
 * only steps added later animate (a video moving from "Drawing scenes" to
 * "Animating"). The server renders every step in place.
 */
export function StepReveal({ as: Tag = 'ul', children, ...props }: MotionProps) {
  const ref = useRef<HTMLElement>(null);
  const seen = useRef(-1);
  const count = Children.count(children);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const items = Array.from(el.children) as HTMLElement[];
    const first = seen.current < 0;
    const fresh = first ? items : items.slice(seen.current);
    seen.current = items.length;
    if (!motionAllowed() || fresh.length === 0) return;
    const last = fresh[fresh.length - 1];
    const ctx = gsap.context(() => {
      fresh.forEach((item, i) => {
        gsap.from(item, {
          opacity: 0,
          scale: 0,
          duration: MOTION.step.duration,
          ease: MOTION.step.ease,
          delay:
            (first ? i * MOTION.step.stagger : 0) +
            (first && item === last && fresh.length > 1 ? MOTION.step.lastDelay : 0),
        });
      });
    }, el);
    return () => ctx.revert();
  }, [count]);

  return (
    <Tag ref={ref as React.Ref<never>} {...props}>
      {children}
    </Tag>
  );
}
