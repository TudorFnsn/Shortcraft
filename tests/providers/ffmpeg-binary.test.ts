import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';
import { bundledFfmpegPath, resolveFfmpegPath } from '@/features/providers/local/ffmpeg-binary';
import { renderWithFfmpeg } from '@/features/providers/local/ffmpeg-render';

describe('resolveFfmpegPath', () => {
  const cwd = '/app';
  const bundled = join('/app', 'node_modules', 'ffmpeg-static', 'ffmpeg');

  it('prefers an explicit FFMPEG_PATH', () => {
    expect(resolveFfmpegPath({ envPath: '/opt/ffmpeg', cwd, exists: () => true })).toBe(
      '/opt/ffmpeg',
    );
  });

  it('uses the bundled static build when it was installed', () => {
    expect(resolveFfmpegPath({ cwd, platform: 'linux', exists: (p) => p === bundled })).toBe(
      bundled,
    );
  });

  it('falls back to ffmpeg on PATH when the bundled build is missing', () => {
    expect(resolveFfmpegPath({ envPath: '', cwd, platform: 'linux', exists: () => false })).toBe(
      'ffmpeg',
    );
  });

  it('looks for ffmpeg.exe on Windows', () => {
    expect(bundledFfmpegPath('C:\\app', 'win32').endsWith('ffmpeg.exe')).toBe(true);
  });
});

describe('bundled ffmpeg-static build', () => {
  const path = bundledFfmpegPath(process.cwd(), process.platform);

  it('is installed with the app dependencies', () => {
    expect(existsSync(path)).toBe(true);
  });

  it('has every filter and encoder the render plan uses', () => {
    const filters = execFileSync(path, ['-hide_banner', '-filters'], { encoding: 'utf8' });
    for (const f of ['zoompan', 'xfade', 'subtitles', 'scale', 'crop', 'setpts', 'concat']) {
      expect(filters).toMatch(new RegExp(`\\s${f}\\s`));
    }
    const encoders = execFileSync(path, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
    expect(encoders).toMatch(/\slibx264\s/);
    expect(encoders).toMatch(/\saac\s/);
  });

  // The production binary is newer than most dev machines' ffmpeg. ffmpeg 7
  // refused the AI-clip → crossfade graph ("frame rate (1/0)") that 6.x accepted.
  it('renders a still → AI clip crossfade (the production binary)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'render-bundled-'));
    const ff = (...args: string[]) =>
      execFileSync(path, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
    const image = join(dir, 'a.png');
    ff('-f', 'lavfi', '-i', 'color=c=blue:s=360x640:d=1', '-frames:v', '1', image);
    const clip = join(dir, 'b.mp4');
    ff('-f', 'lavfi', '-i', 'testsrc=s=360x640:r=24:d=1', '-pix_fmt', 'yuv420p', clip);
    const voice = join(dir, 'v.mp3');
    ff('-f', 'lavfi', '-i', 'sine=frequency=330:duration=2', voice);
    const outputPath = join(dir, 'out.mp4');

    await renderWithFfmpeg({
      clips: [
        { kind: 'still', imageUrl: 'x', motion: 'push-in', startMs: 0, durationMs: 1000 },
        {
          kind: 'video',
          videoUrl: 'y',
          startMs: 1000,
          durationMs: 1000,
          sourceDurationMs: 800, // slowed to fill its slot: the setpts path
        },
      ],
      clipPaths: [image, clip],
      voiceoverPath: voice,
      words: [{ word: 'hi', startMs: 0, endMs: 500 }],
      brandWatermark: false,
      workDir: dir,
      outputPath,
      ffmpegPath: path,
    });
    expect(new TextDecoder().decode(readFileSync(outputPath).subarray(4, 8))).toBe('ftyp');
  }, 60_000);
});

/** App Router route path for a `route.ts` under src/app (e.g. `/api/jobs`). */
function routesThatRender(dir = join(process.cwd(), 'src', 'app')): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return routesThatRender(full);
    if (name !== 'route.ts') return [];
    const source = readFileSync(full, 'utf8');
    if (!/from '@\/features\/render\/orchestrator'/.test(source)) return [];
    const rel = relative(join(process.cwd(), 'src', 'app'), dir)
      .split(sep)
      .join('/');
    return [`/${rel}`];
  });
}

describe('next.config output tracing', () => {
  it('ships the ffmpeg binary with every route that drives the render pipeline', () => {
    const includes = nextConfig.outputFileTracingIncludes ?? {};
    const routes = routesThatRender();
    expect(routes).toContain('/api/jobs');
    for (const route of routes) {
      expect(includes[route], route).toContain('./node_modules/ffmpeg-static/ffmpeg');
    }
  });
});
