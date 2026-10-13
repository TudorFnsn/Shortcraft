/**
 * Voice previews (Voice Studio V1): records one short sample per catalog voice
 * into `public/voices/<slug>.mp3`, so the Voice sheet can play them without ever
 * calling the API. Commit the MP3s it writes. A successful sample also
 * proves the voice id still exists. It uses only text-to-speech, so a key
 * restricted to "Text to Speech" is enough (no "Voices: read" permission).
 *
 * Cost: ~60 characters per voice × 8 voices ≈ $0.03 (Flash rates).
 * Run: npx tsx scripts/voice-previews.mts   (needs ELEVENLABS_API_KEY in .env.local;
 *      exits 1 and names any voice ElevenLabs no longer has)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = resolve('.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    // Strip optional surrounding quotes: KEY="value" → value.
    const value = m?.[2]?.replace(/^(['"])(.*)\1$/, '$2');
    if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

const { VOICES } = await import('@/config/voices');
const { ELEVENLABS_MODEL } = await import('@/features/providers/live/elevenlabs-voice');

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set (.env.local)');

const API = 'https://api.elevenlabs.io/v1';
const outDir = resolve('public/voices');
mkdirSync(outDir, { recursive: true });

const missing: string[] = [];
let keyRejected = false;
for (const v of VOICES) {
  const tts = await fetch(`${API}/text-to-speech/${v.providerVoiceId}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      text: `Hi, I'm ${v.name}. Here's a fact you probably didn't know.`,
      model_id: ELEVENLABS_MODEL,
    }),
  });
  if (tts.status === 401) {
    // Bad key or a key without the Text to Speech permission: no voice can pass.
    keyRejected = true;
    console.error(`✗ ElevenLabs rejected the API key (401): ${(await tts.text()).slice(0, 200)}`);
    break;
  }
  if (!tts.ok) {
    missing.push(
      `${v.id} (${v.providerVoiceId}): HTTP ${tts.status} ${(await tts.text()).slice(0, 160)}`,
    );
    continue;
  }
  const file = resolve(outDir, `${v.id}.mp3`);
  writeFileSync(file, Buffer.from(await tts.arrayBuffer()));
  console.log(`✓ ${v.id.padEnd(8)} ${v.character.padEnd(20)} → public/voices/${v.id}.mp3`);
}

if (keyRejected) {
  console.error(
    '\nThe voices were not tested. Check ELEVENLABS_API_KEY in .env.local: the full key, no extra' +
      ' spaces, and (for a restricted key) the "Text to Speech" permission enabled.',
  );
  process.exit(1);
}
if (missing.length > 0) {
  console.error(
    `\n✗ ${missing.length} voice(s) failed (404 = voice no longer exists); replace them in src/config/voices.ts:`,
  );
  for (const m of missing) console.error(`  - ${m}`);
  process.exit(1);
}
console.log(`\nAll ${VOICES.length} voices OK. Commit public/voices/*.mp3.`);
