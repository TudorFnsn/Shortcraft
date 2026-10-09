/**
 * Which ffmpeg binary the in-house renderer runs.
 *
 * Vercel functions ship no ffmpeg, so we depend on `ffmpeg-static` (a static
 * build downloaded at `npm install` for the installing platform) and
 * `next.config.ts` traces it into the routes that render. We locate the file
 * ourselves instead of importing the package: its index resolves the binary
 * from `__dirname`, which points somewhere else once bundled.
 *
 * Order: `FFMPEG_PATH` (explicit override) → the bundled static build, if
 * present → `ffmpeg` on PATH.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function bundledFfmpegPath(cwd: string, platform: NodeJS.Platform): string {
  const file = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  return join(/*turbopackIgnore: true*/ cwd, 'node_modules', 'ffmpeg-static', file);
}

export function resolveFfmpegPath(
  opts: {
    envPath?: string | undefined;
    cwd?: string;
    platform?: NodeJS.Platform;
    exists?: (path: string) => boolean;
  } = {},
): string {
  if (opts.envPath) return opts.envPath;
  const bundled = bundledFfmpegPath(opts.cwd ?? process.cwd(), opts.platform ?? process.platform);
  return (opts.exists ?? existsSync)(bundled) ? bundled : 'ffmpeg';
}
