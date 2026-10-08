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
import { siteConfig } from '@/config/site';
import type { RenderClip, StillMotion, WordTiming } from '../types';

export const OUTPUT_WIDTH = 1080;
export const OUTPUT_HEIGHT = 1920;
export const OUTPUT_FPS = 30;
/**
 * How far a still zooms over its scene. 0.15 read as a static slideshow on a
 * phone; 0.25 with easing feels like a camera move without turning seasick.
 */
const ZOOM = 0.25;
/** Crossfade between scenes. Short enough to keep short-form pacing. */
export const TRANSITION_MS = 400;
/** Most an AI clip is slowed to fill its slot before the last frame is held instead. */
const MAX_SLOWDOWN = 1.5;

/** Visible on-frame disclosure. Short so it stays legible at phone size. */
export const AI_LABEL_TEXT = 'AI-generated';
/** Free-trial watermark, under the AI label. Paid videos never carry it. */
export const BRAND_WATERMARK_TEXT = `Made with ${siteConfig.name}`;
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
  // 0 → 1 across the scene, eased (smoothstep): the camera accelerates in and
  // settles out instead of moving at a constant, mechanical speed.
  const p = `min(on/${n},1)`;
  const t = `(3*pow(${p},2)-2*pow(${p},3))`;
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

/**
 * One scene → a labelled video stream of `renderMs` (its slot, plus the
 * crossfade overlap for every scene but the last).
 */
function clipFilter(clip: RenderClip, input: number, renderMs: number): string {
  const W = OUTPUT_WIDTH;
  const H = OUTPUT_HEIGHT;
  const fit = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`;
  const tail = `setsar=1,format=yuv420p[v${input}]`;
  if (clip.kind === 'still') {
    const n = frames(renderMs);
    const { z, x, y } = zoompanExpr(clip.motion, n);
    // Upscale 2x before zoompan: it works in whole pixels, so this removes jitter.
    return (
      `[${input}:v]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,` +
      `crop=${W * 2}:${H * 2},zoompan=z='${z}':x='${x}':y='${y}':d=${n}:s=${W}x${H}:fps=${OUTPUT_FPS},` +
      tail
    );
  }
  // AI clip: fit the frame; if it's shorter than the slot, slow it down (up to
  // MAX_SLOWDOWN) rather than freezing on the last frame; then cut to the slot.
  const sec = (renderMs / 1000).toFixed(3);
  const slow = clip.sourceDurationMs
    ? Math.min(MAX_SLOWDOWN, Math.max(1, renderMs / clip.sourceDurationMs))
    : 1;
  const stretch = slow > 1 ? `setpts=${slow.toFixed(4)}*(PTS-STARTPTS),` : '';
  return (
    `[${input}:v]${stretch}${fit},fps=${OUTPUT_FPS},tpad=stop_mode=clone:stop_duration=${sec},` +
    `trim=duration=${sec},setpts=PTS-STARTPTS,${tail}`
  );
}

/**
 * Join the scene streams with crossfades. Each scene but the last is rendered
 * TRANSITION_MS longer, and each fade starts at its scene boundary, so the
 * total stays the sum of the slots and the cuts stay in sync with the voice.
 */
function joinFilter(clips: readonly RenderClip[], tail: string): string[] {
  if (clips.length === 1) return [`[v0]${tail}`];
  const fade = (TRANSITION_MS / 1000).toFixed(3);
  const steps: string[] = [];
  let prev = '[v0]';
  let boundaryMs = 0;
  clips.slice(1).forEach((_, k) => {
    boundaryMs += clips[k]?.durationMs ?? 0;
    const isLast = k === clips.length - 2;
    const label = `[x${k + 1}]`;
    const offset = (boundaryMs / 1000).toFixed(3);
    steps.push(
      `${prev}[v${k + 1}]xfade=transition=fade:duration=${fade}:offset=${offset}` +
        (isLast ? `,${tail}` : label),
    );
    prev = label;
  });
  return steps;
}

/**
 * Quote a path for a filtergraph option. ffmpeg unescapes twice: the graph
 * parser strips the '…' (so , ; [ ] are literal inside), then the filter's
 * option parser still splits on ':' — so ':' is escaped as '\:' (needed for
 * Windows drive letters, `C\:/…`). Windows '\' separators become '/', which
 * ffmpeg accepts there. A quote can't be expressed safely, so refuse it — the
 * renderer controls its temp paths, so this never fires in practice.
 */
export function quoteFilterPath(path: string): string {
  if (path.includes("'")) throw new Error(`unsafe path for ffmpeg filter: ${path}`);
  return `'${path.replaceAll('\\', '/').replaceAll(':', '\\:')}'`;
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

  const last = clips.length - 1;
  const filters = clips.map((c, i) =>
    clipFilter(c, i, c.durationMs + (i < last ? TRANSITION_MS : 0)),
  );
  filters.push(...joinFilter(clips, `ass=${quoteFilterPath(input.subtitlesPath)}[vout]`));

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
      // Crisper than the old veryfast/23: platforms re-encode, so start clean.
      '-preset',
      'faster',
      '-crf',
      '20',
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

export interface OverlayOptions {
  /** Add the "Made with Shortcraft" watermark (free-trial videos only). */
  brandWatermark: boolean;
}

/**
 * The video's overlay: word-group captions plus the AI-generated label (and,
 * on free-trial videos, the brand watermark under it), shown from the first
 * frame to `durationMs`. With no words it is just the label(s).
 */
export function buildAssSubtitles(
  words: readonly WordTiming[],
  durationMs: number,
  options: OverlayOptions,
): string {
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
    // Just under the label, a touch larger: legible enough to send viewers our way.
    'Style: Brand,DejaVu Sans,48,&H1AFFFFFF,&H1AFFFFFF,&H66000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,9,48,48,196,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const events = [
    `Dialogue: 1,${assTime(0)},${assTime(durationMs)},Label,,0,0,0,,${AI_LABEL_TEXT}`,
  ];
  if (options.brandWatermark) {
    events.push(
      `Dialogue: 1,${assTime(0)},${assTime(durationMs)},Brand,,0,0,0,,${BRAND_WATERMARK_TEXT}`,
    );
  }
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
