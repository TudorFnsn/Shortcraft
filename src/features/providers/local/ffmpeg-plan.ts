/**
 * In-house render plan: turns a RenderInput into one ffmpeg invocation.
 *
 * Replaces a hosted render API (~$0.30/video) with ffmpeg on our own serverless
 * compute (~$0.01). Pure: no I/O, no process spawning — the caller downloads
 * the assets to local paths, writes the subtitle file, and runs the args (see
 * `ffmpeg-render.ts`). Keeping the plan pure is what makes it unit-testable.
 *
 * One pass does everything: per-scene video (stills get a Ken Burns zoompan,
 * AI clips get scaled/cropped/padded to their slot), concat, burned-in captions
 * (ASS), voiceover, H.264/AAC MP4 with faststart for instant playback.
 *
 * Every render is labelled as AI-generated, visibly (a corner tag on every
 * frame, drawn from the same ASS file as the captions) and in the MP4 metadata
 * (EU AI Act Art. 50 transparency; TikTok/YouTube/Meta AI-content policies).
 */
import type { RenderClip, StillMotion, WordTiming } from '../types';

export const OUTPUT_WIDTH = 1080;
export const OUTPUT_HEIGHT = 1920;
export const OUTPUT_FPS = 30;
/** How far a still zooms over its scene. Subtle reads as "cinematic", not "seasick". */
const ZOOM = 0.15;

/** Visible on-frame disclosure. Short so it stays legible at phone size. */
export const AI_LABEL_TEXT = 'AI-generated';
/** Machine-readable disclosure written to the MP4's metadata (iTunes-style tags). */
export const AI_METADATA = {
  comment: 'AI-generated video made with Shortcraft',
  description: 'This video was generated with AI (script, images, voice). Created with Shortcraft.',
} as const;

export interface RenderPlanInput {
  clips: readonly RenderClip[];
  /** Local path per clip, same order as `clips` (an image for stills, a video otherwise). */
  clipPaths: readonly string[];
  voiceoverPath: string;
  /**
   * Local path of the ASS overlay file (see `buildAssSubtitles`): captions plus
   * the AI-generated label. Required, so no render can ship unlabelled.
   */
  subtitlesPath: string;
  outputPath: string;
}

export interface RenderPlan {
  args: string[];
  durationSec: number;
}

const frames = (ms: number): number => Math.max(1, Math.round((ms / 1000) * OUTPUT_FPS));

/** zoompan expressions for a camera move over `n` output frames. */
export function zoompanExpr(motion: StillMotion, n: number): { z: string; x: string; y: string } {
  const t = `on/${n}`; // 0 → 1 across the scene
  const centerX = 'iw/2-(iw/zoom/2)';
  const centerY = 'ih/2-(ih/zoom/2)';
  switch (motion) {
    case 'push-in':
      return { z: `1+${ZOOM}*${t}`, x: centerX, y: centerY };
    case 'pull-out':
      return { z: `${1 + ZOOM}-${ZOOM}*${t}`, x: centerX, y: centerY };
    case 'pan-left':
      return { z: `${1 + ZOOM}`, x: `(iw-iw/zoom)*(1-${t})`, y: centerY };
    case 'pan-right':
      return { z: `${1 + ZOOM}`, x: `(iw-iw/zoom)*${t}`, y: centerY };
  }
}

function clipFilter(clip: RenderClip, input: number): string {
  const W = OUTPUT_WIDTH;
  const H = OUTPUT_HEIGHT;
  const fit = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`;
  const tail = `setsar=1,format=yuv420p[v${input}]`;
  if (clip.kind === 'still') {
    const n = frames(clip.durationMs);
    const { z, x, y } = zoompanExpr(clip.motion, n);
    // Upscale 2x before zoompan: it works in whole pixels, so this removes jitter.
    return (
      `[${input}:v]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,` +
      `crop=${W * 2}:${H * 2},zoompan=z='${z}':x='${x}':y='${y}':d=${n}:s=${W}x${H}:fps=${OUTPUT_FPS},` +
      tail
    );
  }
  // AI clip: fit the frame, hold the last frame if it's short, cut to the slot.
  const sec = (clip.durationMs / 1000).toFixed(3);
  return (
    `[${input}:v]${fit},fps=${OUTPUT_FPS},tpad=stop_mode=clone:stop_duration=${sec},` +
    `trim=duration=${sec},setpts=PTS-STARTPTS,${tail}`
  );
}

/**
 * Quote a path for a filtergraph option. Inside '…' the separators (: , ;) are
 * literal; a quote or backslash can't be expressed safely, so refuse those —
 * the renderer controls its temp paths, so this never fires in practice.
 */
export function quoteFilterPath(path: string): string {
  if (/['\\]/.test(path)) throw new Error(`unsafe path for ffmpeg filter: ${path}`);
  return `'${path}'`;
}

export function buildFfmpegPlan(input: RenderPlanInput): RenderPlan {
  const { clips, clipPaths } = input;
  if (clips.length === 0) throw new Error('render needs at least one clip');
  if (clipPaths.length !== clips.length) {
    throw new Error(`expected ${clips.length} clip paths, got ${clipPaths.length}`);
  }

  const durationMs = clips.reduce((sum, c) => sum + c.durationMs, 0);
  const inputs = clipPaths.flatMap((p) => ['-i', p]);
  const audioIndex = clips.length;

  const filters = clips.map((c, i) => clipFilter(c, i));
  const labels = clips.map((_, i) => `[v${i}]`).join('');
  filters.push(
    `${labels}concat=n=${clips.length}:v=1:a=0,ass=${quoteFilterPath(input.subtitlesPath)}[vout]`,
  );

  const durationSec = durationMs / 1000;
  return {
    durationSec,
    args: [
      '-hide_banner',
      '-y',
      ...inputs,
      '-i',
      input.voiceoverPath,
      '-filter_complex',
      filters.join(';'),
      '-map',
      '[vout]',
      '-map',
      `${audioIndex}:a`,
      '-t',
      durationSec.toFixed(3),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      ...Object.entries(AI_METADATA).flatMap(([key, value]) => ['-metadata', `${key}=${value}`]),
      '-movflags',
      '+faststart',
      input.outputPath,
    ],
  };
}

/* ---------------------------------------------------------------------------
 * Captions: short, bold, centred word groups (the short-form standard).
 * ------------------------------------------------------------------------- */

/** Words shown together on screen. */
export const WORDS_PER_CAPTION = 3;

function assTime(ms: number): string {
  const cs = Math.max(0, Math.round(ms / 10));
  const h = Math.floor(cs / 360_000);
  const m = Math.floor((cs % 360_000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${h}:${pad(m)}:${pad(s)}.${pad(c)}`;
}

/** Strip characters ASS treats as markup so narration can't inject styling. */
const assText = (text: string): string =>
  text
    .replace(/[{}\\]/g, '')
    .replace(/\r?\n/g, ' ')
    .trim();

/**
 * The video's overlay: word-group captions plus the AI-generated label, shown
 * from the first frame to `durationMs`. With no words it is just the label.
 */
export function buildAssSubtitles(words: readonly WordTiming[], durationMs: number): string {
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${OUTPUT_WIDTH}`,
    `PlayResY: ${OUTPUT_HEIGHT}`,
    'WrapStyle: 0',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Default,DejaVu Sans,96,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,6,2,2,80,80,520,1',
    // Top-right, small, slightly translucent; clear of the platforms' top tabs.
    'Style: Label,DejaVu Sans,40,&H33FFFFFF,&H33FFFFFF,&H66000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,9,48,48,140,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const events = [
    `Dialogue: 1,${assTime(0)},${assTime(durationMs)},Label,,0,0,0,,${AI_LABEL_TEXT}`,
  ];
  for (let i = 0; i < words.length; i += WORDS_PER_CAPTION) {
    const group = words.slice(i, i + WORDS_PER_CAPTION);
    const first = group[0];
    const last = group[group.length - 1];
    if (!first || !last) continue;
    const text = assText(group.map((w) => w.word).join(' ')).toUpperCase();
    if (!text) continue;
    events.push(
      `Dialogue: 0,${assTime(first.startMs)},${assTime(last.endMs)},Default,,0,0,0,,${text}`,
    );
  }
  return [...header, ...events, ''].join('\n');
}
