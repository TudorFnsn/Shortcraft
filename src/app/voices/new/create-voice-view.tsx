'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, buttonClasses } from '@/components/ui/button';
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
 * Create a voice (Voice Studio V4): describe a narrator, hear 3 designed
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
      className="text-ink-muted hover:text-ink inline-flex min-h-11 items-center gap-1.5 self-start text-[15px]"
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

  const error = failure && (
    <div role="alert" className="bg-surface rounded-card flex flex-col gap-1 px-4 py-3">
      <span className="text-danger text-[15px] font-semibold">{failure.message}</span>
      {failure.topUp && (
        <Link href="/pricing" className="text-ember-ink text-sm font-semibold underline">
          Get more credits
        </Link>
      )}
    </div>
  );

  if (saved) {
    return (
      <div className="flex flex-col gap-6">
        {back}
        <div className="bg-surface rounded-card flex flex-col items-start gap-4 px-6 py-8">
          <h1 className="font-display text-[28px] leading-8 font-bold">{saved.name} is saved</h1>
          <p className="text-ink-muted text-[15px] leading-[22px]">
            It&apos;s at the top of the Voice sheet on Create and in Edit voiceover, for every
            video, at no extra cost.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/create?voice=${encodeURIComponent(saved.id)}`}
              className={buttonClasses({ size: 'lg', className: 'rounded-full' })}
            >
              Make a video with it
            </Link>
            <Link
              href="/voices"
              className={buttonClasses({ variant: 'secondary', className: 'rounded-full' })}
            >
              My voices
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (slots.atLimit) {
    return (
      <div className="flex flex-col gap-6">
        {back}
        <h1 className="font-display text-[32px] leading-9 font-bold sm:text-[40px] sm:leading-[44px]">
          Create a voice
        </h1>
        <div className="bg-ember-soft rounded-card flex flex-col gap-3 px-5 py-4">
          <p className="text-ink text-[15px] leading-[22px]">
            All your voice slots are in use. Delete one in My voices to make room
            {slots.more ? `, or move to ${slots.more.name} for ${slots.more.limit}.` : '.'}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/voices"
              className={buttonClasses({ variant: 'secondary', className: 'rounded-full' })}
            >
              My voices
            </Link>
            {slots.more && (
              <Link href="/pricing" className={buttonClasses({ className: 'rounded-full' })}>
                See {slots.more.name}
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!round) {
    return (
      <form
        className="flex flex-col gap-6"
        aria-busy={working === 'design'}
        onSubmit={(e) => {
          e.preventDefault();
          void design();
        }}
      >
        {back}
        <h1 className="font-display text-[32px] leading-9 font-bold sm:text-[40px] sm:leading-[44px]">
          Describe the voice you want
        </h1>
        <div className="flex flex-col gap-2">
          <label htmlFor="voice-description" className="text-ink-muted text-sm font-semibold">
            Age, accent, pace, mood
          </label>
          <textarea
            id="voice-description"
            rows={4}
            maxLength={DESCRIPTION_MAX}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. late-night radio host, low and smooth, slow, a little smoky"
            aria-describedby="voice-description-hint"
            className="bg-surface text-ink placeholder:text-ink-muted w-full resize-none rounded-[18px] px-4 py-3.5 text-[17px] leading-6 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ember)]"
          />
          <span id="voice-description-hint" className="text-ink-muted text-[13px]">
            {descLength < DESCRIPTION_MIN
              ? `At least ${DESCRIPTION_MIN} characters. Describe a type of voice, not a real person.`
              : `${descLength} / ${DESCRIPTION_MAX} characters. Describe a type of voice, not a real person.`}
          </span>
        </div>
        <div className="flex flex-col gap-2.5">
          <span className="text-ink-muted text-sm font-semibold">Or start from</span>
          <div className="flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setDescription(s)}
                className="bg-raised hover:bg-line text-ink min-h-11 rounded-full px-4 text-left text-sm font-medium transition-colors"
              >
                {s.split(',')[0]}
              </button>
            ))}
          </div>
        </div>

        {error}

        <div className="flex flex-col items-center gap-1.5 sm:items-start">
          <Button
            type="submit"
            size="lg"
            aria-disabled={!canDesign}
            className={`w-full rounded-full sm:w-auto sm:px-8 ${
              !canDesign && working === null ? '!bg-raised !text-ink-muted !opacity-100' : ''
            }`}
          >
            {working === 'design' ? 'Making 3 samples…' : 'Hear 3 samples'}
          </Button>
          <span role="status" className="text-ink-muted text-[13px] tabular-nums sm:text-sm">
            {working === 'design'
              ? 'This takes a few seconds.'
              : left < prices.designRound
                ? `${fmt(prices.designRound)} credits · short by ${fmt(prices.designRound - left)}`
                : `${fmt(prices.designRound)} credits · you have ${fmt(left)}`}
          </span>
        </div>
      </form>
    );
  }

  const ids = round.samples.map((_, i) => i);
  return (
    <form
      className="flex flex-col gap-6"
      aria-busy={working !== null}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {back}
      <h1 className="font-display text-[32px] leading-9 font-bold sm:text-[40px] sm:leading-[44px]">
        Create a voice
      </h1>

      <div className="bg-surface rounded-card flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-ink-muted text-[13px] font-semibold">You asked for</span>
          <span className="text-[17px] leading-6">{asked}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            preview.stop();
            setRound(null);
            setFailure(null);
          }}
          className="bg-raised hover:bg-line min-h-11 shrink-0 rounded-full px-4 text-[15px] font-semibold transition-colors"
        >
          Change · {fmt(prices.designRound)} credits
        </button>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-[20px] font-bold">Pick the one that sounds right</legend>
        <div
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
                className={`flex items-center gap-3 rounded-[20px] p-4 transition-colors sm:flex-col sm:items-start ${
                  checked ? 'bg-ember-soft ring-ember ring-2' : 'bg-surface'
                }`}
              >
                <button
                  type="button"
                  onClick={() => preview.toggle(key, s.audioDataUrl)}
                  aria-label={`${playing ? 'Stop' : 'Play'} sample ${i + 1}`}
                  aria-pressed={playing}
                  className={`flex size-[52px] shrink-0 items-center justify-center rounded-full transition-colors ${
                    playing ? 'bg-ember text-on-ember' : 'bg-raised text-ink hover:bg-line'
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
                  className="min-h-11 flex-1 text-left text-base font-semibold sm:w-full"
                >
                  Sample {i + 1}
                  {checked && (
                    <span className="text-ember-ink ml-2 text-[13px] font-semibold">Picked</span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor="voice-name" className="text-sm font-semibold">
          Name it
        </label>
        <input
          id="voice-name"
          maxLength={NAME_MAX}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Late-night radio"
          className="bg-surface text-ink placeholder:text-ink-muted min-h-[52px] rounded-[14px] px-4 text-[17px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ember)]"
        />
      </div>

      {error}

      <div className="flex flex-col items-center gap-1.5 sm:items-start">
        <Button
          type="submit"
          size="lg"
          aria-disabled={!canSave}
          className={`w-full rounded-full sm:w-auto sm:px-8 ${
            !canSave && working === null ? '!bg-raised !text-ink-muted !opacity-100' : ''
          }`}
        >
          {working === 'save' ? 'Saving…' : 'Save voice'}
        </Button>
        <span role="status" className="text-ink-muted text-[13px] sm:text-sm">
          {fmt(prices.save)} credits, once. Then use it in every video at no extra cost. You&apos;ll
          have {slots.used + 1} of {slots.limit} voices.
        </span>
      </div>
    </form>
  );
}
