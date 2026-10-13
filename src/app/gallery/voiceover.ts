/**
 * Pure state for the voiceover editor (Voice Studio V3): which lines changed,
 * which are too long, what the new version costs and what to send to
 * `POST /api/jobs/:id/revoice`. Unit-tested (tests/ui/voiceover.test.ts).
 */
import {
  DEFAULT_VOICE_SETTINGS,
  defaultVoiceFor,
  isVoiceId,
  type VoiceId,
  type VoiceSettings,
} from '@/config/voices';
import { estimateRevoiceCredits } from '@/features/render/pricing';
import type { VoicePick } from '@/components/voice/voice-choice';

export interface EditScene {
  idx: number;
  narration: string;
  /** Longest line the server accepts for this scene. */
  maxLength: number;
}

/**
 * Longest line "Hear this line" sends. Mirrors `PREVIEW_MAX_CHARS` in the
 * server-only `features/voice/preview.ts` (a test keeps them equal).
 */
export const PREVIEW_MAX_CHARS = 300;

/** The same clean-up the server applies before comparing and measuring. */
export const cleanLine = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** The voice a finished video was made with, as a pick the editor starts from. */
export function sourcePick(
  themeId: string,
  voiceId: string | null,
  settings: VoiceSettings | null,
): VoicePick & { voiceId: VoiceId } {
  const s = settings ?? DEFAULT_VOICE_SETTINGS;
  return {
    voiceId: voiceId && isVoiceId(voiceId) ? voiceId : defaultVoiceFor(themeId),
    speed: s.speed,
    delivery: s.delivery,
  };
}

export interface EditorState {
  edited: Set<number>;
  tooLong: Set<number>;
  empty: Set<number>;
  voiceChanged: boolean;
  credits: number;
  canSubmit: boolean;
}

export function editorState(
  scenes: readonly EditScene[],
  texts: Readonly<Record<number, string>>,
  pick: VoicePick,
  source: VoicePick,
  balance: number,
): EditorState {
  const edited = new Set<number>();
  const tooLong = new Set<number>();
  const empty = new Set<number>();
  for (const s of scenes) {
    const line = cleanLine(texts[s.idx] ?? s.narration);
    if (!line) empty.add(s.idx);
    else if (line.length > s.maxLength) tooLong.add(s.idx);
    if (line !== s.narration) edited.add(s.idx);
  }
  const voiceChanged =
    pick.voiceId !== source.voiceId ||
    pick.speed !== source.speed ||
    pick.delivery !== source.delivery;
  const credits = estimateRevoiceCredits(
    scenes.map((s) => cleanLine(texts[s.idx] ?? s.narration) || s.narration),
  );
  return {
    edited,
    tooLong,
    empty,
    voiceChanged,
    credits,
    canSubmit:
      (edited.size > 0 || voiceChanged) &&
      tooLong.size === 0 &&
      empty.size === 0 &&
      credits <= balance,
  };
}

/** The request body: only changed lines, and the voice only when it changed. */
export function revoiceBody(
  scenes: readonly EditScene[],
  texts: Readonly<Record<number, string>>,
  pick: VoicePick,
  voiceChanged: boolean,
) {
  return {
    scenes: scenes
      .map((s) => ({ idx: s.idx, narration: cleanLine(texts[s.idx] ?? s.narration) }))
      .filter((s, i) => s.narration !== scenes[i]!.narration),
    ...(voiceChanged && pick.voiceId
      ? { voiceId: pick.voiceId, speed: pick.speed, delivery: pick.delivery }
      : {}),
  };
}
