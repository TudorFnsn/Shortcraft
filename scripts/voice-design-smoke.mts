/**
 * Voice Design live check (Voice Studio V4): designs 3 samples from a
 * description, saves the first as a voice in our ElevenLabs account, speaks
 * one line with it, then deletes it again (so no custom-voice slot is kept).
 * Writes the samples to `tmp/voice-design/` to listen to (not committed).
 *
 * Needs a key with "Text to Voice" and "Voices: write" (plus "Text to Speech").
 * Cost: one design round (~$0.02–0.03) + one short line. No database, no credits.
 * Run: npx tsx scripts/voice-design-smoke.mts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = resolve('.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    const value = m?.[2]?.replace(/^(['"])(.*)\1$/, '$2');
    if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

const { createElevenLabsVoiceDesigner } =
  await import('@/features/providers/live/elevenlabs-voice-design');
const { ELEVENLABS_MODEL } = await import('@/features/providers/live/elevenlabs-voice');

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set (.env.local)');

const description =
  'A warm, older British storyteller with a slow, slightly gravelly voice, calm and confident.';
const designer = createElevenLabsVoiceDesigner({ apiKey: () => apiKey });
const outDir = resolve('tmp/voice-design');
mkdirSync(outDir, { recursive: true });

console.log('1/4 designing 3 samples…');
const t0 = Date.now();
const { samples } = await designer.design(description);
samples.forEach((s, i) => {
  const b64 = s.audioDataUrl.split(',')[1] ?? '';
  writeFileSync(resolve(outDir, `sample-${i}.mp3`), Buffer.from(b64, 'base64'));
});
console.log(`    ✓ ${samples.length} samples in ${Date.now() - t0} ms → tmp/voice-design/`);

console.log('2/4 saving sample 0 as a voice…');
const voiceId = await designer.save(samples[0]!.generatedVoiceId, 'Shortcraft smoke', description);
console.log(`    ✓ saved (${voiceId})`);

let failed = false;
try {
  console.log('3/4 speaking a line with it…');
  const tts = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`,
    {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'This is my new Shortcraft voice.',
        model_id: ELEVENLABS_MODEL,
      }),
    },
  );
  if (!tts.ok) throw new Error(`HTTP ${tts.status} ${(await tts.text()).slice(0, 200)}`);
  writeFileSync(resolve(outDir, 'saved-voice.mp3'), Buffer.from(await tts.arrayBuffer()));
  console.log('    ✓ tmp/voice-design/saved-voice.mp3');
} catch (e) {
  failed = true;
  console.error(`    ✗ ${String(e)}`);
} finally {
  console.log('4/4 deleting the voice…');
  await designer.remove(voiceId);
  console.log('    ✓ deleted (slot freed)');
}
if (failed) process.exit(1);
console.log('\nVoice Design works end to end.');
