/**
 * Live provider smoke test: one real script (Claude), one real voiceover
 * (ElevenLabs) and one real scene image (FLUX schnell on fal.ai), no database,
 * no Supabase Storage. Costs about $0.03.
 *
 * Needs ANTHROPIC_API_KEY and ELEVENLABS_API_KEY in .env.local; FAL_KEY too for
 * the image step (skipped when it's missing).
 * Writes the MP3, image + script JSON to ./live-smoke/ so you can check them.
 *
 * Run: npx tsx scripts/live-providers-smoke.mts ["your topic"]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

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

const outDir = resolve('live-smoke');
const fileStore = {
  async put(path: string, bytes: Uint8Array) {
    const file = join(outDir, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes);
    return `file://${file}`;
  },
};

const topic = process.argv[2] ?? 'Why octopuses have three hearts';
const script = createAnthropicScriptProvider(getModel('script-default'));
const voice = createElevenLabsVoiceProvider(getModel('voice-default'), {
  apiKey: () => requireEnv('ELEVENLABS_API_KEY'),
  store: () => fileStore,
  voiceId: env.ELEVENLABS_VOICE_ID,
});

console.log(`1/3 script for "${topic}" ...`);
const s = await script.run(
  { topic, themeId: 'fun-facts', targetDurationSec: 15, language: 'en' },
  { idempotencyKey: 'smoke:script' },
);
if (s.kind !== 'completed') throw new Error('unexpected async script result');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'script.json'), JSON.stringify(s.output, null, 2));
console.log(`   "${s.output.title}", ${s.output.scenes.length} scenes, $${s.costUsd.toFixed(4)}`);

console.log('2/3 voiceover ...');
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
const firstScene = s.output.scenes[0];
if (env.FAL_KEY && firstScene) {
  console.log('3/3 scene image ...');
  const image = createFalImageProvider(getModel('image-standard'), {
    apiKey: () => requireEnv('FAL_KEY'),
    store: () => fileStore,
  });
  const i = await image.run(
    { prompt: firstScene.imagePrompt, aspectRatio: '9:16' },
    { idempotencyKey: 'smoke:image' },
  );
  if (i.kind !== 'completed') throw new Error('unexpected async image result');
  total += i.costUsd;
  console.log(
    `   ${i.output.width}x${i.output.height}, $${i.costUsd.toFixed(4)}: ${i.output.imageUrl}`,
  );
} else {
  console.log('3/3 scene image skipped (set FAL_KEY to run it)');
}

console.log(`\nOK. Total $${total.toFixed(4)}. Files in ${outDir}/`);
console.log(`Listen: ${v.output.audioUrl}`);
