/**
 * The one place the app loads GSAP (DesignPlan §4 B.1 motion kit). ScrollTrigger
 * and SplitText are free since 3.13. Every move checks `motionAllowed()` first,
 * so nothing animates under prefers-reduced-motion, and every component renders
 * its final state on the server.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

if (typeof window !== 'undefined') gsap.registerPlugin(ScrollTrigger, SplitText);

export { gsap, ScrollTrigger, SplitText };

/** lil-boxes values (B.1 motion table). */
export const MOTION = {
  /** Sheet sweep and the reverse on close. */
  sweep: { x: '-110%', scale: 0.92, rotate: 4, radius: 30, duration: 1, ease: 'expo.inOut' },
  /** Section pop: alternate boxes tilt the other way. */
  pop: { scale: 0.9, rotate: 0.7, radius: 30 },
  /** Line stagger. */
  lines: { y: 100, scale: 0.95, duration: 1, delay: 0.3, stagger: 0.12, ease: 'expo.out' },
  /** Step reveal: the last step waits a second. */
  step: { duration: 1, ease: 'expo.out', lastDelay: 1, stagger: 0.15 },
  /** Typed word: ms per letter while typing and backspacing, hold on a full word. */
  typed: { perLetter: 90, hold: 1800 },
} as const;

export function motionAllowed(): boolean {
  return (
    typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
