'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { anotherLikeHref } from '@/components/ideas';
import { buttonClasses } from '@/components/ui/button';
import { onRadioKeyDown } from '@/components/ui/radio-keys';
import { STEP_COUNT, countByFilter, type Filter, type LibraryCard } from './library';
import { VideoThumb } from './video-thumb';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'working', label: 'In progress' },
  { id: 'ready', label: 'Ready' },
  { id: 'failed', label: 'Failed' },
];

const fmt = (n: number) => n.toLocaleString('en-US');
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function LibraryGrid({
  cards,
  balance,
  freeTrial,
}: {
  cards: LibraryCard[];
  balance: number;
  freeTrial: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const counts = countByFilter(cards);
  const shown = cards.filter((c) => filter === 'all' || c.kind === filter);
  const open = cards.find((c) => c.id === openId) ?? null;

  function flash(text: string) {
    clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  }
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // One-click retry: same idea and settings. The failed run was refunded and
  // the button shows the cost, so starting straight away is no surprise.
  async function retry(card: LibraryCard) {
    setRetrying(card.id);
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: card.topic,
        themeId: card.themeId,
        targetDurationSec: card.durationSec,
        modelTier: card.tier,
      }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setRetrying(null);
    if (!res?.ok) {
      flash(
        data.error === 'insufficient_credits'
          ? 'Not enough credits to try again.'
          : res?.status === 401
            ? 'You were signed out. Log in again to continue.'
            : (data.message ?? "Couldn't start it again. No credits were used."),
      );
      return;
    }
    setFilter('all');
    flash('Started again. It’s at the top of your Library.');
    router.refresh();
  }

  return (
    <section aria-labelledby="videos-h" className="flex flex-col gap-5">
      <h2 id="videos-h" className="sr-only">
        All videos
      </h2>
      <div
        role="radiogroup"
        aria-label="Show"
        onKeyDown={(e) =>
          onRadioKeyDown(
            e,
            FILTERS.map((f) => f.id),
            filter,
            setFilter,
          )
        }
        className="flex flex-wrap gap-2"
      >
        {FILTERS.map((f) => {
          const checked = f.id === filter;
          return (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => setFilter(f.id)}
              className={`text-ink inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm transition-colors ${
                checked
                  ? 'bg-raised border-ink font-semibold'
                  : 'border-line-strong hover:bg-raised font-medium'
              }`}
            >
              {f.label}
              <span className="text-ink-muted text-xs font-semibold tabular-nums">
                {counts[f.id]}
              </span>
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <p className="text-ink-muted border-line-strong rounded-card border border-dashed p-8 text-center">
          {filter === 'failed' ? 'No failed videos. Nice.' : 'Nothing here right now.'}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shown.map((c) => (
            <li key={c.id} className="flex min-w-0 flex-col gap-2.5">
              {c.kind === 'ready' && (
                <button
                  type="button"
                  onClick={() => setOpenId(c.id)}
                  aria-label={`Play ${c.title}`}
                  className="rounded-card group relative block w-full overflow-hidden text-left"
                >
                  <VideoThumb id={c.id} themeId={c.themeId} hasThumb={c.hasThumb} />
                  <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    <span className="flex size-12 items-center justify-center rounded-full bg-white/90">
                      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                        <path d="M6 3.5v11l9-5.5z" fill="#221c17" />
                      </svg>
                    </span>
                  </span>
                  <span className="absolute right-2 bottom-2 rounded-lg bg-[rgb(20_16_13/0.62)] px-2 py-0.5 text-xs font-semibold text-white tabular-nums">
                    {clock(c.durationSec)}
                  </span>
                  {c.isNew && (
                    <span className="bg-ember-soft text-ember-ink absolute top-2 left-2 rounded-full px-2 py-0.5 text-xs font-semibold">
                      New
                    </span>
                  )}
                </button>
              )}

              {c.kind === 'working' && (
                <div className="rounded-card bg-raised relative overflow-hidden">
                  <VideoThumb
                    id={c.id}
                    themeId={c.themeId}
                    hasThumb={c.hasThumb}
                    className={c.hasThumb ? 'opacity-35' : 'opacity-0'}
                  />
                  <div className="bg-surface absolute inset-x-3 bottom-3 flex flex-col gap-2 rounded-xl p-3">
                    <span className="bg-ember-soft text-ember-ink self-start rounded-full px-2 py-0.5 text-xs font-semibold">
                      Step {c.step} of {STEP_COUNT}
                    </span>
                    <span className="text-[15px] leading-5 font-semibold">{c.stepLabel}</span>
                    <div
                      role="progressbar"
                      aria-label={`${c.title}: ${c.stepLabel}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={c.percent}
                      className="bg-raised h-1.5 overflow-hidden rounded-full"
                    >
                      <div
                        className="bg-ember h-full rounded-full transition-[width] duration-500"
                        style={{ width: `${c.percent}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {c.kind === 'failed' && (
                <div className="rounded-card bg-raised flex aspect-[9/16] flex-col items-center justify-center gap-2.5 p-4 text-center">
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="text-ink-muted"
                  >
                    <path d="M20 11a8 8 0 1 0-2.3 5.7" />
                    <path d="M20 4v7h-7" />
                  </svg>
                  <span className="text-[15px] leading-5 font-semibold">Didn&apos;t finish</span>
                  <span className="text-ink-muted text-[13px] leading-[18px]">
                    Your credits were refunded.
                  </span>
                  {c.retryCredits <= balance ? (
                    <button
                      type="button"
                      onClick={() => void retry(c)}
                      disabled={retrying === c.id}
                      aria-label={`Try again: ${c.title}, about ${fmt(c.retryCredits)} credits`}
                      className={buttonClasses({
                        variant: 'secondary',
                        size: 'sm',
                        className: 'mt-1 min-h-11',
                      })}
                    >
                      {retrying === c.id ? 'Starting…' : `Try again · ~${fmt(c.retryCredits)}`}
                    </button>
                  ) : (
                    <Link
                      href="/pricing"
                      className="text-ember-ink mt-1 text-sm font-semibold underline underline-offset-2"
                    >
                      Get credits to try again
                    </Link>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-0.5 px-0.5">
                <span className="line-clamp-2 text-[15px] leading-5 font-semibold">{c.title}</span>
                <span className="text-ink-muted text-[13px] leading-[18px]">{c.meta}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <PlayerSheet
          card={open}
          freeTrial={freeTrial}
          onClose={() => setOpenId(null)}
          onCopied={() => flash('Title copied')}
        />
      )}

      <div
        role="status"
        aria-live="polite"
        className={`bg-ink text-paper shadow-sheet fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-[14px] px-4 py-3 text-sm transition-opacity ${
          toast ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        {toast}
      </div>
    </section>
  );
}

/** The player sheet: a native modal <dialog> (focus trap, Esc to close, top layer). */
function PlayerSheet({
  card,
  freeTrial,
  onClose,
  onCopied,
}: {
  card: LibraryCard;
  freeTrial: boolean;
  onClose: () => void;
  onCopied: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const videoUrl = `/api/jobs/${card.id}/video`;
  return (
    <dialog
      ref={ref}
      aria-labelledby="sheet-title"
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop lands on the <dialog> itself.
        if (e.target === e.currentTarget) ref.current?.close();
      }}
      className="bg-surface text-ink rounded-panel shadow-sheet backdrop:bg-scrim m-auto max-h-[calc(100dvh-2rem)] w-[min(960px,calc(100vw-2rem))] overflow-y-auto p-0"
    >
      <div className="flex flex-col gap-6 p-5 sm:flex-row sm:gap-8 sm:p-7">
        <div className="rounded-card relative mx-auto w-full max-w-[380px] shrink-0 overflow-hidden bg-black sm:w-[340px] lg:w-[380px]">
          {card.playable ? (
            <video
              controls
              playsInline
              preload="metadata"
              src={videoUrl}
              aria-label={card.title}
              className="aspect-[9/16] w-full"
            />
          ) : (
            <>
              <VideoThumb id={card.id} themeId={card.themeId} hasThumb={card.hasThumb} />
              <span className="absolute inset-x-4 bottom-4 rounded-xl bg-[rgb(20_16_13/0.7)] px-3 py-2 text-center text-[13px] text-white">
                Playback works once videos are rendered live.
              </span>
            </>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="flex items-start justify-between gap-3">
            <span className="text-success inline-flex items-center gap-1.5 text-sm font-semibold">
              <svg
                width="16"
                height="16"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 10.5l3.2 3L15 6.5" />
              </svg>
              Your video is ready
            </span>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              aria-label="Close"
              className="border-line hover:bg-raised flex size-10 shrink-0 items-center justify-center rounded-full border"
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

          <div className="flex flex-col gap-2">
            <h2
              id="sheet-title"
              className="font-display text-[28px] leading-8 font-bold tracking-[-0.015em]"
            >
              {card.title}
            </h2>
            <span className="text-ink-muted text-sm">
              {card.meta}
              {card.creditsUsed > 0 ? ` · ${fmt(card.creditsUsed)} credits` : ''}
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            {card.playable ? (
              <a href={`${videoUrl}?download=1`} className={buttonClasses({ size: 'lg' })}>
                <DownloadIcon />
                Download MP4
              </a>
            ) : (
              <span
                aria-disabled="true"
                className={buttonClasses({
                  size: 'lg',
                  className: 'cursor-not-allowed opacity-50',
                })}
              >
                <DownloadIcon />
                Download MP4
              </span>
            )}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(card.title).then(onCopied)}
                className={buttonClasses({ variant: 'secondary' })}
              >
                Copy title
              </button>
              <Link
                href={anotherLikeHref(card)}
                className={buttonClasses({ variant: 'secondary' })}
              >
                Make another like this
              </Link>
            </div>
          </div>

          <div className="bg-paper rounded-card flex flex-col gap-1.5 p-4">
            <span className="text-sm font-semibold">Ready to post</span>
            <span className="text-ink-muted text-sm">
              Vertical 9:16 MP4 with captions and an AI-generated label, sized for TikTok, Reels and
              Shorts. It stays in your Library, so you can download it again any time.
            </span>
          </div>

          {freeTrial && (
            <p className="text-ink-muted text-[13px] leading-[18px]">
              Trial videos carry a small &ldquo;Made with Shortcraft&rdquo; mark.{' '}
              <Link href="/pricing" className="text-ember-ink font-semibold underline">
                Remove it with any plan
              </Link>
            </p>
          )}
        </div>
      </div>
    </dialog>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 3v10M5.5 8.5L10 13l4.5-4.5M4 16.5h12" />
    </svg>
  );
}
