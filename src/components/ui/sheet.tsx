'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { gsap } from '@/components/motion/gsap';
import { sweepIn, sweepOut } from '@/components/motion/sweep';
import { boxClasses, type BoxTone } from './box';

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
  tone = 'surface',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** `wide` fits an editor: wider panel from `sm` up, taller on phones. */
  size?: 'default' | 'wide';
  /** The box colour; `surface` is a plain white (dark: charcoal) sheet. */
  tone?: 'surface' | BoxTone;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const openRef = useRef(open);

  useEffect(() => {
    openRef.current = open;
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      sweepIn(dialog);
    } else if (open) {
      // Re-opened while sweeping out: settle back in place.
      gsap.killTweensOf(dialog);
      gsap.set(dialog, { clearProps: 'all' });
    }
    if (!open && dialog.open) return sweepOut(dialog, () => dialog.close());
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
      className={`${tone === 'surface' ? 'bg-surface text-ink' : boxClasses(tone)} shadow-sheet backdrop:bg-scrim fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto rounded-none p-0 sm:m-auto sm:h-fit sm:rounded-[8px] ${
        size === 'wide'
          ? 'sm:max-h-[calc(100dvh-4rem)] sm:w-[min(1040px,calc(100vw-48px))]'
          : 'sm:max-h-[85vh] sm:w-[min(760px,calc(100vw-48px))]'
      }`}
    >
      <div className="flex flex-col gap-5 p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-[32px] leading-[.9] font-normal sm:text-[40px]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="press flex size-12 shrink-0 items-center justify-center rounded-[8px] bg-transparent"
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
