/**
 * Live smoke test against the real Supabase project.
 * Creates a throwaway user, runs a full render job through the actual
 * SupabaseStore + orchestrator, checks the DB rows + credit ledger, cleans up.
 *
 * Run: npx tsx scripts/smoke.mts   (loads .env.local itself)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env.local into process.env BEFORE importing app modules (env validates on import).
for (const line of readFileSync(resolve('.env.local'), 'utf8').split(/\r?\n/)) {
  if (line.trim().startsWith('#')) continue;
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const { getStore, isSupabaseConfigured } = await import('@/features/render/store');
const { runRenderJob } = await import('@/features/render/orchestrator');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

console.log('supabase configured (service role present):', isSupabaseConfigured());
if (!isSupabaseConfigured()) throw new Error('service role not configured — check .env.local');

const admin = createSupabaseAdminClient();
const email = `smoke+${Date.now()}@example.com`;
const { data: created, error: cErr } = await admin.auth.admin.createUser({
  email,
  password: 'smoke-test-123456',
  email_confirm: true,
});
if (cErr) throw cErr;
const userId = created.user!.id;
console.log('created user:', userId);

await new Promise((r) => setTimeout(r, 1500)); // let handle_new_user trigger run

const store = getStore();
const before = await store.balance(userId);
console.log('trial balance:', before);

const job = await store.createJob({
  userId,
  topic: 'a cat who secretly runs a coffee shop',
  themeId: 'office-drama',
  targetDurationSec: 12,
  language: 'en',
  modelTier: 'standard',
});
console.log('job created:', job.id, '/', job.status);

const res = await runRenderJob({ repo: store, credits: store, plans: store }, job.id);
const after = await store.balance(userId);
const scenes = await store.listScenes(job.id);

if (res.ok) {
  const j = res.value;
  console.log('RESULT: OK');
  console.log('  status:', j.status, '| title:', j.title);
  console.log(
    '  scenes:',
    scenes.length,
    '| all have video:',
    scenes.every((s) => !!s.videoUrl),
  );
  console.log('  output asset:', j.outputAssetUrl);
  console.log(
    '  estimated:',
    j.estimatedCredits,
    '| actual:',
    j.actualCredits,
    '| apiCostUsd:',
    j.apiCostUsd,
  );
  console.log(
    '  balance:',
    before,
    '->',
    after,
    '| expected:',
    before - j.actualCredits,
    '|',
    after === before - j.actualCredits ? 'PASS ✅' : 'FAIL ❌',
  );
} else {
  console.log('RESULT: ERROR', res.error);
}

const { data: txs } = await admin
  .from('credit_transactions')
  .select('delta,reason,created_at')
  .eq('user_id', userId)
  .order('created_at', { ascending: true });
console.log('  ledger:', (txs ?? []).map((t) => `${t.reason}:${t.delta}`).join('  '));

const { data: assets } = await admin.from('assets').select('kind,url').eq('user_id', userId);
console.log('  assets:', assets);

await admin.auth.admin.deleteUser(userId);
console.log('cleaned up user (cascade removed job/scenes/credits/assets)');
