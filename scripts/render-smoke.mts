/**
 * Render smoke test: builds a real MP4 with the in-house ffmpeg renderer from
 * generated test assets (3 Ken Burns stills + 1 short "AI" clip, voiceover,
 * captions), then checks the output with ffprobe. Needs ffmpeg + ffprobe on
 * PATH. No network, no secrets.
 *
 * Run: npx tsx scripts/render-smoke.mts   (exits 1 on failure; output path printed)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { renderWithFfmpeg } = await import('@/features/providers/local/ffmpeg-render');
const { AI_METADATA, OUTPUT_HEIGHT, OUTPUT_WIDTH } =
  await import('@/features/providers/local/ffmpeg-plan');
type RenderClip = import('@/features/providers/types').RenderClip;

const dir = mkdtempSync(join(tmpdir(), 'shortcraft-render-'));
const ff = (...args: string[]) =>
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);

// Test assets: landscape stills (forces crop), a 2s clip (forces tpad to 3s), 9s of tone.
const colors = ['0x1e3a8a', '0x9d174d', '0x065f46'];
const stills = colors.map((c, i) => {
  const p = join(dir, `still${i}.png`);
  ff(
    '-f',
    'lavfi',
    '-i',
    `testsrc2=s=1600x1200:d=1,drawbox=c=${c}@0.5:t=fill`,
    '-frames:v',
    '1',
    p,
  );
  return p;
});
const clipPath = join(dir, 'clip.mp4');
ff('-f', 'lavfi', '-i', 'testsrc=s=720x1280:d=2:r=24', '-pix_fmt', 'yuv420p', clipPath);
const voice = join(dir, 'voice.mp3');
ff('-f', 'lavfi', '-i', 'sine=frequency=330:duration=9', voice);

const clips: RenderClip[] = [
  { kind: 'still', imageUrl: 'mock://a', motion: 'push-in', startMs: 0, durationMs: 2000 },
  { kind: 'still', imageUrl: 'mock://b', motion: 'pan-left', startMs: 2000, durationMs: 2000 },
  { kind: 'still', imageUrl: 'mock://c', motion: 'pull-out', startMs: 4000, durationMs: 2000 },
  { kind: 'video', videoUrl: 'mock://d', startMs: 6000, durationMs: 3000 },
];
const words = 'This is how a Shortcraft video gets made in house today'
  .split(' ')
  .map((word, i) => ({ word, startMs: i * 700, endMs: (i + 1) * 700 }));

const out = join(dir, 'final.mp4');
const started = Date.now();
await renderWithFfmpeg({
  clips,
  clipPaths: [...stills, clipPath],
  voiceoverPath: voice,
  words,
  brandWatermark: true, // free-trial look, so both overlay lines are exercised
  workDir: dir,
  outputPath: out,
});
const ms = Date.now() - started;

const probe = JSON.parse(
  execFileSync('ffprobe', [
    '-v',
    'error',
    '-show_streams',
    '-show_format',
    '-of',
    'json',
    out,
  ]).toString(),
) as {
  streams: { codec_type: string; width?: number; height?: number }[];
  format: { duration: string; tags?: Record<string, string> };
};
const video = probe.streams.find((s) => s.codec_type === 'video');
const audio = probe.streams.find((s) => s.codec_type === 'audio');
const duration = Number(probe.format.duration);

const problems: string[] = [];
if (video?.width !== OUTPUT_WIDTH || video?.height !== OUTPUT_HEIGHT) {
  problems.push(`size ${video?.width}x${video?.height}`);
}
if (!audio) problems.push('no audio stream');
if (Math.abs(duration - 9) > 0.25) problems.push(`duration ${duration}s (expected 9s)`);
if (probe.format.tags?.comment !== AI_METADATA.comment)
  problems.push('missing AI-generated metadata');

console.log(
  `rendered ${out} in ${ms} ms: ${video?.width}x${video?.height}, ${duration.toFixed(2)}s`,
);
if (problems.length) {
  console.error(`FAIL: ${problems.join('; ')}`);
  process.exit(1);
}
console.log('PASS');
