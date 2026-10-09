/**
 * Live provider smoke test: one real script (Claude), one real voiceover
 * (ElevenLabs), one real image per scene (FLUX schnell on fal.ai), then the
 * in-house renderer stitches them into a finished Standard MP4 (Ken Burns
 * stills + voiceover + captions). No database, no Supabase Storage. Costs
 * about $0.04.
 *
 * Needs ANTHROPIC_API_KEY and ELEVENLABS_API_KEY in .env.local; FAL_KEY too for
 * the image + render steps (skipped when it's missing); ffmpeg on PATH (or
 * FFMPEG_PATH) for the render.
 * Writes the MP3, images, script JSON and final.mp4 to ./live-smoke/.
 *
 * Run: npx tsx scripts/live-providers-smoke.mts ["your topic"] [--premium | --premium-all]
 *   --premium      AI video (fal image-to-video) on the first scene, stills for the rest (~$0.35 more)
 *   --premium-all  AI video on every scene (~$0.35 per scene)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Load .env.local into process.env BEFORE importing app modules (env validates on import).
if (existsSync('.env.local')) {
  for (const line of readFileSync(resolve('.env.local'), 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const { getModel } = await import('@/config/models');
const { requireEnv, env } = await import('@/lib/env');
const { createAnthropicScriptProvider } =
  await import('@/features/providers/live/anthropic-script');
const { createElevenLabsVoiceProvider } =
  await import('@/features/providers/live/elevenlabs-voice');
const { createFalImageProvider } = await import('@/features/providers/live/fal-image');
const { createFalVideoProvider } = await import('@/features/providers/live/fal-video');
const { createInhouseRenderProvider } = await import('@/features/providers/live/inhouse-render');
const { createKenBurnsProvider } = await import('@/features/providers/local/ken-burns');
const { resolveFfmpegPath } = await import('@/features/providers/local/ffmpeg-binary');
type RenderClip = import('@/features/providers/types').RenderClip;

const outDir = resolve('live-smoke');
const fileStore = {
  async put(path: string, bytes: Uint8Array) {
    const file = join(outDir, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes);
    return pathToFileURL(file).href;
  },
  async signedUrl(path: string) {
    return pathToFileURL(join(outDir, path)).href;
  },
};

const args = process.argv.slice(2);
const topic = args.find((a) => !a.startsWith('--')) ?? 'Why octopuses have three hearts';
const premium = args.includes('--premium-all') ? 'all' : args.includes('--premium') ? 'hero' : null;
const script = createAnthropicScriptProvider(getModel('script-default'));
const voice = createElevenLabsVoiceProvider(getModel('voice-default'), {
  apiKey: () => requireEnv('ELEVENLABS_API_KEY'),
  store: () => fileStore,
  voiceId: env.ELEVENLABS_VOICE_ID,
});

console.log(`1/4 script for "${topic}" ...`);
const s = await script.run(
  { topic, themeId: 'fun-facts', targetDurationSec: 15, language: 'en' },
  { idempotencyKey: 'smoke:script' },
);
if (s.kind !== 'completed') throw new Error('unexpected async script result');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'script.json'), JSON.stringify(s.output, null, 2));
console.log(`   "${s.output.title}", ${s.output.scenes.length} scenes, $${s.costUsd.toFixed(4)}`);

console.log('2/4 voiceover ...');
const text = s.output.scenes.map((x) => x.narration).join(' ');
const v = await voice.run(
  { text, voiceId: 'default', language: 'en' },
  { idempotencyKey: 'smoke:voice' },
);
if (v.kind !== 'completed') throw new Error('unexpected async voice result');
console.log(
  `   ${(v.output.durationMs / 1000).toFixed(1)}s audio, ${v.output.words.length} timed words, $${v.costUsd.toFixed(4)}`,
);

let total = s.costUsd + v.costUsd;
let finalUrl: string | null = null;
if (env.FAL_KEY && s.output.scenes.length > 0) {
  console.log(`3/4 scene images (${s.output.scenes.length})${premium ? ' + AI video' : ''} ...`);
  const image = createFalImageProvider(getModel('image-standard'), {
    apiKey: () => requireEnv('FAL_KEY'),
    store: () => fileStore,
  });
  const kenBurns = createKenBurnsProvider(getModel('video-standard'));
  const aiVideo = createFalVideoProvider(getModel('video-premium'), {
    apiKey: () => requireEnv('FAL_KEY'),
    store: () => fileStore,
    wait: true, // no orchestrator here: wait for each clip inside run()
    ...(env.FAL_VIDEO_MODEL ? { falModel: env.FAL_VIDEO_MODEL } : {}),
  });
  // fal can't fetch our local file:// images; send them inline (the app uses signed https URLs).
  const dataUri = (fileUrl: string) =>
    `data:image/jpeg;base64,${readFileSync(fileURLToPath(fileUrl)).toString('base64')}`;
  const aiScenes = new Set(
    premium === 'all' ? s.output.scenes.map((x) => x.index) : premium === 'hero' ? [0] : [],
  );
  if (aiScenes.size > 0) console.log(`   AI video on ${aiScenes.size} scene(s), in parallel`);
  const pendingClips: Promise<void>[] = [];
  const clips: RenderClip[] = [];
  let startMs = 0;
  for (const scene of s.output.scenes) {
    const i = await image.run(
      { prompt: scene.imagePrompt, aspectRatio: '9:16' },
      { idempotencyKey: `smoke:image:${scene.index}` },
    );
    if (i.kind !== 'completed') throw new Error('unexpected async image result');
    total += i.costUsd;
    const still = await kenBurns.run(
      {
        imageUrl: i.output.imageUrl,
        motionPrompt: scene.motionPrompt,
        durationSec: scene.durationSec,
      },
      { idempotencyKey: `smoke:video:${scene.index}` },
    );
    if (still.kind !== 'completed' || still.output.kind !== 'still') {
      throw new Error('unexpected Ken Burns result');
    }
    const durationMs = scene.durationSec * 1000;
    const slot = clips.length;
    clips.push({
      kind: 'still',
      imageUrl: i.output.imageUrl,
      motion: still.output.motion,
      startMs,
      durationMs,
    });
    if (aiScenes.has(scene.index)) {
      const clipStartMs = startMs;
      const imageUrl = i.output.imageUrl;
      pendingClips.push(
        (async () => {
          const started = Date.now();
          const c = await aiVideo.run(
            {
              imageUrl: dataUri(imageUrl),
              motionPrompt: scene.motionPrompt,
              durationSec: scene.durationSec,
            },
            { idempotencyKey: `smoke:clip:${scene.index}` },
          );
          if (c.kind !== 'completed' || c.output.kind !== 'video') {
            throw new Error('unexpected AI video result');
          }
          total += c.costUsd;
          clips[slot] = {
            kind: 'video',
            videoUrl: c.output.videoUrl,
            startMs: clipStartMs,
            durationMs,
            sourceDurationMs: c.output.durationSec * 1000,
          };
          console.log(
            `   AI clip ${scene.index}: ${c.output.durationSec}s in ${((Date.now() - started) / 1000).toFixed(0)}s, $${c.costUsd.toFixed(2)} — "${scene.motionPrompt}"`,
          );
        })(),
      );
    }
    startMs += durationMs;
  }
  await Promise.all(pendingClips);
  console.log(
    `   ${clips.length} scenes, images + clips $${(total - s.costUsd - v.costUsd).toFixed(4)}`,
  );

  console.log('4/4 render (in-house ffmpeg) ...');
  const render = createInhouseRenderProvider(getModel('render-default'), {
    store: () => fileStore,
    allowFileUrls: true,
    ffmpegPath: resolveFfmpegPath({ envPath: env.FFMPEG_PATH }),
  });
  const started = Date.now();
  const r = await render.run(
    {
      clips,
      voiceoverUrl: v.output.audioUrl,
      words: v.output.words,
      brandWatermark: true, // render as a free-trial video, so the watermark is visible
      subtitleStyleId: 'default',
      aspectRatio: '9:16',
    },
    { idempotencyKey: 'smoke:final' },
  );
  if (r.kind !== 'completed') throw new Error('unexpected async render result');
  total += r.costUsd;
  finalUrl = r.output.videoUrl;
  console.log(
    `   ${r.output.durationSec.toFixed(1)}s video in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
} else {
  console.log('3/4 scene images + 4/4 render skipped (set FAL_KEY to run them)');
}

console.log(`\nOK. Total $${total.toFixed(4)}. Files in ${outDir}/`);
console.log(`Listen: ${v.output.audioUrl}`);
if (finalUrl) console.log(`Watch:  ${finalUrl}`);
