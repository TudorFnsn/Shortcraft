import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every SECURITY DEFINER function bypasses RLS, and Supabase grants EXECUTE on
 * new functions to anon + authenticated, which exposes them as public RPCs. So a
 * definer function must be revoked from those roles in some migration, or any
 * signed-in user could call it (e.g. mint credits via add_credits).
 */
const dir = join(process.cwd(), 'supabase', 'migrations');
const sql = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(dir, f), 'utf8'))
  .join('\n');

// Trigger functions can't be called over RPC.
const definerFunctions = [
  ...sql.matchAll(
    /create\s+or\s+replace\s+function\s+public\.(\w+)\s*\([^)]*\)\s*returns\s+(\w+)[\s\S]*?\$\$/gi,
  ),
]
  .filter((m) => m[2]!.toLowerCase() !== 'trigger')
  .filter((m) => /security\s+definer/i.test(m[0]))
  .map((m) => m[1]!);

describe('migrations', () => {
  it('define the credit functions as SECURITY DEFINER', () => {
    expect(definerFunctions).toEqual(
      expect.arrayContaining(['reserve_credits', 'add_credits', 'grant_credits_once']),
    );
  });

  it.each(definerFunctions)('revoke %s from anon and authenticated', (fn) => {
    const revoke = new RegExp(
      `revoke\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\s*\\([^)]*\\)\\s+from\\s+([^;]+);`,
      'i',
    );
    const roles = sql.match(revoke)?.[1] ?? '';
    expect(roles).toMatch(/\banon\b/);
    expect(roles).toMatch(/\bauthenticated\b/);
    expect(roles).toMatch(/\bpublic\b/);
  });
});
