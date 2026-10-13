'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A modal sheet on the native <dialog>: focus is trapped and returned, Escape
 * closes it, and a click on the backdrop closes it too. Opens as a bottom sheet
 * on phones and a centred panel from `sm` up.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="bg-surface text-ink shadow-sheet backdrop:bg-scrim fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85vh] w-full max-w-none overflow-y-auto rounded-t-[24px] p-0 sm:inset-0 sm:m-auto sm:w-[min(760px,calc(100vw-48px))] sm:rounded-[24px]"
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
