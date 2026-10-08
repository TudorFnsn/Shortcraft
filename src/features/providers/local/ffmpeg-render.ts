/**
 * Executes a render plan with a local ffmpeg binary (server-only).
 *
 * Inputs must already be on local disk; fetching provider assets and uploading
 * the result belong to the live render adapter, which lands with media storage
 * (Phase 2, R2). `npx tsx scripts/render-smoke.mts` exercises this end to end.
 */
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RenderClip, WordTiming } from '../types';
import { buildAssSubtitles, buildFfmpegPlan } from './ffmpeg-plan';

export interface LocalRenderInput {
  clips: readonly RenderClip[];
  clipPaths: readonly string[];
  voiceoverPath: string;
  words: readonly WordTiming[];
  /** Scratch directory for the caption/label overlay file. */
  workDir: string;
  outputPath: string;
  ffmpegPath?: string;
}

export async function renderWithFfmpeg(input: LocalRenderInput): Promise<{ durationSec: number }> {
  // Always written: even a caption-less video carries the AI-generated label.
  const durationMs = input.clips.reduce((sum, c) => sum + c.durationMs, 0);
  const subtitlesPath = join(input.workDir, 'captions.ass');
  await writeFile(subtitlesPath, buildAssSubtitles(input.words, durationMs), 'utf8');
  const plan = buildFfmpegPlan({
    clips: input.clips,
    clipPaths: input.clipPaths,
    voiceoverPath: input.voiceoverPath,
    subtitlesPath,
    outputPath: input.outputPath,
  });

  await new Promise<void>((resolve, reject) => {
    // A runtime binary path, not a project file: keep Turbopack from tracing the repo.
    const proc = spawn(/*turbopackIgnore: true*/ input.ffmpegPath ?? 'ffmpeg', plan.args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000); // keep the tail for errors
    });
    proc.on('error', reject);
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr}`)),
    );
  });
  return { durationSec: plan.durationSec };
}
