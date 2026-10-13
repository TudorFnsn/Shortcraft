import { describe, expect, it } from 'vitest';
import { estimateRevoiceCredits } from '@/features/render/pricing';
import { maxNarrationLength } from '@/features/render/revoice';
import { versionsOf } from '@/app/gallery/library';
import { PREVIEW_MAX_CHARS as SERVER_PREVIEW_MAX } from '@/features/voice/preview';
import {
  PREVIEW_MAX_CHARS,
  cleanLine,
  editorState,
  revoiceBody,
  sourcePick,
} from '@/app/gallery/voiceover';

const line = (idx: number, narration: string) => ({
  idx,
  narration,
  maxLength: maxNarrationLength(narration),
});
const scenes = [
  line(0, 'Octopuses do not have red blood. Theirs is blue.'),
  line(1, 'The colour comes from hemocyanin, a copper protein.'),
];
const source = sourcePick('fun-facts', null, null);

describe('sourcePick', () => {
  it("starts from the look's default voice when none was chosen", () => {
    expect(source).toEqual({ voiceId: 'will', speed: 'normal', delivery: 'natural' });
  });

  it('starts from a saved voice the creator still has, else the look default', () => {
    const own = 'u_0f8e1c2a-1b2c-4d3e-8f90-123456789abc';
    const mine = [{ id: own, name: 'Radio', description: 'Low' }];
    expect(sourcePick('fun-facts', own, null, mine).voiceId).toBe(own);
    expect(sourcePick('fun-facts', own, null, []).voiceId).toBe('will');
  });

  it('starts from the voice and settings the video was made with', () => {
    expect(sourcePick('fun-facts', 'george', { speed: 'slower', delivery: 'calm' })).toEqual({
      voiceId: 'george',
      speed: 'slower',
      delivery: 'calm',
    });
  });
});

describe('editorState', () => {
  it('cannot make a new version until something changes', () => {
    const st = editorState(scenes, {}, source, source, 10_000);
    expect(st.edited.size).toBe(0);
    expect(st.voiceChanged).toBe(false);
    expect(st.canSubmit).toBe(false);
  });

  it('counts an edited line and prices the new narration', () => {
    const texts = { 1: 'The colour comes from hemocyanin, built on copper.' };
    const st = editorState(scenes, texts, source, source, 10_000);
    expect([...st.edited]).toEqual([1]);
    expect(st.credits).toBe(estimateRevoiceCredits([scenes[0]!.narration, texts[1]]));
    expect(st.canSubmit).toBe(true);
  });

  it('ignores whitespace-only changes, like the server', () => {
    const st = editorState(scenes, { 0: `  ${scenes[0]!.narration}  ` }, source, source, 10_000);
    expect(st.edited.size).toBe(0);
  });

  it('blocks a line past the limit the server enforces, and an empty line', () => {
    const long = 'x'.repeat(scenes[0]!.maxLength + 1);
    expect(editorState(scenes, { 0: long }, source, source, 10_000).canSubmit).toBe(false);
    expect([...editorState(scenes, { 0: long }, source, source, 10_000).tooLong]).toEqual([0]);
    expect(editorState(scenes, { 1: '   ' }, source, source, 10_000).canSubmit).toBe(false);
  });

  it('allows a voice change on its own, and blocks when credits are short', () => {
    const george = { ...source, voiceId: 'george' as const };
    expect(editorState(scenes, {}, george, source, 10_000).canSubmit).toBe(true);
    expect(editorState(scenes, {}, george, source, 0).canSubmit).toBe(false);
  });
});

describe('revoiceBody', () => {
  it('sends only the changed lines, cleaned', () => {
    expect(revoiceBody(scenes, { 1: ' New   line. ' }, source, false)).toEqual({
      scenes: [{ idx: 1, narration: 'New line.' }],
    });
  });

  it('sends the whole voice choice when the voice changed', () => {
    const faster = { ...source, speed: 'faster' as const };
    expect(revoiceBody(scenes, {}, faster, true)).toEqual({
      scenes: [],
      voiceId: 'will',
      speed: 'faster',
      delivery: 'natural',
    });
  });

  it('cleans lines the way the server does', () => {
    expect(cleanLine('  a\n b  ')).toBe('a b');
  });
});

describe('versionsOf', () => {
  it('numbers new versions per original, by creation time, through chains', () => {
    const v = versionsOf([
      { id: 'a', parentJobId: null, createdAt: '2026-10-01T00:00:00Z' },
      { id: 'a3', parentJobId: 'a2', createdAt: '2026-10-03T00:00:00Z' },
      { id: 'a2', parentJobId: 'a', createdAt: '2026-10-02T00:00:00Z' },
      { id: 'b', parentJobId: null, createdAt: '2026-10-02T00:00:00Z' },
      { id: 'orphan', parentJobId: 'deleted', createdAt: '2026-10-02T00:00:00Z' },
    ]);
    expect(Object.fromEntries(v)).toEqual({ a: 1, a2: 2, a3: 3, b: 1, orphan: 1 });
  });
});

describe('Hear this line', () => {
  it('sends no more than the preview API accepts', () => {
    expect(PREVIEW_MAX_CHARS).toBe(SERVER_PREVIEW_MAX);
  });
});
