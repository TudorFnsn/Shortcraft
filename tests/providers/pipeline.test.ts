/**
 * Proves the whole provider chain runs end-to-end on mocks with no keys:
 * script -> image -> video -> voice -> render. This is the skeleton the
 * DB-backed orchestrator will drive in Phase 1.
 */
import { describe, expect, it } from 'vitest';
import {
  getImageProvider,
  getRenderProvider,
  getScriptProvider,
  getVideoProvider,
  getVoiceProvider,
} from '@/features/providers/registry';
import type { ProviderContext, ProviderOutcome, RenderClip } from '@/features/providers/types';

const ctx: ProviderContext = { idempotencyKey: 'test-key' };

function completed<T>(outcome: ProviderOutcome<T>): T {
  if (outcome.kind !== 'completed') {
    throw new Error('expected mock provider to complete inline');
  }
  expect(outcome.costUsd).toBeGreaterThanOrEqual(0);
  return outcome.output;
}

describe('mock render pipeline', () => {
  it('produces a final video from a topic', async () => {
    const script = getScriptProvider();
    const scriptOut = completed(
      await script.run(
        { topic: 'a cat CEO', themeId: 'office-drama', targetDurationSec: 12, language: 'en' },
        ctx,
      ),
    );
    expect(scriptOut.scenes.length).toBeGreaterThanOrEqual(2);
    expect(script.costCredits(scriptOut as never)).toBeGreaterThan(0);

    const image = getImageProvider();
    const video = getVideoProvider();
    const voice = getVoiceProvider();

    const clips: RenderClip[] = [];
    let cursorMs = 0;
    for (const scene of scriptOut.scenes) {
      const img = completed(
        await image.run({ prompt: scene.imagePrompt, aspectRatio: '9:16' }, ctx),
      );
      expect(img.imageUrl).toMatch(/^mock:\/\/image\//);

      const clip = completed(
        await video.run(
          {
            imageUrl: img.imageUrl,
            motionPrompt: scene.motionPrompt,
            durationSec: scene.durationSec,
          },
          ctx,
        ),
      );
      // Standard tier: the scene image itself, animated by our renderer.
      expect(clip.kind).toBe('still');
      if (clip.kind !== 'still') throw new Error('expected an animated still');
      expect(clip.imageUrl).toBe(img.imageUrl);
      expect(
        video.costCredits({ imageUrl: img.imageUrl, motionPrompt: '', durationSec: 6 }),
      ).toBeGreaterThan(0);

      const durationMs = scene.durationSec * 1000;
      clips.push({
        kind: 'still',
        imageUrl: clip.imageUrl,
        motion: clip.motion,
        startMs: cursorMs,
        durationMs,
      });
      cursorMs += durationMs;
    }

    const fullNarration = scriptOut.scenes.map((s) => s.narration).join(' ');
    const vo = completed(
      await voice.run({ text: fullNarration, voiceId: 'default', language: 'en' }, ctx),
    );
    expect(vo.words.length).toBeGreaterThan(0);

    const render = getRenderProvider();
    const final = completed(
      await render.run(
        {
          clips,
          voiceoverUrl: vo.audioUrl,
          words: vo.words,
          subtitleStyleId: 'default',
          brandWatermark: false,
          aspectRatio: '9:16',
        },
        ctx,
      ),
    );
    expect(final.videoUrl).toMatch(/^mock:\/\/render\//);
    expect(final.durationSec).toBeGreaterThan(0);
  });

  it('uses an AI video model for premium scenes', async () => {
    const premium = getVideoProvider('video-premium');
    const clip = completed(
      await premium.run(
        { imageUrl: 'mock://image/x.png', motionPrompt: 'push', durationSec: 6 },
        ctx,
      ),
    );
    expect(clip.kind).toBe('video');
    if (clip.kind === 'video') expect(clip.videoUrl).toMatch(/^mock:\/\/video\//);
  });

  it('is deterministic for the same input', async () => {
    const s = getScriptProvider();
    const a = completed(
      await s.run({ topic: 't', themeId: 'x', targetDurationSec: 12, language: 'en' }, ctx),
    );
    const b = completed(
      await s.run({ topic: 't', themeId: 'x', targetDurationSec: 12, language: 'en' }, ctx),
    );
    expect(a.title).toBe(b.title);
    expect(a.scenes[0]?.imagePrompt).toBe(b.scenes[0]?.imagePrompt);
  });
});
