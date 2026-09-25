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
      expect(clip.videoUrl).toMatch(/^mock:\/\/video\//);
      expect(
        video.costCredits({ imageUrl: img.imageUrl, motionPrompt: '', durationSec: 6 }),
      ).toBeGreaterThan(0);

      clips.push({ videoUrl: clip.videoUrl, startMs: cursorMs });
      cursorMs += scene.durationSec * 1000;
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
          aspectRatio: '9:16',
        },
        ctx,
      ),
    );
    expect(final.videoUrl).toMatch(/^mock:\/\/render\//);
    expect(final.durationSec).toBeGreaterThan(0);
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
