'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SplitLines } from '@/components/motion/split-lines';
import { buttonClasses } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { useVoicePreview } from '@/components/voice/use-voice-preview';
import type { MyVoice } from '@/components/voice/voice-choice';
import type { Slots } from './slots';

const NAME_MAX = 40;

function PlayIcon({ playing }: { playing: boolean }) {
  return playing ? (
    <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="5" y="5" width="10" height="10" rx="2" fill="currentColor" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M7 4.5l9 5.5-9 5.5z" fill="currentColor" />
    </svg>
  );
}

/**
 * My voices (Voice Studio V4; Boxes board Voices): a blush box with the plan's
 * slot count, the saved voices as rows (ink ▶, Fraunces name, press-in Rename
 * and Delete), the way out at the limit, and a small dark confirm box.
 */
export function MyVoicesView({ voices, slots }: { voices: MyVoice[]; slots: Slots }) {
  const router = useRouter();
  const preview = useVoicePreview();
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<MyVoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function rename() {
    if (!renaming || busy) return;
    const name = renaming.name.trim();
    if (!name) return;
    setBusy(true);
    const res = await fetch(`/api/voices/${renaming.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const data = res ? await res.json().catch(() => ({})) : {};
      setMessage(data.message ?? "Couldn't rename it. Try again.");
      return;
    }
    setRenaming(null);
    setMessage(`Renamed to ${name}.`);
    router.refresh();
  }

  async function remove() {
    if (!deleting || busy) return;
    setBusy(true);
    preview.stop();
    const res = await fetch(`/api/voices/${deleting.id}`, { method: 'DELETE' }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setMessage("Couldn't delete it. Try again.");
      return;
    }
    setMessage(`${deleting.name} was deleted.`);
    setDeleting(null);
    router.refresh();
  }

  const plus = (
    <svg
      width="15"
      height="15"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M10 4v12M4 10h12" />
    </svg>
  );

  return (
    <section
      aria-labelledby="mv-h"
      className="box-blush rounded-box flex w-full flex-col gap-5 px-5 py-8 sm:p-12"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-ember-ink m-0 text-[13px] font-semibold tracking-[3px] uppercase sm:text-[16px]">
            {slots.line}
          </p>
          <SplitLines
            as="h1"
            id="mv-h"
            className="font-display m-0 text-[56px] leading-[.8] font-normal tracking-[-0.04em] sm:text-[96px]"
          >
            My voices
          </SplitLines>
        </div>
        {slots.atLimit ? (
          <span
            aria-disabled="true"
            className={buttonClasses({
              variant: 'ink',
              size: 'lg',
              className: 'cursor-not-allowed gap-2 opacity-50',
            })}
          >
            {plus}
            Create a voice
          </span>
        ) : (
          <Link
            href="/voices/new"
            className={buttonClasses({ variant: 'ink', size: 'lg', className: 'gap-2' })}
          >
            {plus}
            Create a voice
          </Link>
        )}
      </div>

      {slots.atLimit && (
        <div className="flex flex-col gap-3 rounded-[8px] bg-white/60 px-5 py-4 sm:flex-row sm:items-center">
          <p className="m-0 flex-1 text-[15px] leading-[22px]">
            All your voice slots are in use. Delete one to make room
            {slots.more ? `, or move to ${slots.more.name} for ${slots.more.limit}.` : '.'}
          </p>
          {slots.more && (
            <Link
              href="/pricing"
              className={buttonClasses({ variant: 'secondary', className: 'whitespace-nowrap' })}
            >
              See {slots.more.name}
            </Link>
          )}
        </div>
      )}

      {voices.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[8px] bg-white/55 px-6 py-10 text-center">
          <p className="font-display m-0 text-[28px]">No voices yet</p>
          <p className="m-0 max-w-[420px] text-[15px] leading-[22px]">
            Describe the narrator you want, hear 3 samples and keep the one that fits. It&apos;s
            yours for every video.
          </p>
        </div>
      ) : (
        <ul className="m-0 mt-2 flex list-none flex-col gap-3 p-0">
          {voices.map((v) => {
            const playing = preview.playing === v.id;
            const editing = renaming?.id === v.id;
            return (
              <li
                key={v.id}
                className="flex flex-wrap items-center gap-4 rounded-[8px] bg-white/55 p-4 sm:flex-nowrap sm:p-[18px]"
              >
                <button
                  type="button"
                  onClick={() => void preview.toggleVoice(v.id, 'story-time')}
                  aria-label={`${playing ? 'Stop' : 'Play'} ${v.name}`}
                  aria-pressed={playing}
                  aria-busy={preview.loading === v.id}
                  className={`flex size-12 shrink-0 items-center justify-center rounded-full transition-transform hover:translate-x-0.5 hover:translate-y-0.5 ${
                    playing ? 'bg-blush ring-2 ring-[#212121]' : 'text-blush bg-[#212121]'
                  } ${preview.loading === v.id ? 'animate-pulse' : ''}`}
                >
                  <PlayIcon playing={playing} />
                </button>
                {editing ? (
                  <form
                    className="flex min-w-0 flex-1 items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void rename();
                    }}
                  >
                    <label htmlFor={`name-${v.id}`} className="sr-only">
                      New name for {v.name}
                    </label>
                    <input
                      id={`name-${v.id}`}
                      autoFocus
                      maxLength={NAME_MAX}
                      value={renaming.name}
                      onChange={(e) => setRenaming({ id: v.id, name: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                      className="field-line min-h-11 min-w-0 flex-1 px-0.5 text-[24px]"
                    />
                    <button
                      type="submit"
                      disabled={busy || !renaming.name.trim()}
                      className={buttonClasses({ variant: 'secondary', className: 'px-3' })}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenaming(null)}
                      className="min-h-11 px-2 text-[15px] font-medium underline underline-offset-2"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="font-display truncate text-[24px] leading-tight sm:text-[26px]">
                        {v.name}
                      </span>
                      <span className="text-ink-muted line-clamp-2 text-[15px]">
                        {v.description}
                      </span>
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setRenaming({ id: v.id, name: v.name })}
                        aria-label={`Rename ${v.name}`}
                        className={buttonClasses({ variant: 'secondary', size: 'sm' })}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(v)}
                        aria-label={`Delete ${v.name}`}
                        className={buttonClasses({ variant: 'secondary', size: 'sm' })}
                      >
                        Delete
                      </button>
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p role="status" className="m-0 text-[15px] empty:hidden">
        {preview.note || message}
      </p>

      <p className="text-ink-muted m-0 text-[14px] leading-5">
        Voices are made up from your description; they never copy a real person. Deleting a voice
        doesn&apos;t change videos you already made with it.
      </p>

      <Sheet
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={deleting ? `Delete ${deleting.name}?` : 'Delete voice?'}
        tone="dark"
      >
        <p className="m-0 text-[17px] leading-[1.45]">
          Videos you already made keep their voice. A video that is still being made switches to its
          look&apos;s voice. This frees one of your {slots.limit} slots and can&apos;t be undone.
        </p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => setDeleting(null)}
            className={buttonClasses({ size: 'lg' })}
          >
            Keep it
          </button>
          <button
            type="button"
            onClick={() => void remove()}
            aria-disabled={busy}
            className="press inline-flex min-h-[54px] items-center justify-center rounded-[8px] bg-[#c81e3a] px-6 text-[17px] font-semibold text-white"
          >
            {busy ? 'Deleting…' : 'Delete voice'}
          </button>
        </div>
      </Sheet>
    </section>
  );
}
