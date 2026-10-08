import { describe, expect, it } from 'vitest';
import { getModel } from '@/config/models';
import {
  AI_LABEL_TEXT,
  AI_METADATA,
  buildAssSubtitles,
  buildFfmpegPlan,
  OUTPUT_FPS,
  quoteFilterPath,
  zoompanExpr,
} from '@/features/providers/local/ffmpeg-plan';
import { createKenBurnsProvider, stillMotionFor } from '@/features/providers/local/ken-burns';
import type { RenderClip } from '@/features/providers/types';

describe('Ken Burns provider', () => {
  const provider = createKenBurnsProvider(getModel('video-standard'));

  it('turns a scene image into an animated still at zero API cost', async () => {
    const out = await provider.run(
      { imageUrl: 'mock://image/a.png', motionPrompt: 'slow push-in', durationSec: 6 },
      { idempotencyKey: 'k' },
    );
    expect(out).toEqual({
      kind: 'completed',
      costUsd: 0,
      output: { kind: 'still', imageUrl: 'mock://image/a.png', motion: 'push-in', durationSec: 6 },
    });
  });

  it('still charges the per-second credit price (customer prices unchanged)', () => {
    const credits = provider.costCredits({ imageUrl: 'x', motionPrompt: '', durationSec: 5.5 });
    expect(credits).toBe(6 * getModel('video-standard').creditsPerUnit);
  });

  it('maps motion hints onto camera moves', () => {
    expect(stillMotionFor('Slow zoom in on the face')).toBe('push-in');
    expect(stillMotionFor('pull back to reveal the city')).toBe('pull-out');
    expect(stillMotionFor('pan left across the desk')).toBe('pan-left');
    expect(stillMotionFor('camera drifts right')).toBe('pan-right');
  });

  it('picks a stable move when there is no hint', () => {
    expect(stillMotionFor('a quiet moment')).toBe(stillMotionFor('a quiet moment'));
  });
});

const still = (startMs: number, durationMs: number): RenderClip => ({
  kind: 'still',
  imageUrl: 'mock://i',
  motion: 'push-in',
  startMs,
  durationMs,
});

describe('buildFfmpegPlan', () => {
  const base = {
    clipPaths: ['/tmp/r/a.png', '/tmp/r/b.mp4'],
    voiceoverPath: '/tmp/r/voice.mp3',
    subtitlesPath: '/tmp/r/captions.ass',
    outputPath: '/tmp/r/out.mp4',
  };
  const clips: RenderClip[] = [
    still(0, 6000),
    { kind: 'video', videoUrl: 'mock://v', startMs: 6000, durationMs: 4500 },
  ];

  it('builds one pass: inputs, per-scene filters, concat + captions, audio, mp4', () => {
    const plan = buildFfmpegPlan({ ...base, clips });
    expect(plan.durationSec).toBe(10.5);

    const graph = plan.args[plan.args.indexOf('-filter_complex') + 1] ?? '';
    expect(graph).toContain(`[0:v]scale=2160:3840`);
    expect(graph).toContain(`zoompan=z='1+0.15*on/${6 * OUTPUT_FPS}'`);
    expect(graph).toContain(`d=${6 * OUTPUT_FPS}:s=1080x1920`);
    expect(graph).toContain('[1:v]scale=1080:1920');
    expect(graph).toContain('tpad=stop_mode=clone:stop_duration=4.500');
    expect(graph).toContain("[v0][v1]concat=n=2:v=1:a=0,ass='/tmp/r/captions.ass'[vout]");

    expect(plan.args).toEqual(
      expect.arrayContaining(['-map', '[vout]', '-map', '2:a', '-t', '10.500', base.outputPath]),
    );
    expect(plan.args.at(-1)).toBe(base.outputPath);
    expect(plan.args.slice(0, 8)).toEqual([
      '-hide_banner',
      '-y',
      '-i',
      base.clipPaths[0],
      '-i',
      base.clipPaths[1],
      '-i',
      base.voiceoverPath,
    ]);
  });

  it('marks every render as AI-generated in the MP4 metadata', () => {
    const plan = buildFfmpegPlan({ ...base, clips });
    const metadata = plan.args.flatMap((arg, i) => (plan.args[i - 1] === '-metadata' ? [arg] : []));
    expect(metadata).toEqual([
      `comment=${AI_METADATA.comment}`,
      `description=${AI_METADATA.description}`,
    ]);
    expect(AI_METADATA.comment).toMatch(/AI-generated/);
    // Output options must precede the output path to apply to it.
    expect(plan.args.lastIndexOf('-metadata')).toBeLessThan(plan.args.indexOf(base.outputPath));
  });

  it('rejects mismatched or empty inputs', () => {
    expect(() => buildFfmpegPlan({ ...base, clips: [] })).toThrow(/at least one clip/);
    expect(() => buildFfmpegPlan({ ...base, clips: [still(0, 1000)] })).toThrow(/clip paths/);
  });

  it('refuses paths that could break out of the filtergraph quoting', () => {
    expect(quoteFilterPath('/tmp/a b:c,d.ass')).toBe("'/tmp/a b:c,d.ass'");
    expect(() => quoteFilterPath("/tmp/x';drawtext=.ass")).toThrow(/unsafe/);
    expect(() => quoteFilterPath('C:\\tmp\\x.ass')).toThrow(/unsafe/);
  });

  it('has a distinct camera move per motion', () => {
    const moves = (['push-in', 'pull-out', 'pan-left', 'pan-right'] as const).map((m) =>
      JSON.stringify(zoompanExpr(m, 90)),
    );
    expect(new Set(moves).size).toBe(4);
  });
});

describe('buildAssSubtitles', () => {
  const words = ['one', 'two', 'three', 'four', '{\\b0}five'].map((word, i) => ({
    word,
    startMs: i * 500,
    endMs: (i + 1) * 500,
  }));

  it('groups words into short uppercase captions with ASS timestamps', () => {
    const ass = buildAssSubtitles(words, 2500);
    expect(ass).toContain('PlayResX: 1080');
    expect(ass).toContain('Dialogue: 0,0:00:00.00,0:00:01.50,Default,,0,0,0,,ONE TWO THREE');
    expect(ass).toContain('Dialogue: 0,0:00:01.50,0:00:02.50,Default,,0,0,0,,FOUR B0FIVE');
  });

  it('strips ASS override markup from narration', () => {
    expect(buildAssSubtitles(words, 2500)).not.toMatch(/Dialogue:.*[{}\\]/);
  });

  it('formats hours and minutes', () => {
    const ass = buildAssSubtitles([{ word: 'late', startMs: 3_723_450, endMs: 3_724_000 }], 0);
    expect(ass).toContain('Dialogue: 0,1:02:03.45,1:02:04.00');
  });
});

describe('AI-generated label', () => {
  it('shows the label from the first frame to the end of the video', () => {
    const ass = buildAssSubtitles([{ word: 'hi', startMs: 0, endMs: 400 }], 12_345);
    expect(ass).toContain(`Dialogue: 1,0:00:00.00,0:00:12.35,Label,,0,0,0,,${AI_LABEL_TEXT}`);
    expect(ass).toMatch(/^Style: Label,/m);
  });

  it('is still present on a video with no narration', () => {
    const ass = buildAssSubtitles([], 6000);
    const dialogues = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
    expect(dialogues).toEqual([`Dialogue: 1,0:00:00.00,0:00:06.00,Label,,0,0,0,,${AI_LABEL_TEXT}`]);
  });
});
