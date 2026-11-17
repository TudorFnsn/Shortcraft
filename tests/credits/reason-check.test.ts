import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CREDIT_REASONS } from '@/features/credits/ledger';

/**
 * Several migrations redefine `credit_transactions.reason`'s allowed values
 * (0001 inline, then 0013 referrals and 0015 admin grants by drop + add).
 * Branches built in parallel each listed only their own new reason, so the
 * last one to run silently removed the other's (0015 dropped 'referral_bonus':
 * every referral payout would have failed). These tests keep the lists honest.
 */
const dir = join(process.cwd(), 'supabase', 'migrations');
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

/** Each reason list a migration sets, in file order. */
const lists = files.flatMap((file) => {
  const sql = readFileSync(join(dir, file), 'utf8').replace(/--.*$/gm, '');
  return [...sql.matchAll(/reason\s+in\s*\(([^)]*)\)/gi)].map((m) => ({
    file,
    reasons: [...m[1]!.matchAll(/'([a-z_]+)'/g)].map((r) => r[1]!),
  }));
});

describe('credit reason check across migrations', () => {
  it('is defined by at least the initial schema and the later redefinitions', () => {
    expect(lists.map((l) => l.file)).toEqual(
      expect.arrayContaining([
        '0001_init.sql',
        '0013_referrals.sql',
        '0015_admin_grant_reason.sql',
      ]),
    );
  });

  it('never drops a reason an earlier migration allowed', () => {
    for (let i = 1; i < lists.length; i++) {
      const earlier = new Set(lists.slice(0, i).flatMap((l) => l.reasons));
      expect({ file: lists[i]!.file, reasons: lists[i]!.reasons }).toEqual({
        file: lists[i]!.file,
        reasons: expect.arrayContaining([...earlier]),
      });
    }
  });

  it('ends on exactly the reasons the code writes, whatever order 0013/0015 ran in', () => {
    const last = lists.at(-1)!;
    expect([...last.reasons].sort()).toEqual([...CREDIT_REASONS].sort());
    for (const file of ['0013_referrals.sql', '0015_admin_grant_reason.sql']) {
      const l = lists.find((x) => x.file === file)!;
      expect([...l.reasons].sort()).toEqual([...CREDIT_REASONS].sort());
    }
  });
});
