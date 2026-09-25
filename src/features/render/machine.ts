/**
 * Render pipeline state machine (pure).
 *
 * One render_job walks these states in order; each is driven by a provider step.
 * The orchestrator (DB-backed, added next) calls `advance` on success and
 * `fail` on error. Keeping the transition logic pure makes it exhaustively
 * unit-testable and impossible to land in an invalid state.
 *
 *   DRAFT -> SCRIPTING -> IMAGES -> CLIPS -> VOICEOVER -> SUBTITLES -> STITCHING -> DONE
 *                                   (any) -> FAILED
 */

export const RENDER_STEPS = [
  'scripting',
  'images',
  'clips',
  'voiceover',
  'subtitles',
  'stitching',
] as const;
export type RenderStep = (typeof RENDER_STEPS)[number];

export type RenderStatus = 'draft' | RenderStep | 'done' | 'failed';

const ORDER: readonly RenderStatus[] = ['draft', ...RENDER_STEPS, 'done'] as const;

export const isTerminal = (s: RenderStatus): boolean => s === 'done' || s === 'failed';

/** The next status after the current step completes successfully. */
export function advance(current: RenderStatus): RenderStatus {
  if (isTerminal(current)) {
    throw new Error(`cannot advance terminal status "${current}"`);
  }
  const idx = ORDER.indexOf(current);
  if (idx < 0) throw new Error(`unknown status "${current}"`);
  const next = ORDER[idx + 1];
  if (next === undefined) throw new Error(`no successor for "${current}"`);
  return next;
}

/** Any non-terminal status can fail. */
export function fail(current: RenderStatus): RenderStatus {
  if (isTerminal(current)) {
    throw new Error(`cannot fail terminal status "${current}"`);
  }
  return 'failed';
}

/** Coarse progress 0..1 for the UI. */
export function progress(status: RenderStatus): number {
  if (status === 'failed') return 0;
  if (status === 'done') return 1;
  const idx = ORDER.indexOf(status);
  return idx <= 0 ? 0 : idx / (ORDER.length - 1);
}
