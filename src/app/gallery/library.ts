/**
 * Pure view-model for the Library: turns render jobs into the cards the grid
 * draws (named step, progress, relative time, filter counts). No React, so it
 * is unit-tested (tests/ui/library.test.ts) and runs on the server.
 */
import { THEMES } from '@/config/themes';
import type { ModelTier } from '@/config/models';
import { RENDER_STEPS, isTerminal, progress, type RenderStatus } from '@/features/render/machine';
import type { RenderJobRecord } from '@/features/render/repository';
import { estimateJobCredits } from '@/features/render/pricing';

/** The six steps, named the way creators think about them (brand voice). */
const STEP_LABEL: Record<(typeof RENDER_STEPS)[number], string> = {
  scripting: 'Writing script',
  images: 'Drawing scenes',
  clips: 'Animating',
  voiceover: 'Recording voice',
  subtitles: 'Adding captions',
  stitching: 'Final cut',
};

export const STEP_COUNT = RENDER_STEPS.length;

/** 1-based step and its label for an in-progress job ("draft" counts as step 1). */
export function stepOf(status: RenderStatus): { step: number; label: string } {
  const idx = RENDER_STEPS.indexOf(status as (typeof RENDER_STEPS)[number]);
  const at = Math.max(0, idx);
  return { step: at + 1, label: STEP_LABEL[RENDER_STEPS[at]!] };
}

export type CardKind = 'ready' | 'working' | 'failed';
export type Filter = 'all' | CardKind;

export interface LibraryCard {
  id: string;
  kind: CardKind;
  title: string;
  topic: string;
  themeId: string;
  themeLabel: string;
  durationSec: number;
  tier: ModelTier;
  /** "Fun Facts · 15s · 2h ago" */
  meta: string;
  /** Finished in the last 24 hours. */
  isNew: boolean;
  /** The first scene image exists (from "clips" on), so a thumbnail can load. */
  hasThumb: boolean;
  /** Live renders only: mock outputs aren't playable. */
  playable: boolean;
  step: number;
  stepLabel: string;
  /** 0..100 */
  percent: number;
  /** What the same video costs to make again (current pricing). */
  retryCredits: number;
  creditsUsed: number;
  createdAt: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Short relative time: "Just now", "5 min ago", "3h ago", "Yesterday", "4 days ago", "Oct 3". */
export function timeAgo(iso: string, now: Date): string {
  const then = new Date(iso);
  const diff = now.getTime() - then.getTime();
  if (Number.isNaN(diff)) return '';
  if (diff < 60_000) return 'Just now';
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < DAY_MS) return `${Math.floor(diff / (60 * 60_000))}h ago`;
  if (diff < 2 * DAY_MS) return 'Yesterday';
  if (diff < 7 * DAY_MS) return `${Math.floor(diff / DAY_MS)} days ago`;
  return `${MONTHS[then.getUTCMonth()]} ${then.getUTCDate()}`;
}

const themeLabel = (id: string) => THEMES.find((t) => t.id === id)?.label ?? id;

export function toCard(job: RenderJobRecord, now: Date): LibraryCard {
  const status = job.status as RenderStatus;
  const kind: CardKind = status === 'done' ? 'ready' : status === 'failed' ? 'failed' : 'working';
  const { step, label } = stepOf(status);
  const theme = themeLabel(job.themeId);
  const imagesDone = RENDER_STEPS.indexOf(status as (typeof RENDER_STEPS)[number]) >= 2;
  return {
    id: job.id,
    kind,
    title: job.title ?? job.topic,
    topic: job.topic,
    themeId: job.themeId,
    themeLabel: theme,
    durationSec: job.targetDurationSec,
    tier: job.modelTier,
    meta: `${theme} · ${job.targetDurationSec}s · ${
      kind === 'working'
        ? `Started ${timeAgo(job.createdAt, now).toLowerCase()}`
        : timeAgo(job.updatedAt, now)
    }`,
    isNew: kind === 'ready' && now.getTime() - new Date(job.updatedAt).getTime() < DAY_MS,
    hasThumb: kind === 'ready' || imagesDone,
    playable: kind === 'ready' && Boolean(job.outputAssetUrl?.startsWith('https://')),
    step,
    stepLabel: label,
    // Halfway through the current step, so a fresh job never shows an empty bar.
    percent:
      kind === 'working'
        ? Math.round(Math.max(progress(status), (step - 0.5) / STEP_COUNT) * 100)
        : kind === 'ready'
          ? 100
          : 0,
    retryCredits: estimateJobCredits({
      targetDurationSec: job.targetDurationSec,
      modelTier: job.modelTier,
    }),
    creditsUsed: job.actualCredits,
    createdAt: job.createdAt,
  };
}

export function countByFilter(cards: readonly LibraryCard[]): Record<Filter, number> {
  return {
    all: cards.length,
    working: cards.filter((c) => c.kind === 'working').length,
    ready: cards.filter((c) => c.kind === 'ready').length,
    failed: cards.filter((c) => c.kind === 'failed').length,
  };
}

/** "12 videos · 5 this week" */
export function librarySummary(jobs: readonly RenderJobRecord[], now: Date): string {
  if (jobs.length === 0) return 'Nothing here yet.';
  const week = jobs.filter((j) => now.getTime() - new Date(j.createdAt).getTime() < 7 * DAY_MS);
  const total = `${jobs.length} video${jobs.length === 1 ? '' : 's'}`;
  return week.length > 0 ? `${total} · ${week.length} this week` : total;
}

export const anyWorking = (jobs: readonly RenderJobRecord[]) =>
  jobs.some((j) => !isTerminal(j.status as RenderStatus));
