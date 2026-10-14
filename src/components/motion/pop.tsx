'use client';

import { useLayoutEffect, useRef } from 'react';
import { gsap, MOTION, motionAllowed } from './gsap';
import type { MotionProps } from './polymorphic';

/**
 * Section pop (B.1 motion #1): a stacked box grows from scale .9 with a slight
 * tilt (alternate boxes tilt the other way) and its top corners settle from 30px
 * to 8px, scrubbed to the scroll from "top bottom" to "top 25px".
 */
export function Pop({
  as: Tag = 'section',
  alternate = false,
  ...props
}: MotionProps & { alternate?: boolean }) {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !motionAllowed()) return;
    const ctx = gsap.context(() => {
      gsap.from(el, {
        scale: MOTION.pop.scale,
        rotate: alternate ? MOTION.pop.rotate : -MOTION.pop.rotate,
        borderTopLeftRadius: MOTION.pop.radius,
        borderTopRightRadius: MOTION.pop.radius,
        transformOrigin: '50% 0',
        ease: 'none',
        scrollTrigger: { trigger: el, start: 'top bottom', end: 'top 25px', scrub: 1 },
      });
    }, el);
    return () => ctx.revert();
  }, [alternate]);

  return <Tag ref={ref as React.Ref<never>} {...props} />;
}
