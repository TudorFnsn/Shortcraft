'use client';

import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { THEMES } from '@/config/themes';
import { TOPIC_MAX_CHARS } from '@/config/site';
import type { ModelTier } from '@/config/models';
import { estimateJobCredits } from '@/features/render/pricing';
import { lookFor } from '@/components/ideas';
import { ThemeFrame } from '@/components/theme-frame';
import { ColourIn } from '@/components/motion/colour-in';
import { useTypedWords } from '@/components/motion/typed';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClasses } from '@/components/ui/button';
import { Note } from '@/components/ui/note';
import { onRadioKeyDown } from '@/components/ui/radio-keys';
import { Sheet } from '@/components/ui/sheet';
import { defaultVoiceFor } from '@/config/voices';
import { VoicePicker } from '@/components/voice/voice-picker';
import { useVoicePreview } from '@/components/voice/use-voice-preview';
import {
  effectiveVoice,
  voiceName,
  voiceRequest,
  type MyVoice,
  type VoicePick,
} from '@/components/voice/voice-choice';
import {
  DURATIONS,
  TIERS,
  composerState,
  formatEuros,
  lengthLockPlan,
  tierLockPlan,
  type Selection,
} from './composer';

const TIER_COPY: Record<ModelTier, { title: string; desc: string; icon: string }> = {
  standard: {
    title: 'Standard',
    desc: 'Animated stills: an AI image per scene with smooth camera motion.',
    icon: 'M3 5.5h14v9H3zM3 11.5l4-3.5 3 2.5 3-2 4 3',
  },
  premium: {
    title: 'Premium',
    desc: 'AI video: real motion in every scene. Best for story and drama.',
    icon: 'M3 5h10v10H3zM13 8.5l4-2.5v8l-4-2.5',
  },
};

type Failure = { kind: 'moderation' | 'other'; message: string } | null;

const fmt = (n: number) => n.toLocaleString('en-US');

function LockIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="3" y="7" width="10" height="7" rx="2" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}

export function CreateForm({
  initial,
  initialVoice,
  myVoices,
  firstRun,
  lastThemeId,
  balance,
  maxDurationSec,
  allowedTiers,
  freeTrial,
}: {
  initial: Selection;
  /** The voice of the creator's last video (or the look's default). */
  initialVoice: VoicePick;
  /** The creator's saved voices (Voice Studio V4). */
  myVoices: MyVoice[];
  /** Brand-new account: the composer is prefilled so the first video is one tap away. */
  firstRun: boolean;
  /** Theme of the creator's latest video ("Last used" badge). */
  lastThemeId: string | null;
  balance: number;
  maxDurationSec: number;
  allowedTiers: ModelTier[];
  /** Never paid: videos carry the "Made with Shortcraft" watermark. */
  freeTrial: boolean;
}) {
  const router = useRouter();
  const [sel, setSel] = useState<Selection>(initial);
  const [failure, setFailure] = useState<Failure>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sheet, setSheet] = useState<'look' | 'length' | 'quality' | 'voice' | null>(null);
  const [voice, setVoice] = useState<VoicePick>(initialVoice);
  // The Look sheet previews the look under the pointer or focus before it is picked.
  const [peek, setPeek] = useState<string | null>(null);
  const preview = useVoicePreview();
  const closeSheet = () => {
    preview.stop();
    setPeek(null);
    setSheet(null);
  };

  const update = (patch: Partial<Selection>) => setSel((s) => ({ ...s, ...patch }));

  // Live estimate, plan check and affordability: no surprise paywall.
  const state = useMemo(
    () => composerState(sel, { balance, maxDurationSec, allowedTiers }),
    [sel, balance, maxDurationSec, allowedTiers],
  );
  const theme = THEMES.find((t) => t.id === sel.themeId) ?? THEMES[0]!;
  const locked = state.durationLocked || state.tierLocked;
  const canGenerate = state.primary.kind === 'generate' && state.primary.enabled && !submitting;

  // Longest length on the user's plan, and the longest they can afford at this quality.
  const longestOnPlan = [...DURATIONS].reverse().find((d) => d <= maxDurationSec) ?? 15;
  const affordableLength = [...DURATIONS]
    .reverse()
    .find(
      (d) =>
        d <= maxDurationSec &&
        estimateJobCredits({ targetDurationSec: d, modelTier: sel.tier }) <= balance,
    );

  async function generate() {
    if (!canGenerate) return;
    setSubmitting(true);
    setFailure(null);

    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: sel.topic,
        themeId: sel.themeId,
        targetDurationSec: sel.durationSec,
        modelTier: sel.tier,
        ...voiceRequest(voice),
      }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};

    if (!res?.ok) {
      setSubmitting(false);
      setFailure(
        data.error === 'moderation_blocked'
          ? {
              kind: 'moderation',
              message: data.message ?? "This topic isn't allowed. Try a different idea.",
            }
          : data.error === 'insufficient_credits'
            ? { kind: 'other', message: "You're out of credits for this video." }
            : data.error === 'plan_limit'
              ? { kind: 'other', message: data.message ?? 'Your plan does not include this.' }
              : res?.status === 401
                ? { kind: 'other', message: 'You were signed out. Log in again to continue.' }
                : { kind: 'other', message: 'The connection dropped. No credits were used.' },
      );
      return;
    }
    router.push('/gallery');
    router.refresh();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void generate();
  }

  // ⌘/Ctrl + Enter generates from anywhere in the form.
  function onFormKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void generate();
    }
  }

  // Spoken when the cost or plan state changes. One live region that is always in
  // the page, because a region that mounts with its text is often not announced.
  const notice =
    state.primary.kind === 'top-up'
      ? `Not enough credits for ${sel.durationSec}s.${
          affordableLength ? ` ${affordableLength}s fits your balance.` : ''
        }`
      : locked && state.upgradePlan
        ? state.tierLocked
          ? `Premium AI video comes with ${state.upgradePlan.name}.`
          : `${sel.durationSec}s videos come with ${state.upgradePlan.name}.`
        : '';

  const moderation = failure?.kind === 'moderation' ? failure : null;
  const otherError = failure?.kind === 'other' ? failure : null;

  const ideas = lookFor(sel.themeId).ideas;
  // Typed placeholder (B.1 motion #3): the look's ideas, one after another.
  const placeholder = useTypedWords(ideas, !sel.topic);
  function surprise() {
    const at = ideas.indexOf(sel.topic);
    update({ topic: ideas[(at + 1) % ideas.length] ?? sel.topic });
    setFailure(null);
  }

  const costLine = locked
    ? `Not on your plan yet`
    : `About ${fmt(state.estimate)} credits · you have ${fmt(balance)}`;

  // Setting pills (B.2): press-in pills on the ember box; one that differs from
  // the look's default gets a blush fill. White text is 19px bold (large, AA).
  const pill = (tinted: boolean) =>
    `press inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[19px] whitespace-nowrap ${
      tinted ? 'bg-blush text-on-blush [--press-line:#212121]' : 'bg-transparent text-white'
    }`;
  const lookDefaults = initial;
  const shownTheme = THEMES.find((t) => t.id === (peek ?? sel.themeId)) ?? theme;
  const voiceShown = voiceName(voice, sel.themeId, myVoices);
  const voiceIsDefault = voice.voiceId === null || voice.voiceId === defaultVoiceFor(sel.themeId);

  return (
    <form
      onSubmit={onSubmit}
      onKeyDown={onFormKeyDown}
      aria-busy={submitting}
      aria-labelledby="create-h"
      className="box-ember rounded-box animate-sweep-in relative flex min-h-[calc(100dvh-84px)] w-full justify-center overflow-hidden px-5 pt-8 pb-6 sm:min-h-[calc(100dvh-108px)] sm:px-6 sm:py-[72px]"
    >
      <p
        aria-hidden="true"
        className="font-poster pointer-events-none absolute bottom-[8%] left-[5%] m-0 text-[22rem] leading-[.7] text-white/[.08] uppercase select-none max-md:hidden"
      >
        New
      </p>
      <div className="relative flex w-full max-w-[680px] flex-col gap-5 sm:gap-7">
        <div className="flex flex-col items-start gap-3">
          <Badge tone="ink" className="px-3 py-1 text-[13px] tracking-[3px] uppercase">
            New video
          </Badge>
          <h1
            id="create-h"
            className="font-display m-0 text-[60px] leading-[.8] font-normal tracking-[-0.04em] sm:text-[104px]"
          >
            What&apos;s it about?
          </h1>
        </div>

        {firstRun && (
          <p className="bg-blush text-on-blush m-0 rounded-[8px] px-4 py-3 text-[15px]">
            <span className="font-semibold">Your first video is one tap away.</span> We picked an
            idea. Make it, or write your own.
          </p>
        )}

        <div className={`flex flex-col gap-2 ${submitting ? 'opacity-60' : ''}`}>
          <label htmlFor="topic" className="sr-only">
            Describe an idea
          </label>
          <textarea
            id="topic"
            name="topic"
            required
            minLength={3}
            maxLength={TOPIC_MAX_CHARS}
            rows={2}
            value={sel.topic}
            onChange={(e) => {
              update({ topic: e.target.value });
              if (failure) setFailure(null);
            }}
            placeholder={placeholder}
            aria-invalid={moderation ? true : undefined}
            aria-describedby={moderation ? 'topic-error' : undefined}
            className="field-line field-sizing-content min-h-14 w-full resize-none px-0.5 py-3 text-[28px] leading-[1.15] text-white sm:text-[40px]"
          />
          {moderation && (
            <div
              id="topic-error"
              role="alert"
              className="bg-blush flex flex-col gap-0.5 rounded-[8px] px-4 py-3 text-[#a32435]"
            >
              <span className="text-[15px] leading-5 font-semibold">{moderation.message}</span>
              <span className="text-[14px]">Try a different angle on it. Nothing was charged.</span>
            </div>
          )}
          <button
            type="button"
            onClick={surprise}
            className="inline-flex min-h-11 items-center self-start text-[19px] font-bold text-white underline underline-offset-4"
          >
            Surprise me
          </button>
        </div>

        <div
          role="group"
          aria-label="Video settings"
          className="-mr-5 flex gap-2.5 overflow-x-auto pr-5 pb-1 [--press-line:#f0e2dd] sm:mr-0 sm:flex-wrap sm:overflow-visible sm:pr-0"
        >
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setSheet('look')}
            className={pill(sel.themeId !== lookDefaults.themeId)}
          >
            <span className="font-normal">Look</span>
            <strong className="font-bold">{theme.label}</strong>
          </button>
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setSheet('length')}
            className={pill(sel.durationSec !== lookDefaults.durationSec)}
          >
            <span className="font-normal">Length</span>
            <strong className="font-bold">{sel.durationSec}s</strong>
            {state.durationLocked && <LockIcon size={16} />}
            {state.durationLocked && <span className="sr-only">(not on your plan)</span>}
          </button>
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setSheet('quality')}
            className={pill(sel.tier !== lookDefaults.tier)}
          >
            <span className="font-normal">Quality</span>
            <strong className="font-bold">{TIER_COPY[sel.tier].title}</strong>
            {state.tierLocked && <LockIcon size={16} />}
            {state.tierLocked && <span className="sr-only">(not on your plan)</span>}
          </button>
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setSheet('voice')}
            className={pill(!voiceIsDefault)}
          >
            <span className="font-normal">Voice</span>
            <strong className="font-bold">{voiceShown}</strong>
          </button>
        </div>

        <p role="status" className="sr-only">
          {notice}
        </p>

        <div className="relative mt-auto flex flex-col gap-3 sm:mt-3">
          {state.primary.kind === 'upgrade' ? (
            <Link
              href="/pricing"
              className={buttonClasses({
                size: 'xl',
                className: 'w-full [--press-line:var(--shadow-red)]',
              })}
            >
              See the {state.primary.planName} plan
            </Link>
          ) : state.primary.kind === 'top-up' ? (
            <Link
              href="/pricing"
              className={buttonClasses({
                size: 'xl',
                className: 'w-full [--press-line:var(--shadow-red)]',
              })}
            >
              Get credits
            </Link>
          ) : (
            <Button
              type="submit"
              size="xl"
              aria-disabled={!canGenerate}
              aria-keyshortcuts="Control+Enter Meta+Enter"
              className="w-full [--press-line:var(--shadow-red)]"
            >
              {submitting ? (
                <>
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden="true"
                    className="animate-spin"
                  >
                    <path d="M10 2.5a7.5 7.5 0 1 1-7.5 7.5" />
                  </svg>
                  Starting…
                </>
              ) : otherError ? (
                'Try again'
              ) : (
                'Make video'
              )}
            </Button>
          )}
          <Badge tone="ink" className="self-start px-3.5 py-2 text-[15px] font-normal tabular-nums">
            {state.primary.kind === 'generate' && !state.hasTopic
              ? 'Describe your idea to start'
              : costLine}
          </Badge>

          {locked && state.upgradePlan && (
            <div className="bg-blush text-on-blush flex flex-col gap-1 rounded-[8px] px-4 py-3">
              <span className="text-[15px] font-semibold">
                {state.upgradePlan.name} unlocks{' '}
                {state.tierLocked ? 'Premium AI video' : `${sel.durationSec}s`} ·{' '}
                {formatEuros(state.upgradePlan.priceCents)}
              </span>
              <span className="flex flex-wrap gap-x-5">
                <Link
                  href="/pricing"
                  className="inline-flex min-h-11 items-center text-[15px] font-semibold text-[#a32435] underline underline-offset-2"
                >
                  See the {state.upgradePlan.name} plan
                </Link>
                <button
                  type="button"
                  onClick={() =>
                    update(state.tierLocked ? { tier: 'standard' } : { durationSec: longestOnPlan })
                  }
                  className="inline-flex min-h-11 items-center text-[15px] font-semibold text-[#a32435] underline underline-offset-2"
                >
                  {state.tierLocked ? 'Use Standard instead' : `Use ${longestOnPlan}s instead`}
                </button>
              </span>
            </div>
          )}

          {state.primary.kind === 'top-up' && affordableLength && (
            <div className="bg-blush text-on-blush flex flex-wrap items-center gap-x-4 rounded-[8px] px-4 py-2">
              <span className="text-[15px]">Not enough credits for {sel.durationSec}s.</span>
              <button
                type="button"
                onClick={() => update({ durationSec: affordableLength })}
                className="inline-flex min-h-11 items-center text-[15px] font-semibold text-[#a32435] underline underline-offset-2"
              >
                Switch to {affordableLength}s (about{' '}
                {fmt(
                  estimateJobCredits({ targetDurationSec: affordableLength, modelTier: sel.tier }),
                )}{' '}
                credits)
              </button>
            </div>
          )}

          {otherError && (
            <div
              role="alert"
              className="bg-blush flex flex-col gap-0.5 rounded-[8px] px-4 py-3 text-[#a32435]"
            >
              <span className="text-[15px] leading-5 font-semibold">
                Couldn&apos;t start your video.
              </span>
              <span className="text-[14px]">{otherError.message}</span>
            </div>
          )}

          {freeTrial && (
            <p className="text-blush m-0 self-start rounded-[16px] bg-[#212121] px-3.5 py-2 text-[13px] leading-5">
              Trial videos carry a small &ldquo;Made with Shortcraft&rdquo; mark.{' '}
              <Link href="/pricing" className="font-semibold whitespace-nowrap underline">
                See plans
              </Link>
            </p>
          )}

          <Note
            colour="cyan"
            rotate={18}
            className="absolute top-[-10px] right-[-220px] text-[40px] max-xl:hidden"
          >
            ready in
            <br />
            about 2 min!
          </Note>
        </div>
      </div>

      <Sheet
        open={sheet === 'look'}
        onClose={closeSheet}
        title="Pick a look"
        tone="sky"
        size="wide"
      >
        <div className="flex flex-col gap-8 md:flex-row md:gap-[5%]">
          <div
            role="radiogroup"
            aria-label="Look"
            onKeyDown={(e) =>
              onRadioKeyDown(
                e,
                THEMES.map((t) => t.id),
                sel.themeId,
                (themeId) => update({ themeId }),
              )
            }
            onMouseLeave={() => setPeek(null)}
            className="flex min-w-0 flex-col md:flex-[1_1_520px]"
          >
            {THEMES.map((t) => {
              const checked = t.id === sel.themeId;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  tabIndex={checked ? 0 : -1}
                  onClick={() => update({ themeId: t.id })}
                  onMouseEnter={() => setPeek(t.id)}
                  onFocus={() => setPeek(t.id)}
                  className={`font-display flex min-h-11 items-baseline gap-3 py-1 text-left text-[44px] leading-[.75] whitespace-nowrap transition-all duration-300 sm:text-[64px] lg:text-[76px] ${
                    checked
                      ? 'font-black tracking-[-0.05em] [text-shadow:1px_1px_0_rgb(255_255_255/.8)]'
                      : 'font-extralight tracking-[-0.03em] hover:font-black'
                  }`}
                >
                  {t.label}
                  {t.id === lastThemeId && (
                    <span className="font-sans text-[13px] font-semibold tracking-[1px] uppercase">
                      Last used
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex flex-col items-center gap-4 md:flex-[0_1_340px]">
            <ColourIn className="shadow-hero w-[200px] overflow-hidden rounded-[8px] sm:w-[260px]">
              <ThemeFrame themeId={shownTheme.id} variant="phone" />
            </ColourIn>
            <p className="font-display m-0 text-[28px]">{shownTheme.label}</p>
            <p className="m-0 text-center text-[17px]">{shownTheme.blurb}</p>
            <Button size="lg" onClick={closeSheet} className="px-10">
              Done
            </Button>
          </div>
        </div>
      </Sheet>

      <Sheet open={sheet === 'length'} onClose={closeSheet} title="How long?" tone="blush">
        <div
          role="radiogroup"
          aria-label="Length"
          onKeyDown={(e) =>
            onRadioKeyDown(e, DURATIONS, sel.durationSec as (typeof DURATIONS)[number], (d) =>
              update({ durationSec: d }),
            )
          }
          className="grid grid-cols-3 gap-3 sm:grid-cols-5"
        >
          {DURATIONS.map((d) => {
            const checked = d === sel.durationSec;
            const plan = lengthLockPlan(d, maxDurationSec);
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                aria-label={plan ? `${d} seconds, needs ${plan}` : `${d} seconds`}
                onClick={() => {
                  update({ durationSec: d });
                  closeSheet();
                }}
                className={`press flex flex-col items-center gap-1 rounded-[8px] px-2 pt-4 pb-3 [--press-line:#212121] ${
                  checked ? 'text-blush bg-[#212121]' : 'bg-white/60'
                }`}
              >
                <span className="font-poster text-[64px] leading-[.8]">
                  {d}
                  <span className="text-[28px]">s</span>
                </span>
                <span className="flex items-center gap-1 text-[13px] font-semibold tabular-nums">
                  {plan ? (
                    <>
                      <LockIcon />
                      {plan}
                    </>
                  ) : (
                    `~${fmt(estimateJobCredits({ targetDurationSec: d, modelTier: sel.tier }))}`
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <p className="m-0 text-[15px]">
          Numbers under each length are its credits at this quality.
        </p>
      </Sheet>

      <Sheet open={sheet === 'quality'} onClose={closeSheet} title="Quality" tone="blush">
        <div
          role="radiogroup"
          aria-label="Quality"
          onKeyDown={(e) => onRadioKeyDown(e, TIERS, sel.tier, (tier) => update({ tier }))}
          className="grid gap-5 p-1 sm:grid-cols-2"
        >
          {TIERS.map((tier) => {
            const checked = tier === sel.tier;
            const copy = TIER_COPY[tier];
            const tierLocked = !allowedTiers.includes(tier);
            const cost = estimateJobCredits({
              targetDurationSec: sel.durationSec,
              modelTier: tier,
            });
            const premium = tier === 'premium';
            return (
              <button
                key={tier}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                onClick={() => {
                  update({ tier });
                  closeSheet();
                }}
                className={`${premium ? 'box-ember rotate-1' : '-rotate-1 bg-white text-[#212121]'} rounded-box flex flex-col gap-3 p-6 text-left transition-transform hover:translate-x-0.5 hover:translate-y-0.5 ${
                  checked ? 'outline-[3px] outline-offset-4 outline-[#212121] outline-solid' : ''
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className="font-display text-[40px] leading-none font-light">
                    {copy.title}
                  </span>
                  {tierLocked && (
                    <Badge tone="ink" className="gap-1 text-[13px]">
                      <LockIcon size={12} />
                      {tierLockPlan(tier)}
                    </Badge>
                  )}
                </span>
                <span className="flex flex-col gap-1 rounded-[8px] bg-[#212121] px-3 py-2.5 text-[15px] text-[#f0e2dd]">
                  {copy.desc}
                  <span className="text-[#bdbdbd] tabular-nums">
                    About {fmt(cost)} credits for {sel.durationSec}s
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </Sheet>

      <Sheet
        open={sheet === 'voice'}
        onClose={closeSheet}
        title="Pick a voice"
        tone="sky"
        size="wide"
      >
        <VoicePicker
          voiceId={effectiveVoice(voice, sel.themeId)}
          lookPick={defaultVoiceFor(sel.themeId)}
          mine={myVoices}
          createHref="/voices/new"
          speed={voice.speed}
          delivery={voice.delivery}
          playing={preview.playing}
          loading={preview.loading}
          note={preview.note}
          onPlay={(id) => void preview.toggleVoice(id, sel.themeId)}
          onVoice={(voiceId) => setVoice((v) => ({ ...v, voiceId }))}
          onSpeed={(speed) => setVoice((v) => ({ ...v, speed }))}
          onDelivery={(delivery) => setVoice((v) => ({ ...v, delivery }))}
        />
        <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-center text-[15px] sm:text-left">
            Included in every video. No extra credits.
          </span>
          <Button size="lg" onClick={closeSheet} className="sm:px-10">
            Done
          </Button>
        </div>
      </Sheet>
    </form>
  );
}
