'use client';

import { useMemo, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { THEMES } from '@/config/themes';
import type { ModelTier } from '@/config/models';
import { estimateJobCredits } from '@/features/render/pricing';
import { lookFor } from '@/components/ideas';
import { ThemeFrame } from '@/components/theme-frame';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClasses } from '@/components/ui/button';
import { onRadioKeyDown } from '@/components/ui/radio-keys';
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

// ⌘ on Apple devices, Ctrl elsewhere. The server render says Ctrl.
const noopSubscribe = () => () => {};
const useModKey = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'),
    () => 'Ctrl',
  );

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

function AlertIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
      className="text-danger mt-0.5 shrink-0"
    >
      <circle cx="10" cy="10" r="8" />
      <path d="M10 6v4.5M10 13.5v.01" />
    </svg>
  );
}

export function CreateForm({
  initial,
  firstRun,
  lastThemeId,
  balance,
  maxDurationSec,
  allowedTiers,
  freeTrial,
}: {
  initial: Selection;
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
  const modKey = useModKey();
  const [sel, setSel] = useState<Selection>(initial);
  const [failure, setFailure] = useState<Failure>(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (patch: Partial<Selection>) => setSel((s) => ({ ...s, ...patch }));

  // Live estimate, plan check and affordability: no surprise paywall.
  const state = useMemo(
    () => composerState(sel, { balance, maxDurationSec, allowedTiers }),
    [sel, balance, maxDurationSec, allowedTiers],
  );
  const theme = THEMES.find((t) => t.id === sel.themeId) ?? THEMES[0]!;
  const locked = state.durationLocked || state.tierLocked;
  const canGenerate = state.primary.kind === 'generate' && state.primary.enabled && !submitting;
  const pct = locked ? 0 : Math.min(100, Math.round((state.estimate / Math.max(balance, 1)) * 100));

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

  const moderation = failure?.kind === 'moderation' ? failure : null;
  const otherError = failure?.kind === 'other' ? failure : null;

  return (
    <form
      onSubmit={onSubmit}
      onKeyDown={onFormKeyDown}
      aria-busy={submitting}
      className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px] xl:gap-12"
    >
      <div className={`flex min-w-0 flex-col gap-8 ${submitting ? 'opacity-60' : ''}`}>
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[36px] leading-10 font-bold tracking-[-0.02em]">
            What&apos;s your video about?
          </h1>
          <p className="text-ink-muted">
            Describe an idea. We write it, voice it and cut it into a vertical video.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {firstRun && (
            <p className="bg-ember-soft text-ink rounded-card px-4 py-3 text-sm">
              <span className="font-semibold">Your first video is one tap away.</span> We picked an
              idea to start. Press Generate, or write your own.
            </p>
          )}

          <div
            className={`bg-surface rounded-card flex flex-col gap-2 border px-5 pt-4 pb-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--ember)] ${
              moderation ? 'border-danger border-2' : 'border-line'
            }`}
          >
            <label
              htmlFor="topic"
              className="text-ink-muted text-[13px] leading-[18px] font-medium"
            >
              Your idea
            </label>
            <textarea
              id="topic"
              name="topic"
              required
              minLength={3}
              maxLength={300}
              rows={3}
              value={sel.topic}
              onChange={(e) => {
                update({ topic: e.target.value });
                if (failure) setFailure(null);
              }}
              placeholder={`e.g. ${lookFor(sel.themeId).ideas[0]?.toLowerCase() ?? ''}`}
              aria-invalid={moderation ? true : undefined}
              aria-describedby={moderation ? 'topic-help topic-error' : 'topic-help'}
              className="text-ink placeholder:text-ink-muted w-full resize-none bg-transparent text-[19px] leading-[27px] outline-none"
            />
            <div className="text-ink-muted flex items-center justify-between gap-3 text-[13px] leading-[18px]">
              <span id="topic-help">A topic, a twist and a tone work best.</span>
              <span className="hidden items-center gap-1.5 sm:flex">
                <kbd className="bg-raised border-line text-ink rounded-md border px-1.5 py-0.5 font-sans text-xs font-semibold">
                  {modKey}
                </kbd>
                <kbd className="bg-raised border-line text-ink rounded-md border px-1.5 py-0.5 font-sans text-xs font-semibold">
                  Enter
                </kbd>
                to generate
              </span>
            </div>
          </div>

          {moderation && (
            <div
              id="topic-error"
              role="alert"
              className="bg-surface border-line rounded-card flex items-start gap-2.5 border px-4 py-3"
            >
              <AlertIcon />
              <div className="flex flex-col gap-0.5">
                <span className="text-danger text-[15px] leading-5 font-semibold">
                  {moderation.message}
                </span>
                <span className="text-ink-muted text-sm">
                  Try a different angle on it. Nothing was charged.
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ink-muted mr-1 text-sm">Ideas for {theme.label}:</span>
            {lookFor(sel.themeId)
              .ideas.slice(0, 3)
              .map((idea) => (
                <button
                  key={idea}
                  type="button"
                  onClick={() => {
                    update({ topic: idea });
                    setFailure(null);
                  }}
                  className="border-line-strong text-ink hover:bg-raised min-h-9 rounded-full border px-3.5 py-1.5 text-sm transition-colors"
                >
                  {idea}
                </button>
              ))}
          </div>
        </div>

        <section aria-labelledby="theme-h" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="theme-h" className="text-[15px] leading-5 font-semibold">
              Theme
            </h2>
            <span className="text-ink-muted hidden text-[13px] sm:inline">
              Sets the script style, the look and the voice.
            </span>
          </div>
          <div
            role="radiogroup"
            aria-labelledby="theme-h"
            onKeyDown={(e) =>
              onRadioKeyDown(
                e,
                THEMES.map((t) => t.id),
                sel.themeId,
                (themeId) => update({ themeId }),
              )
            }
            className="grid grid-cols-2 gap-3 sm:grid-cols-4"
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
                  className={`bg-surface rounded-card flex flex-col gap-2.5 border-2 p-1.5 pb-3 text-left transition-shadow ${
                    checked
                      ? 'border-ember shadow-selected'
                      : 'border-line hover:border-line-strong'
                  }`}
                >
                  <span className="relative block">
                    <ThemeFrame themeId={t.id} variant="card" />
                    {t.id === lastThemeId && (
                      <span className="absolute top-2 left-2 rounded-full bg-[rgb(20_16_13/0.62)] px-2 py-0.5 text-xs font-semibold text-white">
                        Last used
                      </span>
                    )}
                  </span>
                  <span className="flex flex-col gap-0.5 px-1.5">
                    <span className="text-[15px] leading-5 font-semibold">{t.label}</span>
                    <span className="text-ink-muted text-[13px] leading-[18px]">{t.blurb}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="len-h" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="len-h" className="text-[15px] leading-5 font-semibold">
              Length
            </h2>
            <span className="text-ink-muted text-[13px]">
              Your plan covers up to {maxDurationSec}s.
            </span>
          </div>
          <div
            role="radiogroup"
            aria-labelledby="len-h"
            onKeyDown={(e) =>
              onRadioKeyDown(e, DURATIONS, sel.durationSec as (typeof DURATIONS)[number], (d) =>
                update({ durationSec: d }),
              )
            }
            className="bg-raised flex gap-1 rounded-full p-1"
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
                  onClick={() => update({ durationSec: d })}
                  className={`text-ink flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-[15px] font-semibold transition-colors ${
                    checked ? 'bg-surface shadow-sm' : 'hover:bg-surface/60'
                  }`}
                >
                  {d}s
                  {plan && (
                    <span className="text-ink-muted hidden items-center gap-1 text-xs sm:flex">
                      <LockIcon />
                      {plan}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="q-h" className="flex flex-col gap-3">
          <h2 id="q-h" className="text-[15px] leading-5 font-semibold">
            Quality
          </h2>
          <div
            role="radiogroup"
            aria-labelledby="q-h"
            onKeyDown={(e) => onRadioKeyDown(e, TIERS, sel.tier, (tier) => update({ tier }))}
            className="grid gap-3 sm:grid-cols-2"
          >
            {TIERS.map((tier) => {
              const checked = tier === sel.tier;
              const copy = TIER_COPY[tier];
              const tierLocked = !allowedTiers.includes(tier);
              const cost = estimateJobCredits({
                targetDurationSec: sel.durationSec,
                modelTier: tier,
              });
              return (
                <button
                  key={tier}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  tabIndex={checked ? 0 : -1}
                  onClick={() => update({ tier })}
                  className={`bg-surface rounded-card flex items-start gap-3 border-2 p-4 text-left transition-shadow ${
                    checked
                      ? 'border-ember shadow-selected'
                      : 'border-line hover:border-line-strong'
                  }`}
                >
                  <span className="bg-raised text-ink flex size-10 shrink-0 items-center justify-center rounded-xl">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d={copy.icon} />
                    </svg>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2 text-[15px] leading-5 font-semibold">
                      {copy.title}
                      {tierLocked && (
                        <Badge className="gap-1">
                          <LockIcon size={12} />
                          {tierLockPlan(tier)}
                        </Badge>
                      )}
                    </span>
                    <span className="text-ink-muted text-sm">{copy.desc}</span>
                    <span className="text-ink-muted text-[13px] tabular-nums">
                      ~{fmt(cost)} credits for {sel.durationSec}s
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <aside
        aria-label="Preview and generate"
        className="bg-surface border-line rounded-panel flex flex-col gap-5 border p-6 lg:sticky lg:top-6"
      >
        <div className="flex flex-col items-center gap-2.5">
          <div className="relative w-[216px] overflow-hidden rounded-[28px] border-[6px] border-[#221c17] xl:w-[248px] dark:border-[#0d0b09]">
            <ThemeFrame themeId={sel.themeId} variant="phone" />
            <span className="absolute top-3 left-3 rounded-full bg-[rgb(20_16_13/0.55)] px-2 py-0.5 text-[11px] leading-4 font-semibold text-white">
              AI-generated
            </span>
            {freeTrial && (
              <span className="absolute right-2.5 bottom-2.5 rounded-md bg-[rgb(20_16_13/0.45)] px-1.5 py-0.5 text-[10px] leading-[14px] font-semibold text-white">
                Made with Shortcraft
              </span>
            )}
          </div>
          <span className="text-ink-muted text-center text-[13px] leading-[18px]">
            A sample of the {theme.label} look. Your video gets its own scenes.
          </span>
        </div>

        <ul aria-label="Your choices" className="flex flex-wrap justify-center gap-2 text-[13px]">
          <li className="bg-raised rounded-full px-2.5 py-1">{theme.label}</li>
          <li className="bg-raised rounded-full px-2.5 py-1">{sel.durationSec}s</li>
          <li className="bg-raised rounded-full px-2.5 py-1">{TIER_COPY[sel.tier].title}</li>
        </ul>

        <div className="bg-paper rounded-card flex flex-col gap-2.5 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-ink-muted text-sm">
              {submitting ? 'Holding for this video' : 'This video'}
            </span>
            <span
              className={`text-[15px] font-semibold tabular-nums ${
                !locked && !state.affordable ? 'text-danger' : 'text-ink'
              }`}
            >
              ~{fmt(state.estimate)} credits
            </span>
          </div>
          <div
            role="meter"
            aria-label="Cost against your balance"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-valuetext={`About ${fmt(state.estimate)} of your ${fmt(balance)} credits`}
            className="bg-raised h-2 overflow-hidden rounded-full"
          >
            <div
              className={`h-full rounded-full transition-[width] ${
                !locked && !state.affordable ? 'bg-danger' : 'bg-ember'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="text-ink-muted flex items-baseline justify-between gap-2 text-[13px]">
            <span>You have {fmt(balance)}</span>
            <span className="tabular-nums">
              {locked
                ? 'Not on your plan yet'
                : state.affordable
                  ? `~${fmt(balance - state.estimate)} left after`
                  : `Short by ~${fmt(state.estimate - balance)}`}
            </span>
          </div>
          {!locked && state.affordable && (
            <span className="text-ink-muted text-[13px]">
              An upper bound: you only pay for what the video uses.
            </span>
          )}
        </div>

        {state.primary.kind === 'top-up' && (
          <div role="status" className="flex flex-col gap-2.5">
            <span className="text-danger text-[15px] leading-5 font-semibold">
              Not enough credits for {sel.durationSec}s.
            </span>
            {affordableLength ? (
              <>
                <span className="text-ink-muted text-sm">
                  Pick {affordableLength}s (~
                  {fmt(
                    estimateJobCredits({
                      targetDurationSec: affordableLength,
                      modelTier: sel.tier,
                    }),
                  )}{' '}
                  credits) or get more.
                </span>
                <Button
                  variant="secondary"
                  className="self-start"
                  onClick={() => update({ durationSec: affordableLength })}
                >
                  Switch to {affordableLength}s
                </Button>
              </>
            ) : (
              <span className="text-ink-muted text-sm">Get more credits to make this video.</span>
            )}
          </div>
        )}

        {locked && state.upgradePlan && (
          <div role="status" className="bg-ember-soft rounded-card flex flex-col gap-2.5 p-4">
            <span className="text-ink text-[15px] leading-5 font-semibold">
              {state.tierLocked
                ? `Premium AI video comes with ${state.upgradePlan.name}`
                : `${sel.durationSec}s videos come with ${state.upgradePlan.name}`}
            </span>
            <span className="text-ink text-sm">
              {state.tierLocked ? 'Real motion in every scene. ' : ''}
              {state.upgradePlan.name} is {formatEuros(state.upgradePlan.priceCents)} a month with{' '}
              {fmt(state.upgradePlan.monthlyCredits)} credits.
            </span>
            <button
              type="button"
              onClick={() =>
                update(state.tierLocked ? { tier: 'standard' } : { durationSec: longestOnPlan })
              }
              className="text-ember-ink self-start text-sm font-semibold underline underline-offset-2"
            >
              {state.tierLocked ? 'Use Standard instead' : `Use ${longestOnPlan}s instead`}
            </button>
          </div>
        )}

        {otherError && (
          <div role="alert" className="bg-raised rounded-card flex items-start gap-2.5 px-4 py-3">
            <AlertIcon />
            <div className="flex flex-col gap-0.5">
              <span className="text-[15px] leading-5 font-semibold">
                Couldn&apos;t start your video.
              </span>
              <span className="text-ink-muted text-sm">{otherError.message}</span>
            </div>
          </div>
        )}

        {state.primary.kind === 'generate' && !state.hasTopic && (
          <span className="text-ink-muted text-center text-sm">Describe your idea to start.</span>
        )}

        {state.primary.kind === 'upgrade' ? (
          <Link href="/pricing" className={buttonClasses({ size: 'lg' })}>
            See the {state.primary.planName} plan
          </Link>
        ) : state.primary.kind === 'top-up' ? (
          <Link href="/pricing" className={buttonClasses({ size: 'lg' })}>
            Get more credits
          </Link>
        ) : (
          <Button
            type="submit"
            size="lg"
            aria-disabled={!canGenerate}
            className={!state.primary.enabled ? '!bg-raised !text-ink-muted !opacity-100' : ''}
          >
            {submitting ? (
              <>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  aria-hidden="true"
                  className="animate-spin"
                >
                  <path d="M10 2.5a7.5 7.5 0 1 1-7.5 7.5" />
                </svg>
                Starting your video…
              </>
            ) : (
              <>
                {otherError ? 'Try again' : 'Generate video'}
                {state.primary.enabled && (
                  <span className="hidden rounded-md border border-current/35 px-1.5 py-0.5 text-xs sm:inline">
                    {modKey} Enter
                  </span>
                )}
              </>
            )}
          </Button>
        )}

        {freeTrial && (
          <p className="text-ink-muted text-center text-[13px] leading-[18px]">
            Trial videos carry a small &ldquo;Made with Shortcraft&rdquo; mark.{' '}
            <Link href="/pricing" className="text-ember-ink font-semibold underline">
              See plans
            </Link>
          </p>
        )}
      </aside>
    </form>
  );
}
