'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { anotherLikeHref } from '@/components/ideas';
import { buttonClasses } from '@/components/ui/button';
import { onRadioKeyDown } from '@/components/ui/radio-keys';
import {
  STEP_COUNT,
  countByFilter,
  finishedMessage,
  type Filter,
  type LibraryCard,
} from './library';
import { postingStats, streakLine } from './posting';
import { usePostedLog } from './use-posted-log';
import { VideoThumb } from './video-thumb';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'working', label: 'In progress' },
  { id: 'ready', label: 'Ready' },
  { id: 'failed', label: 'Failed' },
];

const fmt = (n: number) => n.toLocaleString('en-US');
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Filter chips only once there is something to filter (DesignPlan §4 S, Q4). */
const FILTERS_FROM = 12;

export function LibraryGrid({
  cards,
  balance,
  freeTrial,
  hero,
}: {
  cards: LibraryCard[];
  balance: number;
  freeTrial: boolean;
  /** Today's idea, shown beside the latest video. */
  hero?: ReactNode;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Tell screen readers when a video finishes while the Library polls. Compares
  // with the previous render's cards (React's "adjust state on prop change").
  const [prevCards, setPrevCards] = useState(cards);
  const [finished, setFinished] = useState('');
  if (cards !== prevCards) {
    setPrevCards(cards);
    const message = finishedMessage(prevCards, cards);
    if (message) setFinished(message);
  }

  const posted = usePostedLog(cards, () =>
    flash("Couldn't save that. Check your connection and try again."),
  );
  const hasReady = cards.some((c) => c.kind === 'ready');
  const counts = countByFilter(cards);
  const showFilters = cards.length >= FILTERS_FROM;
  // The newest video is shown large beside Today's idea, so the row starts after it.
  const featured = cards[0]?.kind === 'failed' ? null : (cards[0] ?? null);
  const shown = cards.filter(
    (c) => (filter === 'all' || c.kind === filter) && !(filter === 'all' && c === featured),
  );
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
    <div className="flex flex-col gap-14">
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-16 xl:grid-cols-[minmax(0,1fr)_340px]">
        {hero}
        {featured && (
          <figure className="mx-auto flex w-full max-w-[200px] flex-col gap-3 sm:max-w-[300px] lg:max-w-none">
            {featured.kind === 'ready' ? (
              <button
                type="button"
                onClick={() => setOpenId(featured.id)}
                aria-label={`Play ${featured.title}`}
                className="group relative block w-full overflow-hidden rounded-[24px] text-left"
              >
                <VideoThumb
                  id={featured.id}
                  themeId={featured.themeId}
                  hasThumb={featured.hasThumb}
                />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="flex size-16 items-center justify-center rounded-full bg-white/90 transition-transform group-hover:scale-105">
                    <svg width="22" height="22" viewBox="0 0 18 18" aria-hidden="true">
                      <path d="M6 3.5v11l9-5.5z" fill="#0e0f11" />
                    </svg>
                  </span>
                </span>
              </button>
            ) : (
              <div className="bg-raised relative overflow-hidden rounded-[24px]">
                <VideoThumb
                  id={featured.id}
                  themeId={featured.themeId}
                  hasThumb={featured.hasThumb}
                  className={featured.hasThumb ? 'opacity-35' : 'opacity-0'}
                />
                <div className="absolute inset-x-4 bottom-4 flex flex-col gap-2">
                  <span className="text-[17px] font-semibold">{featured.stepLabel}</span>
                  <span className="text-ink-muted text-sm">
                    Step {featured.step} of {STEP_COUNT}
                  </span>
                  <div
                    role="progressbar"
                    aria-label={`${featured.title}: ${featured.stepLabel}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={featured.percent}
                    className="bg-paper h-1.5 overflow-hidden rounded-full"
                  >
                    <div
                      className="bg-ember h-full rounded-full transition-[width] duration-500"
                      style={{ width: `${featured.percent}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
            <figcaption className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-semibold">
                {featured.kind === 'ready' ? 'Latest · ' : 'Making · '}
                {featured.title}
              </span>
              {featured.kind === 'ready' && posted.log[featured.id] && (
                <span className="text-ink-muted shrink-0">Posted</span>
              )}
            </figcaption>
          </figure>
        )}
      </div>

      <section aria-labelledby="videos-h" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="videos-h" className="text-[17px] font-semibold">
            Your videos
          </h2>
          {hasReady && posted.today && (
            <p className="text-ink-muted text-sm">
              {streakLine(postingStats(posted.log, posted.today))}
            </p>
          )}
        </div>
        {showFilters && (
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
            className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
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
                  className={`text-ink inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm whitespace-nowrap transition-colors md:min-h-10 ${
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
        )}

        {shown.length === 0 ? (
          <p className="text-ink-muted border-line-strong rounded-card border border-dashed p-8 text-center">
            {filter === 'failed'
              ? 'No failed videos. Nice.'
              : 'Your next videos will line up here.'}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
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
                    {posted.log[c.id] && (
                      <span className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-black/60 text-white">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 20 20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M4 10.5l4 4 8-9" />
                        </svg>
                        <span className="sr-only">Posted</span>
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

                {c.kind === 'failed' && c.blocked && (
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
                      <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z" />
                      <path d="M12 8v4" />
                      <path d="M12 15.5h.01" />
                    </svg>
                    <span className="text-[15px] leading-5 font-semibold">
                      We didn&apos;t make this one
                    </span>
                    <span className="text-ink-muted text-[13px] leading-[18px]">
                      The script asked for images Shortcraft doesn&apos;t make, so we stopped before
                      drawing anything. Your credits were refunded.
                    </span>
                    <Link
                      href={anotherLikeHref(c)}
                      aria-label={`Try a different idea instead of ${c.title}`}
                      className={buttonClasses({
                        variant: 'secondary',
                        size: 'sm',
                        className: 'mt-1 min-h-11',
                      })}
                    >
                      Try a different idea
                    </Link>
                    <Link
                      href="/terms#acceptable-use"
                      className="text-ember-ink inline-flex min-h-11 items-center text-[13px] font-medium underline underline-offset-2 md:min-h-6"
                    >
                      What we don&apos;t make
                    </Link>
                  </div>
                )}

                {c.kind === 'failed' && !c.blocked && (
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
                        className="text-ember-ink mt-1 inline-flex min-h-6 items-center text-sm font-semibold underline underline-offset-2"
                      >
                        Get credits to try again
                      </Link>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-0.5 px-0.5">
                  <span className="line-clamp-2 text-[15px] leading-5 font-semibold">
                    {c.title}
                  </span>
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
            posted={Boolean(posted.log[open.id])}
            onTogglePosted={() => posted.toggle(open.id)}
            onClose={() => setOpenId(null)}
            onCopied={() => flash('Title copied')}
          />
        )}

        <p role="status" className="sr-only">
          {finished}
        </p>

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
    </div>
  );
}

/** The player sheet: a native modal <dialog> (focus trap, Esc to close, top layer). */
function PlayerSheet({
  card,
  freeTrial,
  posted,
  onTogglePosted,
  onClose,
  onCopied,
}: {
  card: LibraryCard;
  freeTrial: boolean;
  posted: boolean;
  onTogglePosted: () => void;
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
      className="bg-surface text-ink shadow-sheet backdrop:bg-scrim sm:rounded-panel m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto p-0 sm:m-auto sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[min(960px,calc(100vw-2rem))]"
    >
      {/* Full-screen on phones: keep Close in reach while the sheet scrolls. */}
      <div className="bg-surface sticky top-0 z-10 flex justify-end px-3 pt-3 sm:hidden">
        <button
          type="button"
          onClick={() => ref.current?.close()}
          aria-label="Close"
          className="border-line flex size-11 items-center justify-center rounded-full border"
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
      <div className="flex flex-col gap-6 p-5 pt-2 sm:flex-row sm:gap-8 sm:p-7">
        <div className="rounded-card relative mx-auto w-full max-w-[min(380px,calc((100dvh-360px)*9/16))] shrink-0 overflow-hidden bg-black sm:w-[340px] sm:max-w-[380px] lg:w-[380px]">
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
              className="border-line hover:bg-raised hidden size-10 shrink-0 items-center justify-center rounded-full border sm:flex"
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

          <button
            type="button"
            aria-pressed={posted}
            onClick={onTogglePosted}
            className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full text-[15px] font-semibold transition-colors ${
              posted ? 'bg-ember-soft text-ember-ink' : 'bg-raised text-ink hover:bg-line'
            }`}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {posted ? <path d="M4 10.5l4 4 8-9" /> : <path d="M10 4v12M4 10h12" />}
            </svg>
            {posted ? 'Posted' : 'Mark as posted'}
          </button>

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
