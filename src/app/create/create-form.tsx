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
import { Sheet } from '@/components/ui/sheet';
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
  const [sheet, setSheet] = useState<'look' | 'length' | 'quality' | null>(null);

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
  function surprise() {
    const at = ideas.indexOf(sel.topic);
    update({ topic: ideas[(at + 1) % ideas.length] ?? sel.topic });
    setFailure(null);
  }

  const costLine = locked
    ? `Not on your plan yet`
    : state.affordable
      ? `About ${fmt(state.estimate)} credits · you have ${fmt(balance)}`
      : `About ${fmt(state.estimate)} credits · short by ${fmt(state.estimate - balance)}`;

  const pill =
    'bg-raised text-ink hover:bg-line inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[15px] font-medium transition-colors';
  const chevron = (
    <svg
      width="14"
      height="14"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 8l4 4 4-4" />
    </svg>
  );

  return (
    <form
      onSubmit={onSubmit}
      onKeyDown={onFormKeyDown}
      aria-busy={submitting}
      className="mx-auto flex max-w-[680px] flex-col gap-7 pt-2 pb-36 md:pt-10 md:pb-10"
    >
      <h1 className="font-display text-center text-[32px] leading-9 font-bold sm:text-[44px] sm:leading-[48px]">
        What&apos;s your video about?
      </h1>

      {firstRun && (
        <p className="bg-ember-soft text-ink rounded-card px-4 py-3 text-center text-sm">
          <span className="font-semibold">Your first video is one tap away.</span> We picked an
          idea. Make it, or write your own.
        </p>
      )}

      <div className={`flex flex-col gap-3 ${submitting ? 'opacity-60' : ''}`}>
        <div
          className={`bg-surface rounded-[20px] px-5 pt-5 pb-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--ember)] ${
            moderation ? 'ring-danger ring-2' : ''
          }`}
        >
          <label htmlFor="topic" className="sr-only">
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
            placeholder={`e.g. ${ideas[0]?.toLowerCase() ?? ''}`}
            aria-invalid={moderation ? true : undefined}
            aria-describedby={moderation ? 'topic-error' : undefined}
            className="text-ink placeholder:text-ink-muted w-full resize-none bg-transparent text-[19px] leading-[28px] outline-none sm:text-[20px]"
          />
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={surprise}
              className="text-ember-ink inline-flex min-h-11 items-center gap-1.5 text-sm font-medium"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 7h9l-2.5-2.5M16 13H7l2.5 2.5" />
              </svg>
              Surprise me
            </button>
            <span className="text-ink-muted hidden text-[13px] sm:inline">
              {modKey} Enter to make
            </span>
          </div>
        </div>
        {moderation && (
          <div
            id="topic-error"
            role="alert"
            className="bg-surface rounded-card flex items-start gap-2.5 px-4 py-3"
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
      </div>

      <div
        role="group"
        aria-label="Video settings"
        className="flex flex-wrap justify-center gap-2.5"
      >
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setSheet('look')}
          className={`${pill} pl-1.5`}
        >
          <span className="block size-8 overflow-hidden rounded-full" aria-hidden="true">
            <ThemeFrame themeId={sel.themeId} variant="card" caption={false} />
          </span>
          <span>
            <span className="sr-only">Look: </span>
            {theme.label}
          </span>
          {chevron}
        </button>
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setSheet('length')}
          className={pill}
        >
          <span>
            <span className="sr-only">Length: </span>
            {sel.durationSec} seconds
          </span>
          {state.durationLocked && <LockIcon />}
          {chevron}
        </button>
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setSheet('quality')}
          className={pill}
        >
          <span>
            <span className="sr-only">Quality: </span>
            {TIER_COPY[sel.tier].title}
          </span>
          {state.tierLocked && <LockIcon />}
          {chevron}
        </button>
      </div>

      <p role="status" className="sr-only">
        {notice}
      </p>

      {locked && state.upgradePlan && (
        <div className="bg-ember-soft rounded-card flex flex-col items-center gap-1.5 px-5 py-4 text-center">
          <span className="text-ink text-[15px] leading-5 font-semibold">
            {state.tierLocked
              ? `Premium AI video comes with ${state.upgradePlan.name}`
              : `${sel.durationSec}s videos come with ${state.upgradePlan.name}`}
          </span>
          <span className="text-ink text-sm">
            {state.upgradePlan.name} is {formatEuros(state.upgradePlan.priceCents)} a month with{' '}
            {fmt(state.upgradePlan.monthlyCredits)} credits.
          </span>
          <button
            type="button"
            onClick={() =>
              update(state.tierLocked ? { tier: 'standard' } : { durationSec: longestOnPlan })
            }
            className="text-ember-ink inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-2"
          >
            {state.tierLocked ? 'Use Standard instead' : `Use ${longestOnPlan}s instead`}
          </button>
        </div>
      )}

      {state.primary.kind === 'top-up' && (
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="text-danger text-[15px] leading-5 font-semibold">
            Not enough credits for {sel.durationSec}s.
          </span>
          {affordableLength ? (
            <button
              type="button"
              onClick={() => update({ durationSec: affordableLength })}
              className="text-ember-ink inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-2"
            >
              Switch to {affordableLength}s (about{' '}
              {fmt(
                estimateJobCredits({ targetDurationSec: affordableLength, modelTier: sel.tier }),
              )}{' '}
              credits)
            </button>
          ) : (
            <span className="text-ink-muted text-sm">Get more credits to make this video.</span>
          )}
        </div>
      )}

      {otherError && (
        <div role="alert" className="bg-surface rounded-card flex items-start gap-2.5 px-4 py-3">
          <AlertIcon />
          <div className="flex flex-col gap-0.5">
            <span className="text-[15px] leading-5 font-semibold">
              Couldn&apos;t start your video.
            </span>
            <span className="text-ink-muted text-sm">{otherError.message}</span>
          </div>
        </div>
      )}

      {/* Phones: the action rides in a bar above the bottom navigation. */}
      <div className="bg-paper/95 fixed inset-x-0 bottom-[72px] z-30 flex flex-col items-center gap-1.5 px-4 pt-3 pb-3 backdrop-blur md:static md:bg-transparent md:p-0 md:backdrop-blur-none">
        {state.primary.kind === 'upgrade' ? (
          <Link
            href="/pricing"
            className={buttonClasses({ size: 'lg', className: 'w-full rounded-full md:w-80' })}
          >
            See the {state.primary.planName} plan
          </Link>
        ) : state.primary.kind === 'top-up' ? (
          <Link
            href="/pricing"
            className={buttonClasses({ size: 'lg', className: 'w-full rounded-full md:w-80' })}
          >
            Get more credits
          </Link>
        ) : (
          <Button
            type="submit"
            size="lg"
            aria-disabled={!canGenerate}
            className={`w-full rounded-full md:w-80 ${
              !state.primary.enabled ? '!bg-raised !text-ink-muted !opacity-100' : ''
            }`}
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
            ) : otherError ? (
              'Try again'
            ) : (
              'Make video'
            )}
          </Button>
        )}
        <span className="text-ink-muted text-center text-[13px] tabular-nums sm:text-sm">
          {state.primary.kind === 'generate' && !state.hasTopic
            ? 'Describe your idea to start.'
            : costLine}
        </span>
      </div>

      {freeTrial && (
        <p className="text-ink-muted text-center text-[13px] leading-[18px]">
          Trial videos carry a small &ldquo;Made with Shortcraft&rdquo; mark.{' '}
          <Link href="/pricing" className="text-ember-ink font-semibold underline">
            See plans
          </Link>
        </p>
      )}

      <Sheet open={sheet === 'look'} onClose={() => setSheet(null)} title="Pick a look">
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
                onClick={() => {
                  update({ themeId: t.id });
                  setSheet(null);
                }}
                className="flex flex-col gap-2 text-left"
              >
                <span
                  className={`relative block overflow-hidden rounded-[14px] ring-offset-2 ring-offset-[var(--surface)] ${
                    checked ? 'ring-ember ring-[3px]' : ''
                  }`}
                >
                  <ThemeFrame themeId={t.id} variant="card" />
                  {t.id === lastThemeId && (
                    <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
                      Last used
                    </span>
                  )}
                </span>
                <span className="flex flex-col gap-0.5 px-0.5">
                  <span className="text-[15px] leading-5 font-semibold">{t.label}</span>
                  <span className="text-ink-muted text-[13px] leading-[18px]">{t.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Sheet>

      <Sheet open={sheet === 'length'} onClose={() => setSheet(null)} title="How long?">
        <div
          role="radiogroup"
          aria-label="Length"
          onKeyDown={(e) =>
            onRadioKeyDown(e, DURATIONS, sel.durationSec as (typeof DURATIONS)[number], (d) =>
              update({ durationSec: d }),
            )
          }
          className="flex flex-col gap-2"
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
                  setSheet(null);
                }}
                className={`flex min-h-14 items-center justify-between rounded-[16px] px-5 text-[17px] font-semibold transition-colors ${
                  checked ? 'bg-ember-soft ring-ember ring-2' : 'bg-raised hover:bg-line'
                }`}
              >
                {d} seconds
                <span className="text-ink-muted flex items-center gap-1.5 text-sm font-medium tabular-nums">
                  {plan ? (
                    <>
                      <LockIcon />
                      {plan}
                    </>
                  ) : (
                    `about ${fmt(estimateJobCredits({ targetDurationSec: d, modelTier: sel.tier }))} credits`
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </Sheet>

      <Sheet open={sheet === 'quality'} onClose={() => setSheet(null)} title="Quality">
        <div
          role="radiogroup"
          aria-label="Quality"
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
                onClick={() => {
                  update({ tier });
                  setSheet(null);
                }}
                className={`flex flex-col gap-1.5 rounded-[16px] p-5 text-left transition-colors ${
                  checked ? 'bg-ember-soft ring-ember ring-2' : 'bg-raised hover:bg-line'
                }`}
              >
                <span className="flex items-center gap-2 text-[17px] font-semibold">
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
                  About {fmt(cost)} credits for {sel.durationSec}s
                </span>
              </button>
            );
          })}
        </div>
      </Sheet>
    </form>
  );
}
