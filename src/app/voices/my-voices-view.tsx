'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
 * My voices (Voice Studio V4): the creator's saved voices with ▶, rename and
 * delete, the plan's slot count and, at the limit, the way out.
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-[32px] leading-9 font-bold sm:text-[40px] sm:leading-[44px]">
            My voices
          </h1>
          <span className="text-ink-muted text-[15px]">{slots.line}</span>
        </div>
        {slots.atLimit ? (
          <span
            aria-disabled="true"
            className="bg-raised text-ink-muted inline-flex min-h-12 cursor-not-allowed items-center gap-2 rounded-full px-5 text-[15px] font-semibold"
          >
            {plus}
            Create a voice
          </span>
        ) : (
          <Link
            href="/voices/new"
            className={buttonClasses({ className: 'min-h-12 gap-2 rounded-full px-5' })}
          >
            {plus}
            Create a voice
          </Link>
        )}
      </div>

      {slots.atLimit && (
        <div className="bg-ember-soft rounded-card flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
          <p className="text-ink flex-1 text-[15px] leading-[22px]">
            All your voice slots are in use. Delete one to make room
            {slots.more ? `, or move to ${slots.more.name} for ${slots.more.limit}.` : '.'}
          </p>
          {slots.more && (
            <Link
              href="/pricing"
              className="bg-surface text-ember-ink inline-flex min-h-11 items-center justify-center rounded-full px-5 text-[15px] font-semibold whitespace-nowrap"
            >
              See {slots.more.name}
            </Link>
          )}
        </div>
      )}

      {voices.length === 0 ? (
        <div className="bg-surface rounded-card flex flex-col items-center gap-3 px-6 py-10 text-center">
          <p className="text-[17px] font-semibold">No voices yet</p>
          <p className="text-ink-muted max-w-[420px] text-[15px] leading-[22px]">
            Describe the narrator you want, hear 3 samples and keep the one that fits. It&apos;s
            yours for every video.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {voices.map((v) => {
            const playing = preview.playing === v.id;
            const editing = renaming?.id === v.id;
            return (
              <li
                key={v.id}
                className="bg-surface flex flex-wrap items-center gap-3 rounded-[18px] py-3 pr-3 pl-3.5 sm:flex-nowrap"
              >
                <button
                  type="button"
                  onClick={() => void preview.toggleVoice(v.id, 'story-time')}
                  aria-label={`${playing ? 'Stop' : 'Play'} ${v.name}`}
                  aria-pressed={playing}
                  aria-busy={preview.loading === v.id}
                  className={`flex size-12 shrink-0 items-center justify-center rounded-full transition-colors ${
                    playing ? 'bg-ember text-on-ember' : 'bg-raised text-ink hover:bg-line'
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
                      className="bg-raised text-ink min-h-11 min-w-0 flex-1 rounded-[12px] px-3 text-[15px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ember)]"
                    />
                    <button
                      type="submit"
                      disabled={busy || !renaming.name.trim()}
                      className="text-ember-ink min-h-11 px-3 text-[15px] font-semibold disabled:opacity-60"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenaming(null)}
                      className="text-ink-muted min-h-11 px-2 text-[15px] font-medium"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-base font-semibold">{v.name}</span>
                      <span className="text-ink-muted line-clamp-2 text-sm">{v.description}</span>
                    </span>
                    <span className="ml-auto flex shrink-0 items-center">
                      <button
                        type="button"
                        onClick={() => setRenaming({ id: v.id, name: v.name })}
                        aria-label={`Rename ${v.name}`}
                        className="text-ink hover:bg-raised min-h-11 rounded-full px-3.5 text-[15px] font-medium"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(v)}
                        aria-label={`Delete ${v.name}`}
                        className="text-danger hover:bg-raised min-h-11 rounded-full px-3.5 text-[15px] font-medium"
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

      <p role="status" className="text-ink-muted text-sm">
        {preview.note || message}
      </p>

      <p className="text-ink-muted text-sm leading-5">
        Voices are made up from your description; they never copy a real person. Deleting a voice
        doesn&apos;t change videos you already made with it.
      </p>

      <Sheet
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={deleting ? `Delete ${deleting.name}?` : 'Delete voice?'}
      >
        <p className="text-ink-muted text-[15px] leading-[22px]">
          Videos you already made keep their voice. A video that is still being made switches to its
          look&apos;s voice. This frees one of your {slots.limit} slots and can&apos;t be undone.
        </p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => setDeleting(null)}
            className={buttonClasses({ variant: 'secondary', className: 'rounded-full' })}
          >
            Keep it
          </button>
          <button
            type="button"
            onClick={() => void remove()}
            aria-disabled={busy}
            className="bg-danger text-paper inline-flex min-h-12 items-center justify-center rounded-full px-6 text-[15px] font-semibold"
          >
            {busy ? 'Deleting…' : 'Delete voice'}
          </button>
        </div>
      </Sheet>
    </div>
  );
}
