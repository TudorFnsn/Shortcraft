'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { anotherLikeHref, createHref, type Idea } from '@/components/ideas';
import { ColourIn } from '@/components/motion/colour-in';
import { SplitLines } from '@/components/motion/split-lines';
import { StepReveal } from '@/components/motion/step-reveal';
import { sweepIn, sweepOut } from '@/components/motion/sweep';
import { Badge } from '@/components/ui/badge';
import { Box } from '@/components/ui/box';
import { buttonClasses } from '@/components/ui/button';
import { Note } from '@/components/ui/note';
import { onRadioKeyDown } from '@/components/ui/radio-keys';
import {
  STEP_COUNT,
  STEP_LABELS,
  countByFilter,
  finishedMessage,
  libraryTitle,
  type Filter,
  type LibraryCard,
} from './library';
import { postingStats, streakLine } from './posting';
import { TodayHero } from './today-hero';
import { usePostedLog } from './use-posted-log';
import { VideoThumb } from './video-thumb';
import { VoiceoverEditor } from './voiceover-editor';
import type { MyVoice } from '@/components/voice/voice-choice';

/** "v2" beside a re-voiced video's title. */
function VersionBadge({ version }: { version: number }) {
  if (version < 2) return null;
  return (
    <span className="ml-1.5 inline-block rounded-full bg-[#212121] px-1.5 py-px align-[3px] font-sans text-xs font-semibold text-[#f0e2dd]">
      v{version}
    </span>
  );
}

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

/** Page title (B.1 app scale) with the streak as a handwritten note. */
export function LibraryTitle({ note }: { note?: string | null }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 px-2 pt-4 sm:px-0 sm:pt-6">
      <SplitLines
        as="h1"
        className="font-display m-0 text-[56px] leading-[.8] font-normal tracking-[-0.04em] sm:text-[clamp(56px,8vw,128px)]"
      >
        Your videos
      </SplitLines>
      {note && (
        <Note rotate={-8} className="mb-2 text-[26px] sm:mr-16 sm:text-[40px]">
          {note}
        </Note>
      )}
    </div>
  );
}

/**
 * Your videos (DesignPlan §4 B.2, boards Home, HomeDark and PhoneHome): the
 * title with the streak note, the blush Today's idea box with the video being
 * made on a frosted card, and the sky box of 9:16 cards (chips for Ready,
 * Posted and Didn't finish; colour comes in as they scroll up). The player is
 * a dark box that sweeps in.
 */
export function LibraryGrid({
  cards,
  balance,
  myVoices = [],
  freeTrial,
  ideas,
  tomorrow,
}: {
  cards: LibraryCard[];
  balance: number;
  /** The creator's saved voices, for the voiceover editor. */
  myVoices?: MyVoice[];
  freeTrial: boolean;
  /** Today's ideas for the blush box. */
  ideas: readonly Idea[];
  /** Tomorrow's idea, shown in the player. */
  tomorrow: Idea | null;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Fixed on first render, so the title doesn't flip while the page polls.
  const [now] = useState(() => new Date());

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
  const stats = posted.today ? postingStats(posted.log, posted.today) : null;
  const hasReady = cards.some((c) => c.kind === 'ready');
  const counts = countByFilter(cards);
  const showFilters = cards.length >= FILTERS_FROM;
  // The video being made rides on Today's box; the grid holds the rest.
  const making = cards.find((c) => c.kind === 'working') ?? null;
  const shown = cards.filter(
    (c) => (filter === 'all' || c.kind === filter) && !(filter === 'all' && c === making),
  );
  const open = cards.find((c) => c.id === openId) ?? null;
  const editing = cards.find((c) => c.id === editingId) ?? null;

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
    flash('Started again. It’s at the top of Your videos.');
    router.refresh();
  }

  return (
    <>
      <LibraryTitle note={stats && stats.streak >= 2 ? `${stats.streak} days in a row!` : null} />

      <TodayHero ideas={ideas} side={making ? <MakingCard card={making} /> : null} />

      <Box
        tone="sky"
        pop
        alternate
        aria-labelledby="videos-h"
        className="flex flex-col gap-6 px-4 py-6 sm:gap-7 sm:p-12"
      >
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div>
            <p className="m-0 text-[12px] font-semibold tracking-[2px] uppercase sm:text-[16px] sm:tracking-[3px]">
              Ready to post
            </p>
            <h2
              id="videos-h"
              className="font-display m-0 mt-1 text-[36px] leading-[.85] font-normal tracking-[-0.04em] sm:text-[72px] sm:leading-[.8]"
            >
              {libraryTitle(cards, now)}
            </h2>
          </div>
          {hasReady && stats && <p className="m-0 text-[15px]">{streakLine(stats)}</p>}
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
                  className={`press inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[15px] font-semibold whitespace-nowrap ${
                    checked ? 'text-blush bg-[#212121] [--press-line:#000]' : 'bg-transparent'
                  }`}
                >
                  {f.label}
                  <span className="text-[13px] tabular-nums opacity-80">{counts[f.id]}</span>
                </button>
              );
            })}
          </div>
        )}

        {shown.length === 0 ? (
          <p className="m-0 rounded-[8px] border border-dashed border-current p-8 text-center text-[17px]">
            {filter === 'failed'
              ? 'No failed videos. Nice.'
              : 'Your next videos will line up here.'}
          </p>
        ) : (
          <ul className="m-0 grid list-none grid-cols-2 gap-x-3 gap-y-6 p-0 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-5 xl:grid-cols-6">
            {shown.map((c) => (
              <li
                key={c.id}
                className="flex min-w-0 flex-col gap-2.5 transition-transform duration-300 hover:translate-x-0.5 hover:translate-y-0.5 hover:-rotate-1"
              >
                <VideoCard
                  card={c}
                  posted={Boolean(posted.log[c.id])}
                  balance={balance}
                  retrying={retrying === c.id}
                  onOpen={() => setOpenId(c.id)}
                  onRetry={() => void retry(c)}
                />
                <div className="flex flex-col gap-0.5 px-0.5">
                  <h3 className="font-display m-0 line-clamp-2 text-[19px] leading-[1.05] font-normal sm:text-[21px]">
                    {c.title}
                    <VersionBadge version={c.version} />
                  </h3>
                  <p className="m-0 text-[14px] leading-[18px]">{c.meta}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Box>

      {open && (
        <PlayerSheet
          card={open}
          freeTrial={freeTrial}
          tomorrow={tomorrow}
          posted={Boolean(posted.log[open.id])}
          onTogglePosted={() => posted.toggle(open.id)}
          onClose={() => setOpenId(null)}
          onCopied={() => flash('Title copied')}
          onEditVoiceover={() => {
            setOpenId(null);
            setEditingId(open.id);
          }}
        />
      )}

      {editing && (
        <VoiceoverEditor
          card={editing}
          balance={balance}
          myVoices={myVoices}
          onClose={() => setEditingId(null)}
          onStarted={() => {
            setEditingId(null);
            setFilter('all');
            flash('Making the new version. It’s at the top of Your videos.');
            router.refresh();
          }}
        />
      )}

      <p role="status" className="sr-only">
        {finished}
      </p>

      <div
        role="status"
        aria-live="polite"
        className={`text-blush shadow-sheet fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[#212121] px-5 py-3 text-[15px] transition-opacity ${
          toast ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        {toast}
      </div>
    </>
  );
}

/**
 * The video being made, on the frosted card in Today's box: its steps pop in
 * one by one (B.1 motion #8), the current one in the dark pill, with progress.
 */
function MakingCard({ card }: { card: LibraryCard }) {
  return (
    <article
      aria-labelledby={`making-${card.id}`}
      className="flex min-w-0 rotate-2 gap-4 rounded-[8px] border border-white/50 bg-[rgb(240_226_221/.4)] p-4 shadow-[0_4px_30px_rgb(0_0_0/.1)] backdrop-blur-[10px] sm:gap-5 sm:p-6 lg:w-[460px] lg:shrink-0"
    >
      <div className="w-[96px] shrink-0 overflow-hidden rounded-[8px] grayscale-[.85] sm:w-[130px]">
        <VideoThumb id={card.id} themeId={card.themeId} hasThumb={card.hasThumb} />
      </div>
      <div className="flex min-w-0 flex-col gap-2.5">
        <p className="text-ember-ink m-0 text-[13px] font-semibold tracking-[2px] uppercase">
          {card.stepLabel}
        </p>
        <h3
          id={`making-${card.id}`}
          className="font-display m-0 text-[22px] leading-[1.05] font-normal sm:text-[26px]"
        >
          {card.title}
        </h3>
        <div
          role="progressbar"
          aria-label={`${card.title}: ${card.stepLabel}, step ${card.step} of ${STEP_COUNT}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={card.percent}
          className="h-1.5 overflow-hidden rounded-full bg-[rgb(33_33_33/.12)]"
        >
          <div
            className="h-full rounded-full bg-[#212121] transition-[width] duration-500"
            style={{ width: `${card.percent}%` }}
          />
        </div>
        <StepReveal aria-hidden="true" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {STEP_LABELS.slice(0, card.step).map((label, i) => (
            <li
              key={label}
              className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                i === card.step - 1 ? 'text-blush bg-[#212121]' : 'bg-white text-[#212121]'
              }`}
            >
              {label}
            </li>
          ))}
        </StepReveal>
        <p className="m-0 text-[14px]">{card.meta}</p>
      </div>
    </article>
  );
}

/** A 9:16 card in the sky box, by state. */
function VideoCard({
  card: c,
  posted,
  balance,
  retrying,
  onOpen,
  onRetry,
}: {
  card: LibraryCard;
  posted: boolean;
  balance: number;
  retrying: boolean;
  onOpen: () => void;
  onRetry: () => void;
}) {
  const frame =
    'relative block w-full overflow-hidden rounded-[8px] shadow-[16px_16px_40px_rgb(4_40_57/.35)]';

  if (c.kind === 'ready') {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Play ${c.title}${posted ? ', posted' : ', ready'}`}
        className={`${frame} group text-left`}
      >
        <ColourIn>
          <VideoThumb id={c.id} themeId={c.themeId} hasThumb={c.hasThumb} />
        </ColourIn>
        <Badge
          tone={posted ? 'ink' : 'blush'}
          className="absolute top-2 left-2 px-2.5 py-1 text-[12px]"
        >
          {posted ? 'Posted' : c.isNew ? 'New' : 'Ready'}
        </Badge>
        <span className="absolute right-2 bottom-2 rounded-full bg-black/55 px-2 py-0.5 text-[12px] font-semibold text-white tabular-nums">
          {clock(c.durationSec)}
        </span>
        <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <span className="text-blush flex size-12 items-center justify-center rounded-full bg-[#212121]">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M6 3.5v11l9-5.5z" fill="currentColor" />
            </svg>
          </span>
        </span>
      </button>
    );
  }

  if (c.kind === 'working') {
    return (
      <div className={frame}>
        <VideoThumb
          id={c.id}
          themeId={c.themeId}
          hasThumb={c.hasThumb}
          className="grayscale-[.85]"
        />
        <Badge tone="blush" className="absolute top-2 left-2 px-2.5 py-1 text-[12px]">
          {c.stepLabel}
        </Badge>
        <div
          role="progressbar"
          aria-label={`${c.title}: ${c.stepLabel}, step ${c.step} of ${STEP_COUNT}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={c.percent}
          className="absolute inset-x-3 bottom-3 h-1.5 overflow-hidden rounded-full bg-white/40"
        >
          <div
            className="h-full rounded-full bg-white transition-[width] duration-500"
            style={{ width: `${c.percent}%` }}
          />
        </div>
      </div>
    );
  }

  // Failed: grey frame, the red chip, and one way forward.
  return (
    <div
      className={`${frame} box-dark flex aspect-[9/16] flex-col items-start justify-end gap-2 p-3`}
    >
      <VideoThumb
        id={c.id}
        themeId={c.themeId}
        hasThumb={false}
        className="absolute inset-0 opacity-30 grayscale"
      />
      <Badge tone="danger" className="absolute top-2 left-2 px-2.5 py-1 text-[12px]">
        {c.blocked ? 'Not made' : 'Didn’t finish'}
      </Badge>
      <p className="relative m-0 text-[13px] leading-[18px]">
        {c.blocked
          ? 'The script asked for images Shortcraft doesn’t make. Credits refunded.'
          : 'Credits refunded.'}
      </p>
      {c.blocked ? (
        <>
          <Link
            href={anotherLikeHref(c)}
            aria-label={`Try a different idea instead of ${c.title}`}
            className={buttonClasses({ size: 'sm', className: 'relative w-full px-2' })}
          >
            Try a different idea
          </Link>
          <Link
            href="/terms#acceptable-use"
            className="relative inline-flex min-h-11 items-center text-[13px] underline underline-offset-2"
          >
            What we don&apos;t make
          </Link>
        </>
      ) : c.retryCredits <= balance ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          aria-label={`Try again: ${c.title}, about ${fmt(c.retryCredits)} credits`}
          className={buttonClasses({ size: 'sm', className: 'relative w-full px-2' })}
        >
          {retrying ? 'Starting…' : `Try again · ~${fmt(c.retryCredits)}`}
        </button>
      ) : (
        <Link
          href="/pricing"
          className={buttonClasses({ size: 'sm', className: 'relative w-full px-2' })}
        >
          Get credits to try again
        </Link>
      )}
    </div>
  );
}

/**
 * The player (DesignPlan §4 B.2, boards Player and PhonePlayer): a dark box that
 * sweeps in on a native modal <dialog> (focus trap, Esc, top layer) and sweeps
 * back out. Full screen on phones.
 */
function PlayerSheet({
  card,
  freeTrial,
  tomorrow,
  posted,
  onTogglePosted,
  onClose,
  onCopied,
  onEditVoiceover,
}: {
  card: LibraryCard;
  freeTrial: boolean;
  tomorrow: Idea | null;
  posted: boolean;
  onTogglePosted: () => void;
  onClose: () => void;
  onCopied: () => void;
  onEditVoiceover: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closing = useRef(false);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      sweepIn(dialog);
    }
  }, []);

  // Close with the sweep reversed; the native close event then unmounts it.
  function close() {
    const dialog = ref.current;
    if (!dialog || closing.current) return;
    closing.current = true;
    sweepOut(dialog, () => dialog.close());
  }

  const videoUrl = `/api/jobs/${card.id}/video`;
  return (
    <dialog
      ref={ref}
      aria-labelledby="sheet-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop lands on the <dialog> itself.
        if (e.target === e.currentTarget) close();
      }}
      className="box-dark shadow-sheet backdrop:bg-scrim m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto rounded-none p-0 sm:m-auto sm:h-auto sm:max-h-[calc(100dvh-80px)] sm:w-[calc(100vw-80px)] sm:max-w-[1360px] sm:rounded-[8px]"
    >
      <button
        type="button"
        onClick={close}
        aria-label="Close"
        className="press sticky top-3 z-10 mr-3 ml-auto flex size-12 items-center justify-center rounded-[8px] bg-[#212121] sm:absolute sm:top-6 sm:right-6"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M4 4l12 12M16 4L4 16" />
        </svg>
      </button>
      <div className="flex flex-col items-center gap-8 px-5 pt-2 pb-8 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-16 sm:p-14">
        <div className="shadow-hero relative w-full max-w-[min(380px,calc((100dvh-260px)*9/16))] shrink-0 overflow-hidden rounded-[10px] bg-black sm:w-[340px] lg:w-[380px]">
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
              <span className="absolute inset-x-4 bottom-4 rounded-[8px] bg-black/70 px-3 py-2 text-center text-[13px] text-white">
                Playback works once videos are rendered live.
              </span>
            </>
          )}
        </div>

        <div className="relative flex w-full max-w-[520px] min-w-0 flex-col gap-4 sm:gap-5">
          <p className="font-label m-0 text-[15px] tracking-[2px] uppercase sm:text-[16px]">
            {card.meta}
            {card.creditsUsed > 0 ? ` · ${fmt(card.creditsUsed)} credits` : ''}
          </p>
          <h2
            id="sheet-title"
            className="font-display m-0 text-[44px] leading-[.85] font-light tracking-[-0.03em] sm:text-[84px] sm:leading-[.8]"
          >
            {card.title}
            <VersionBadge version={card.version} />
          </h2>

          <div className="mt-2 flex flex-col gap-3">
            {card.playable ? (
              <a
                href={`${videoUrl}?download=1`}
                className={buttonClasses({ size: 'xl', className: 'w-full sm:text-[40px]' })}
              >
                Download
              </a>
            ) : (
              <span
                aria-disabled="true"
                className={buttonClasses({
                  size: 'xl',
                  className: 'w-full cursor-not-allowed opacity-50 sm:text-[40px]',
                })}
              >
                Download
              </span>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(card.title).then(onCopied)}
                className={buttonClasses({ variant: 'secondary', className: 'min-h-12' })}
              >
                Copy title
              </button>
              <button
                type="button"
                aria-pressed={posted}
                onClick={onTogglePosted}
                className={buttonClasses({
                  variant: posted ? 'primary' : 'secondary',
                  className: 'min-h-12 gap-2',
                })}
              >
                {posted && (
                  <svg
                    width="16"
                    height="16"
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
                )}
                {posted ? 'Posted' : 'Mark as posted'}
              </button>
              <button
                type="button"
                onClick={onEditVoiceover}
                className={buttonClasses({ variant: 'secondary', className: 'min-h-12' })}
              >
                Edit voiceover
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[rgb(240_226_221/.25)] pt-5">
            <p className="m-0 text-[15px]">
              {tomorrow ? (
                <>
                  Tomorrow:{' '}
                  <Link
                    href={createHref(tomorrow)}
                    className="font-display text-[20px] underline-offset-4 hover:underline"
                  >
                    {tomorrow.topic}
                  </Link>
                </>
              ) : null}
            </p>
            <Link
              href={anotherLikeHref(card)}
              className="inline-flex min-h-11 items-center text-[15px] font-semibold underline underline-offset-4"
            >
              Make another like this
            </Link>
          </div>

          {freeTrial && (
            <p className="text-ink-muted m-0 text-[13px] leading-[18px]">
              Trial videos carry a small &ldquo;Made with Shortcraft&rdquo; mark.{' '}
              <Link href="/pricing" className="text-ink font-semibold underline">
                Remove it with any plan
              </Link>
            </p>
          )}

          <Note
            colour="orange"
            rotate={14}
            className="absolute -top-16 -right-10 text-[40px] max-lg:hidden"
          >
            post it now!
          </Note>
        </div>
      </div>
    </dialog>
  );
}
