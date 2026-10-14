'use client';

import { useEffect } from 'react';
import { gsap, motionAllowed } from './gsap';

/** Lenis' default curve: 1.001 − 2^(−10x). */
const ease = (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t));

/** True when the wheel is over something that scrolls on its own (a list, a dialog). */
function insideScroller(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body && el !== document.documentElement) {
    if (el instanceof HTMLDialogElement) return true;
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * Smooth scroll (B.1 motion #9), landing only: mouse-wheel steps glide over
 * 1.2s with Lenis' curve. Touch, keyboard, scrollbars and anything inside a
 * scrolling element or dialog keep native scrolling; nothing runs under
 * reduced motion. Renders nothing.
 */
export function SmoothScroll({ duration = 1.2 }: { duration?: number }) {
  useEffect(() => {
    if (!motionAllowed()) return;
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    const pos = { y: window.scrollY };
    let target = window.scrollY;
    let tween: gsap.core.Tween | null = null;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.defaultPrevented || insideScroller(e.target)) return;
      e.preventDefault();
      if (!tween) target = window.scrollY;
      const max = root.scrollHeight - window.innerHeight;
      const step = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      target = Math.max(0, Math.min(max, target + step));
      pos.y = window.scrollY;
      tween?.kill();
      tween = gsap.to(pos, {
        y: target,
        duration,
        ease,
        onUpdate: () => window.scrollTo(0, pos.y),
        onComplete: () => {
          tween = null;
        },
      });
    };
    // Any non-wheel scroll (keys, scrollbar, anchor) takes over from the glide.
    const onKey = () => {
      tween?.kill();
      tween = null;
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onKey);
    return () => {
      tween?.kill();
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onKey);
      root.style.scrollBehavior = previous;
    };
  }, [duration]);

  return null;
}
