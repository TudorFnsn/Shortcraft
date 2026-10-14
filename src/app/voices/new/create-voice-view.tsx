'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SplitLines } from '@/components/motion/split-lines';
import { StepReveal } from '@/components/motion/step-reveal';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClasses } from '@/components/ui/button';
import { Note } from '@/components/ui/note';
import { onRadioKeyDown } from '@/components/ui/radio-keys';
import { useVoicePreview } from '@/components/voice/use-voice-preview';
import type { Slots } from '../slots';

const fmt = (n: number) => n.toLocaleString('en-US');
const DESCRIPTION_MIN = 20;
const DESCRIPTION_MAX = 500;
const NAME_MAX = 40;

const STARTERS = [
  'Older British storyteller, warm and slow, a little gravelly',
  'Excited sports commentator, fast and punchy, big energy',
  'Whispery late-night horror host, low and calm, slightly eerie',
  'Friendly science teacher, clear and upbeat, mid-paced',
];

type Round = { roundId: string; samples: { audioDataUrl: string }[] };
type Failure = { message: string; topUp?: boolean } | null;

function failureFrom(status: number | undefined, data: { error?: string; message?: string }) {
  if (data.error === 'insufficient_credits')
    return { message: "You're out of credits for this.", topUp: true };
  if (status === 401) return { message: 'You were signed out. Log in again to continue.' };
  return { message: data.message ?? 'Something went wrong. No credits were used.' };
}

function PlayIcon({ playing }: { playing: boolean }) {
  return playing ? (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="5" y="5" width="10" height="10" rx="2" fill="currentColor" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M7 4.5l9 5.5-9 5.5z" fill="currentColor" />
    </svg>
  );
}

/**
 * Create a voice (Voice Studio V4; Boxes board Voices): the ember box, in two
 * steps that pop in. Describe a narrator, hear 3 designed
 * samples, keep one under a name. Each round of samples and the save are
 * charged (and refunded if the provider fails); the prices sit next to the
 * buttons that spend them.
 */
export function CreateVoiceView({
  slots,
  balance,
  prices,
}: {
  slots: Slots;
  balance: number;
  prices: { designRound: number; save: number };
}) {
  const router = useRouter();
  const preview = useVoicePreview();
  const [description, setDescription] = useState('');
  const [round, setRound] = useState<Round | null>(null);
  const [asked, setAsked] = useState('');
  const [picked, setPicked] = useState(0);
  const [name, setName] = useState('');
  const [working, setWorking] = useState<'design' | 'save' | null>(null);
  const [failure, setFailure] = useState<Failure>(null);
  const [saved, setSaved] = useState<{ id: string; name: string } | null>(null);
  const [spent, setSpent] = useState(0);

  const left = balance - spent;
  const descLength = description.trim().length;
  const canDesign =
    !slots.atLimit &&
    descLength >= DESCRIPTION_MIN &&
    descLength <= DESCRIPTION_MAX &&
    working === null &&
    left >= prices.designRound;
  const canSave = round !== null && name.trim().length > 0 && working === null;

  async function design() {
    if (!canDesign) return;
    preview.stop();
    setWorking('design');
    setFailure(null);
    const res = await fetch('/api/voices/design', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: description.trim() }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setWorking(null);
    if (!res?.ok || !Array.isArray(data.samples)) {
      setFailure(failureFrom(res?.status, data));
      return;
    }
    setSpent((s) => s + (typeof data.credits === 'number' ? data.credits : prices.designRound));
    setRound({ roundId: data.roundId, samples: data.samples });
    setAsked(description.trim());
    setPicked(0);
  }

  async function save() {
    if (!canSave || !round) return;
    preview.stop();
    setWorking('save');
    setFailure(null);
    const res = await fetch('/api/voices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roundId: round.roundId, sample: picked, name: name.trim() }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setWorking(null);
    if (!res?.ok || !data.voice) {
      setFailure(failureFrom(res?.status, data));
      return;
    }
    setSaved({ id: data.voice.id, name: data.voice.name });
    router.refresh();
  }

  const back = (
    <Link
      href="/voices"
      className="press text-ink inline-flex min-h-11 items-center gap-1.5 self-start rounded-[8px] px-3 text-[14px] font-semibold tracking-[1px] uppercase"
    >
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
        <path d="M12.5 4.5L7 10l5.5 5.5" />
      </svg>
      My voices · {slots.line}
    </Link>
  );

  /** On the ember box: small text sits in the dark pill (AA). */
  const pill = 'text-blush m-0 self-start rounded-[16px] bg-[#212121] px-3.5 py-2 text-[15px]';
  const box = (children: React.ReactNode, labelledBy: string, extra?: React.ReactNode) => (
    <>
      {back}
      <section
        aria-labelledby={labelledBy}
        className="box-ember rounded-box animate-sweep-in relative flex flex-col gap-5 overflow-hidden px-5 py-8 sm:gap-6 sm:p-12"
      >
        <div className="relative mx-auto flex w-full max-w-[760px] flex-col gap-5 sm:gap-6">
          {children}
        </div>
        {extra}
      </section>
    </>
  );
  const heading = (id: string, text: string, step?: string) => (
    <div className="flex flex-col items-start gap-3">
      {step && (
        <Badge tone="ink" className="px-3 py-1 text-[13px] tracking-[3px] uppercase">
          {step}
        </Badge>
      )}
      <SplitLines
        as="h1"
        id={id}
        className="font-display m-0 text-[52px] leading-[.85] font-normal tracking-[-0.04em] sm:text-[96px] sm:leading-[.8]"
      >
        {text}
      </SplitLines>
    </div>
  );

  const error = failure && (
    <div
      role="alert"
      className="bg-blush flex flex-col gap-1 rounded-[8px] px-4 py-3 text-[#a32435]"
    >
      <span className="text-[15px] font-semibold">{failure.message}</span>
      {failure.topUp && (
        <Link href="/pricing" className="text-[15px] font-semibold underline">
          Get more credits
        </Link>
      )}
    </div>
  );

  if (saved) {
    return box(
      <>
        {heading('cv-h', `${saved.name} is saved`)}
        <p className="m-0 max-w-[32ch] text-[24px] leading-[1.3] font-light">
          It&apos;s at the top of the Voice sheet on Create and in Edit voiceover, for every video,
          at no extra cost.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/create?voice=${encodeURIComponent(saved.id)}`}
            className={buttonClasses({ size: 'xl', className: '[--press-line:var(--shadow-red)]' })}
          >
            Make a video with it
          </Link>
          <Link
            href="/voices"
            className="press inline-flex min-h-[64px] items-center rounded-[8px] px-6 text-[19px] font-bold text-white [--press-line:#f0e2dd]"
          >
            My voices
          </Link>
        </div>
      </>,
      'cv-h',
    );
  }

  if (slots.atLimit) {
    return box(
      <>
        {heading('cv-h', 'Create a voice')}
        <p className="m-0 max-w-[32ch] text-[24px] leading-[1.3] font-light">
          All your voice slots are in use. Delete one in My voices to make room
          {slots.more ? `, or move to ${slots.more.name} for ${slots.more.limit}.` : '.'}
        </p>
        <div className="flex flex-wrap gap-3">
          {slots.more && (
            <Link href="/pricing" className={buttonClasses({ size: 'lg' })}>
              See {slots.more.name}
            </Link>
          )}
          <Link
            href="/voices"
            className="press inline-flex min-h-[54px] items-center rounded-[8px] px-6 text-[19px] font-bold text-white [--press-line:#f0e2dd]"
          >
            My voices
          </Link>
        </div>
      </>,
      'cv-h',
    );
  }

  if (!round) {
    return box(
      <form
        className="flex flex-col gap-5 sm:gap-6"
        aria-busy={working === 'design'}
        onSubmit={(e) => {
          e.preventDefault();
          void design();
        }}
      >
        {heading('cv-h', 'Describe a voice', 'Step 1 of 2')}
        <div className="flex flex-col gap-2">
          <label htmlFor="voice-description" className="text-[19px] font-bold">
            Age, accent, pace, mood
          </label>
          <textarea
            id="voice-description"
            rows={2}
            maxLength={DESCRIPTION_MAX}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="late-night radio host, low and smooth, slow, a little smoky"
            aria-describedby="voice-description-hint"
            className="field-line field-sizing-content min-h-14 w-full resize-none px-0.5 py-2 text-[26px] leading-[1.2] text-white sm:text-[34px]"
          />
          <span id="voice-description-hint" className={pill}>
            {descLength < DESCRIPTION_MIN
              ? `At least ${DESCRIPTION_MIN} characters. Describe a type of voice, not a real person.`
              : `${descLength} / ${DESCRIPTION_MAX} characters. Describe a type of voice, not a real person.`}
          </span>
        </div>
        <div className="flex flex-col gap-2.5">
          <span className="text-[19px] font-bold">Or start from</span>
          <div className="flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setDescription(s)}
                className="bg-blush text-on-blush press min-h-11 rounded-full px-4 text-left text-[15px] font-semibold [--press-line:#212121]"
              >
                {s.split(',')[0]}
              </button>
            ))}
          </div>
        </div>

        {error}

        <div className="mt-2 flex flex-col gap-3">
          <Button
            type="submit"
            size="xl"
            aria-disabled={!canDesign}
            className={`w-full [--press-line:var(--shadow-red)] ${
              !canDesign && working === null ? 'opacity-60' : ''
            }`}
          >
            {working === 'design'
              ? 'Making 3 samples…'
              : `Hear 3 samples · ${fmt(prices.designRound)} credits`}
          </Button>
          <span role="status" className={`${pill} tabular-nums`}>
            {working === 'design'
              ? 'This takes a few seconds.'
              : left < prices.designRound
                ? `${fmt(prices.designRound)} credits · short by ${fmt(prices.designRound - left)}`
                : `${fmt(prices.designRound)} credits · you have ${fmt(left)}`}
          </span>
        </div>
      </form>,
      'cv-h',
    );
  }

  const ids = round.samples.map((_, i) => i);
  return box(
    <form
      className="flex flex-col gap-5 sm:gap-6"
      aria-busy={working !== null}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {heading('cv-h', 'Pick a voice', 'Step 2 of 2')}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="m-0 text-[24px] leading-[1.25] font-light">
          You asked for: <span className="font-display">{asked}</span>
        </p>
        <button
          type="button"
          onClick={() => {
            preview.stop();
            setRound(null);
            setFailure(null);
          }}
          className="press inline-flex min-h-11 items-center rounded-[8px] px-3 text-[19px] font-bold text-white [--press-line:#f0e2dd]"
        >
          Change · {fmt(prices.designRound)} credits
        </button>
      </div>

      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
        <legend className="sr-only">Pick the one that sounds right</legend>
        <StepReveal
          as="div"
          role="radiogroup"
          aria-label="Samples"
          onKeyDown={(e) => {
            if ((e.target as HTMLElement).getAttribute('role') !== 'radio') return;
            onRadioKeyDown(e, ids, picked, setPicked);
          }}
          className="grid gap-3 sm:grid-cols-3"
        >
          {round.samples.map((s, i) => {
            const checked = picked === i;
            const key = `sample-${i}`;
            const playing = preview.playing === key;
            return (
              <div
                key={key}
                className={`flex items-center gap-3 rounded-[8px] p-4 transition-transform sm:flex-col sm:items-start ${
                  checked
                    ? 'bg-blush -rotate-[1.5deg] text-[#212121] shadow-[14px_14px_30px_rgb(0_0_0/.3)]'
                    : 'press bg-transparent [--press-line:#f0e2dd]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => preview.toggle(key, s.audioDataUrl)}
                  aria-label={`${playing ? 'Stop' : 'Play'} sample ${i + 1}`}
                  aria-pressed={playing}
                  className={`flex size-[52px] shrink-0 items-center justify-center rounded-full ${
                    playing ? 'bg-blush ring-2 ring-[#212121]' : 'text-blush bg-[#212121]'
                  }`}
                >
                  <PlayIcon playing={playing} />
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  tabIndex={checked ? 0 : -1}
                  onClick={() => setPicked(i)}
                  className="font-display min-h-11 flex-1 text-left text-[24px] sm:w-full"
                >
                  Sample {i + 1}
                  {checked && (
                    <span className="ml-2 font-sans text-[13px] font-semibold tracking-[1px] uppercase">
                      Picked
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </StepReveal>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor="voice-name" className="text-[19px] font-bold">
          Name it
        </label>
        <input
          id="voice-name"
          maxLength={NAME_MAX}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Late-night radio"
          className="field-line min-h-[52px] px-0.5 text-[28px] text-white sm:text-[34px]"
        />
      </div>

      {error}

      <div className="mt-2 flex flex-col gap-3">
        <Button
          type="submit"
          size="xl"
          aria-disabled={!canSave}
          className={`w-full [--press-line:var(--shadow-red)] ${
            !canSave && working === null ? 'opacity-60' : ''
          }`}
        >
          {working === 'save' ? 'Saving…' : 'Save voice'}
        </Button>
        <span role="status" className={pill}>
          {fmt(prices.save)} credits, once. Then use it in every video at no extra cost. You&apos;ll
          have {slots.used + 1} of {slots.limit} voices.
        </span>
      </div>
    </form>,
    'cv-h',
    <Note colour="cyan" rotate={16} className="absolute top-14 right-10 text-[36px] max-lg:hidden">
      sounds right!
    </Note>,
  );
}
