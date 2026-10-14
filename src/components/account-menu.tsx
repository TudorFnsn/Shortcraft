'use client';

import Link from 'next/link';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { gsap, MOTION, motionAllowed } from './motion/gsap';
import { ThemeToggle } from './theme/theme-toggle';
import { SignOutButton } from './sign-out-button';

const ROW =
  'press flex min-h-12 items-center rounded-[8px] px-3 text-[17px] [--press-line:rgb(240_226_221/.35)]';

/**
 * The blush avatar and its account menu (DesignPlan §4 B.2): a dark box that
 * sweeps in, with under-line rows (Plans & credits, My voices), the Light ·
 * Dark · System pills and Sign out. A menu under the avatar on desktop, a
 * bottom sheet on phones.
 */
export function AccountMenu({ email }: { email: string | null }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const initial = (email?.trim()[0] ?? '?').toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      // Closing unmounts the panel; keep keyboard focus on the trigger.
      if (rootRef.current?.contains(document.activeElement)) buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Sheet sweep (B.1 motion #4) as the box appears.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel || !motionAllowed()) return;
    const tween = gsap.from(panel, {
      x: MOTION.sweep.x,
      scale: MOTION.sweep.scale,
      rotate: MOTION.sweep.rotate,
      borderRadius: MOTION.sweep.radius,
      duration: MOTION.sweep.duration,
      ease: MOTION.sweep.ease,
      clearProps: 'all',
    });
    return () => {
      tween.revert();
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        className="bg-blush text-on-blush font-display flex size-11 items-center justify-center rounded-full text-[20px] transition-transform hover:translate-x-0.5 hover:translate-y-0.5"
      >
        {initial}
      </button>
      {open && (
        <div
          id={menuId}
          ref={panelRef}
          className="box-dark rounded-box shadow-sheet fixed inset-x-2 bottom-2 z-50 flex flex-col gap-2 p-4 md:absolute md:inset-x-auto md:top-14 md:right-0 md:bottom-auto md:w-80"
        >
          {email && (
            <p className="font-label text-ink-muted m-0 truncate px-3 pt-1 pb-2 text-[14px] tracking-[1px] uppercase">
              {email}
            </p>
          )}
          <Link href="/pricing" onClick={() => setOpen(false)} className={ROW}>
            Plans &amp; credits
          </Link>
          <Link href="/voices" onClick={() => setOpen(false)} className={ROW}>
            My voices
          </Link>
          <div className="flex flex-col gap-2 px-1 pt-2">
            <span className="text-ink-muted px-2 text-[13px] font-semibold tracking-[2px] uppercase">
              Theme
            </span>
            <ThemeToggle />
          </div>
          <div className="pt-1">
            <SignOutButton className={ROW} />
          </div>
        </div>
      )}
    </div>
  );
}
