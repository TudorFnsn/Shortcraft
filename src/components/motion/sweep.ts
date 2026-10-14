import { gsap, MOTION, motionAllowed } from './gsap';

const sweepVars = () => ({
  x: MOTION.sweep.x,
  scale: MOTION.sweep.scale,
  rotate: MOTION.sweep.rotate,
  borderRadius: MOTION.sweep.radius,
  duration: MOTION.sweep.duration,
  ease: MOTION.sweep.ease,
});

/** Sheet sweep in (B.1 motion #4). Does nothing under reduced motion. */
export function sweepIn(el: Element): void {
  if (!motionAllowed()) return;
  gsap.killTweensOf(el);
  gsap.from(el, { ...sweepVars(), clearProps: 'all' });
}

/**
 * The reverse: sweeps out, then calls `done` (which closes the dialog). Under
 * reduced motion `done` runs at once. Returns a cancel function.
 */
export function sweepOut(el: Element, done: () => void): () => void {
  if (!motionAllowed()) {
    done();
    return () => {};
  }
  const tween = gsap.to(el, {
    ...sweepVars(),
    onComplete: () => {
      done();
      gsap.set(el, { clearProps: 'all' });
    },
  });
  return () => {
    tween.kill();
  };
}
