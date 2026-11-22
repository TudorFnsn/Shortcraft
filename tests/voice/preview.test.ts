import { describe, expect, it } from 'vitest';
import { getVoice } from '@/config/voices';
import { estimateRevoiceCredits, estimateSceneRedoCredits } from '@/features/render/pricing';
import { InMemoryStore } from '@/features/render/repository.memory';
import { editorView, maxNarrationLength } from '@/features/render/revoice';
import {
  InMemoryPreviewLog,
  PREVIEWS_PER_DAY,
  PREVIEW_MAX_CHARS,
  previewCacheKey,
  previewLine,
} from '@/features/voice/preview';

const NOW = new Date('2026-10-13T12:00:00Z');
const at = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

describe('previewLine', () => {
  it('speaks the line once and serves later requests from the cache, for free', async () => {
    const log = new InMemoryPreviewLog(() => NOW);
    const req = { text: 'Octopuses have  three hearts.', themeId: 'fun-facts', voiceId: 'george' };
    const first = await previewLine(log, 'u1', req, NOW);
    const again = await previewLine(log, 'u2', req, at(1));
    expect(first).toMatchObject({ ok: true, value: { cached: false } });
    expect(again).toMatchObject({ ok: true, value: { cached: true } });
    if (first.ok && again.ok) expect(again.value.audioUrl).toBe(first.value.audioUrl);
    expect(log.rows).toHaveLength(1);
  });

  it('caps fresh previews per user per day; cache hits do not count', async () => {
    const log = new InMemoryPreviewLog(() => NOW);
    for (let i = 0; i < PREVIEWS_PER_DAY; i++) {
      const r = await previewLine(log, 'u1', { text: `Line ${i}`, themeId: 'fun-facts' }, NOW);
      expect(r.ok).toBe(true);
    }
    const capped = await previewLine(log, 'u1', { text: 'One more', themeId: 'fun-facts' }, NOW);
    expect(capped).toMatchObject({ ok: false, error: { code: 'rate_limited' } });
    const hit = await previewLine(log, 'u1', { text: 'Line 3', themeId: 'fun-facts' }, NOW);
    expect(hit).toMatchObject({ ok: true, value: { cached: true } });
    // Another creator is not affected, and the cap resets after a day.
    expect((await previewLine(log, 'u2', { text: 'Hi', themeId: 'fun-facts' }, NOW)).ok).toBe(true);
    const nextDay = await previewLine(
      log,
      'u1',
      { text: 'Tomorrow', themeId: 'fun-facts' },
      at(25),
    );
    expect(nextDay.ok).toBe(true);
  });

  it('rejects empty and over-long lines without calling the voice', async () => {
    const log = new InMemoryPreviewLog(() => NOW);
    expect((await previewLine(log, 'u', { text: '  ', themeId: 'fun-facts' }, NOW)).ok).toBe(false);
    const long = 'x'.repeat(PREVIEW_MAX_CHARS + 1);
    expect((await previewLine(log, 'u', { text: long, themeId: 'fun-facts' }, NOW)).ok).toBe(false);
    expect(log.rows).toHaveLength(0);
  });

  it('keys the cache on text, voice and settings', () => {
    const s = { speed: 'normal', delivery: 'natural' } as const;
    expect(previewCacheKey('a', 'will', s)).not.toBe(previewCacheKey('a', 'george', s));
    expect(previewCacheKey('a', 'will', s)).not.toBe(
      previewCacheKey('a', 'will', { ...s, speed: 'faster' }),
    );
    expect(getVoice('will').providerVoiceId).toBeTruthy();
  });
});

describe('editorView', () => {
  it('gives the editor scenes in order with their limits, the voice in use and the quote', async () => {
    const store = new InMemoryStore();
    const job = await store.createJob({
      userId: 'u',
      topic: 't',
      themeId: 'horror-story',
      targetDurationSec: 12,
      language: 'en',
      modelTier: 'standard',
    });
    const scenes = await store.addScenes(job.id, [
      { idx: 1, narration: 'Second line.', imagePrompt: '', motionPrompt: '', durationSec: 6 },
      { idx: 0, narration: 'First line.', imagePrompt: '', motionPrompt: '', durationSec: 6 },
    ]);
    const view = editorView({ ...job, status: 'done' }, scenes);
    expect(view.editable).toBe(true);
    expect(view.voiceId).toBe('callum'); // the horror look's default
    expect(view.voiceSettings).toEqual({ speed: 'normal', delivery: 'natural' });
    expect(view.scenes).toEqual([
      {
        idx: 0,
        narration: 'First line.',
        maxLength: maxNarrationLength('First line.'),
        imagePrompt: '',
        redoCredits: estimateSceneRedoCredits('standard', 6),
      },
      {
        idx: 1,
        narration: 'Second line.',
        maxLength: maxNarrationLength('Second line.'),
        imagePrompt: '',
        redoCredits: estimateSceneRedoCredits('standard', 6),
      },
    ]);
    expect(view.revoiceCredits).toBe(estimateRevoiceCredits(['First line.', 'Second line.']));
    expect(editorView(job, scenes).editable).toBe(false);
  });
});
