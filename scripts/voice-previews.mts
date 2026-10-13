/**
 * Voice previews (Voice Studio V1): checks that every catalog voice still
 * exists at ElevenLabs, then records one short sample per voice into
 * `public/voices/<slug>.mp3`, so the Voice sheet can play them without ever
 * calling the API. Commit the MP3s it writes.
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
    if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
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
for (const v of VOICES) {
  const check = await fetch(`${API}/voices/${v.providerVoiceId}`, {
    headers: { 'xi-api-key': apiKey },
  });
  if (!check.ok) {
    missing.push(`${v.id} (${v.providerVoiceId}): HTTP ${check.status}`);
    continue;
  }
  const tts = await fetch(`${API}/text-to-speech/${v.providerVoiceId}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      text: `Hi, I'm ${v.name}. Here's a fact you probably didn't know.`,
      model_id: ELEVENLABS_MODEL,
    }),
  });
  if (!tts.ok) {
    missing.push(`${v.id}: TTS HTTP ${tts.status} ${(await tts.text()).slice(0, 120)}`);
    continue;
  }
  const file = resolve(outDir, `${v.id}.mp3`);
  writeFileSync(file, Buffer.from(await tts.arrayBuffer()));
  console.log(`✓ ${v.id.padEnd(8)} ${v.character.padEnd(20)} → public/voices/${v.id}.mp3`);
}

if (missing.length > 0) {
  console.error(`\n✗ ${missing.length} voice(s) failed; replace them in src/config/voices.ts:`);
  for (const m of missing) console.error(`  - ${m}`);
  process.exit(1);
}
console.log(`\nAll ${VOICES.length} voices OK. Commit public/voices/*.mp3.`);
