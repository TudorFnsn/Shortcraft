/**
 * Pure state for the Create composer: what the selection costs, whether it is on
 * the user's plan, whether they can afford it, and what the one primary button
 * should do. Kept free of React so it is unit-tested (tests/ui/create-composer.test.ts).
 */
import type { ModelTier } from '@/config/models';
import { THEMES, isThemeId } from '@/config/themes';
import { cheapestPlanAllowing } from '@/features/billing/entitlements';
import { estimateJobCredits } from '@/features/render/pricing';
import { STARTER, lookFor } from '@/components/ideas';

export const DURATIONS = [15, 30, 60, 90, 120] as const;
export const TIERS: readonly ModelTier[] = ['standard', 'premium'];

export interface Selection {
  topic: string;
  themeId: string;
  durationSec: number;
  tier: ModelTier;
}

export interface Limits {
  balance: number;
  maxDurationSec: number;
  allowedTiers: readonly ModelTier[];
}

export type Primary =
  | { kind: 'generate'; enabled: boolean }
  | { kind: 'upgrade'; planName: string }
  | { kind: 'top-up' };

export interface ComposerState {
  estimate: number;
  durationLocked: boolean;
  tierLocked: boolean;
  /** Cheapest plan that allows the current selection (null when on-plan or none does). */
  upgradePlan: { name: string; priceCents: number; monthlyCredits: number } | null;
  affordable: boolean;
  /** Topic long enough to send (the API requires 3+ characters). */
  hasTopic: boolean;
  primary: Primary;
}

export function composerState(sel: Selection, limits: Limits): ComposerState {
  const estimate = estimateJobCredits({ targetDurationSec: sel.durationSec, modelTier: sel.tier });
  const durationLocked = sel.durationSec > limits.maxDurationSec;
  const tierLocked = !limits.allowedTiers.includes(sel.tier);
  const locked = durationLocked || tierLocked;
  const plan = locked
    ? cheapestPlanAllowing({ targetDurationSec: sel.durationSec, modelTier: sel.tier })
    : null;
  const affordable = estimate <= limits.balance;
  const hasTopic = sel.topic.trim().length >= 3;

  let primary: Primary;
  if (locked && plan) primary = { kind: 'upgrade', planName: plan.name };
  else if (!locked && !affordable) primary = { kind: 'top-up' };
  else primary = { kind: 'generate', enabled: !locked && hasTopic };

  return {
    estimate,
    durationLocked,
    tierLocked,
    upgradePlan: plan
      ? { name: plan.name, priceCents: plan.priceCents, monthlyCredits: plan.monthlyCredits }
      : null,
    affordable,
    hasTopic,
    primary,
  };
}

/** Plan name that unlocks a length, or null when the user's plan already covers it. */
export function lengthLockPlan(durationSec: number, maxDurationSec: number): string | null {
  if (durationSec <= maxDurationSec) return null;
  return (
    cheapestPlanAllowing({ targetDurationSec: durationSec, modelTier: 'standard' })?.name ?? null
  );
}

/** Plan name that unlocks a quality tier (shown on its locked badge). */
export function tierLockPlan(tier: ModelTier): string {
  return (
    cheapestPlanAllowing({ targetDurationSec: DURATIONS[0], modelTier: tier })?.name ??
    'a higher plan'
  );
}

export interface LastJob {
  themeId: string;
  targetDurationSec: number;
  modelTier: ModelTier;
}

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

/**
 * Where the composer starts:
 * - a link with ?idea= / ?theme= (Library "Today's ideas", starter chips) wins;
 * - otherwise the creator's last settings (fast repeat use);
 * - a brand-new account gets a ready idea so the first video is one tap away.
 */
export function initialSelection(input: {
  params: Record<string, string | string[] | undefined>;
  lastJob: LastJob | null;
}): Selection & { firstRun: boolean } {
  const { params, lastJob } = input;
  const ideaParam = first(params.idea)?.slice(0, 300);
  const themeParam = first(params.theme);
  const firstRun = lastJob === null;

  const fallbackTheme = THEMES[0]?.id ?? STARTER.themeId;
  const themeId =
    themeParam && isThemeId(themeParam)
      ? themeParam
      : lastJob && isThemeId(lastJob.themeId)
        ? lastJob.themeId
        : firstRun
          ? STARTER.themeId
          : fallbackTheme;

  const durationSec =
    lastJob && (DURATIONS as readonly number[]).includes(lastJob.targetDurationSec)
      ? lastJob.targetDurationSec
      : 15;
  const tier: ModelTier = lastJob?.modelTier ?? 'standard';
  const topic = ideaParam ?? (firstRun ? (lookFor(themeId).ideas[0] ?? STARTER.topic) : '');

  return { topic, themeId, durationSec, tier, firstRun: firstRun && ideaParam === undefined };
}

export const formatEuros = (cents: number): string => `€${(cents / 100).toFixed(2)}`;
