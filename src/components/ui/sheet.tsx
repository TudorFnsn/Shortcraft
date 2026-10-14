'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { gsap, MOTION, motionAllowed } from '@/components/motion/gsap';

/**
 * A modal sheet on the native <dialog>: focus is trapped and returned, Escape
 * closes it, and a click on the backdrop closes it too. Opens as a bottom sheet
 * on phones and a centred panel from `sm` up.
 *
 * Sheet sweep (B.1 motion #4): it sweeps in from the left (x −110%, scale .92,
 * rotate 4°, radius 30, expo.inOut 1s) and sweeps back out on close. Under
 * reduced motion it simply appears and disappears.
 */
export function Sheet({
  open,
  onClose,
  title,
  size = 'default',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** `wide` fits an editor: wider panel from `sm` up, taller on phones. */
  size?: 'default' | 'wide';
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const openRef = useRef(open);

  useEffect(() => {
    openRef.current = open;
    const dialog = ref.current;
    if (!dialog) return;
    const sweep = {
      x: MOTION.sweep.x,
      scale: MOTION.sweep.scale,
      rotate: MOTION.sweep.rotate,
      borderRadius: MOTION.sweep.radius,
      duration: MOTION.sweep.duration,
      ease: MOTION.sweep.ease,
    };
    if (open && !dialog.open) {
      dialog.showModal();
      if (motionAllowed()) gsap.from(dialog, { ...sweep, clearProps: 'all' });
    } else if (open) {
      // Re-opened while sweeping out: settle back in place.
      gsap.killTweensOf(dialog);
      gsap.set(dialog, { clearProps: 'all' });
    }
    if (!open && dialog.open) {
      if (!motionAllowed()) {
        dialog.close();
        return;
      }
      const out = gsap.to(dialog, {
        ...sweep,
        onComplete: () => {
          dialog.close();
          gsap.set(dialog, { clearProps: 'all' });
        },
      });
      return () => {
        out.kill();
      };
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      // Escape: let the parent close it so the sweep can play out first.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // The native close event also fires after our own sweep-out; only report
      // closes the parent doesn't know about yet.
      onClose={() => {
        if (openRef.current) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={`bg-surface text-ink shadow-sheet backdrop:bg-scrim fixed inset-x-0 top-auto bottom-0 m-0 w-full max-w-none overflow-y-auto rounded-t-[24px] p-0 sm:inset-0 sm:m-auto sm:rounded-[24px] ${
        size === 'wide'
          ? 'max-h-[94dvh] sm:max-h-[calc(100dvh-4rem)] sm:w-[min(1040px,calc(100vw-48px))]'
          : 'max-h-[85vh] sm:w-[min(760px,calc(100vw-48px))]'
      }`}
    >
      <div className="flex flex-col gap-5 p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-[24px] leading-7 font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="bg-raised hover:bg-line flex size-11 shrink-0 items-center justify-center rounded-full transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
