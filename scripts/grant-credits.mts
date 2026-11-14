/**
 * Give a user credits by hand (testers, support goodwill) WITHOUT making it
 * look like a sale. Writes reason `admin_grant` (migration 0015), which reports
 * never count as revenue or conversion and which does not remove the watermark.
 *
 * Idempotent: the ledger key is `admin:<note>:<userId>`, so re-running the same
 * command grants once. Dry run by default; pass --apply to write.
 *
 * Run: npx tsx scripts/grant-credits.mts --user <uuid> --credits 10000 --note beta-tester [--apply]
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

const envFile = resolve('.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const { values } = parseArgs({
  options: {
    user: { type: 'string' },
    credits: { type: 'string' },
    note: { type: 'string' },
    apply: { type: 'boolean', default: false },
  },
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const credits = Number(values.credits);
if (!values.user || !UUID.test(values.user)) throw new Error('--user <uuid> is required');
if (!Number.isInteger(credits) || credits <= 0 || credits > 1_000_000) {
  throw new Error('--credits must be a whole number between 1 and 1,000,000');
}
if (!values.note || !/^[a-z0-9-]{3,40}$/.test(values.note)) {
  throw new Error('--note <slug> is required (3-40 chars, a-z 0-9 -), e.g. beta-tester');
}

const key = `admin:${values.note}:${values.user}`;
console.log(`Grant ${credits} credits to ${values.user} as admin_grant (key ${key})`);
if (!values.apply) {
  console.log('Dry run. Re-run with --apply to write.');
  process.exit(0);
}

const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');
const { data, error } = await createSupabaseAdminClient().rpc('grant_credits_once', {
  p_user: values.user,
  p_delta: credits,
  p_reason: 'admin_grant',
  p_key: key,
});
if (error) throw new Error(error.message);
console.log(data ? 'Granted.' : 'Already granted with this note: nothing written.');
