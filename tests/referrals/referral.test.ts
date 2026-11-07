import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLANS } from '@/config/plans';
import { REFERRAL } from '@/config/referrals';
import { TERMS } from '@/config/legal';
import { createHrefAfterLogin, loginHrefFor, readCarried } from '@/features/auth/carry';
import { loginAfterOAuthError, oauthRedirectTo, refFromNext } from '@/features/auth/oauth';
import { InMemoryCreditGrantLedger } from '@/features/billing/credit-grant';
import { PAID_GRANT_REASONS } from '@/features/billing/entitlements';
import {
  allowedShapes,
  netRevenueUsd,
  TARGET_MARGIN_MULTIPLE,
  worstCase,
} from '@/features/billing/margin';
import { normalizeReferralCode, referralLink } from '@/features/referrals/code';
import {
  claimReferral,
  decideClaim,
  InMemoryReferralRepository,
  referralRewards,
  referralSummary,
  rewardReferral,
} from '@/features/referrals/referral';
import { GET as inviteLink } from '@/app/r/[code]/route';

const ALICE = 'alice';
const BOB = 'bob';
const CAROL = 'carol';

function setup(paid: string[] = []) {
  const grants = new InMemoryCreditGrantLedger();
  const referrals = new InMemoryReferralRepository(grants);
  referrals.setCode(ALICE, 'alice123');
  referrals.setCode(BOB, 'bob45678');
  const plans = { hasPaid: async (id: string) => paid.includes(id) };
  return { grants, referrals, plans };
}

describe('referral codes', () => {
  it('accepts 8 letters/digits, case-insensitively, and nothing else', () => {
    expect(normalizeReferralCode(' AbC12345 ')).toBe('abc12345');
    for (const bad of [null, undefined, '', 'abc', 'abc123456', 'abc-1234', '../admin']) {
      expect(normalizeReferralCode(bad)).toBeNull();
    }
  });

  it('builds the share link on the given origin', () => {
    expect(referralLink('https://s.app/', 'abc12345')).toBe('https://s.app/r/abc12345');
  });
});

describe('claiming a referral', () => {
  it('follows the attribution rules', () => {
    const base = {
      refereeId: BOB,
      referrerId: ALICE,
      alreadyReferredBy: null,
      refereeHasPaid: false,
    };
    expect(decideClaim(base)).toBe('attach');
    expect(decideClaim({ ...base, referrerId: null })).toBe('unknown_code');
    expect(decideClaim({ ...base, referrerId: BOB })).toBe('self');
    expect(decideClaim({ ...base, refereeHasPaid: true })).toBe('already_paid');
    expect(decideClaim({ ...base, alreadyReferredBy: CAROL })).toBe('already_referred');
  });

  it('attaches a new, unpaid account to the code owner, once', async () => {
    const deps = setup();
    expect(await claimReferral(deps, CAROL, 'ALICE123')).toBe('attached');
    expect(await deps.referrals.referredBy(CAROL)).toBe(ALICE);
    expect(await claimReferral(deps, CAROL, 'bob45678')).toBe('already_referred');
    expect(await deps.referrals.referredBy(CAROL)).toBe(ALICE);
  });

  it('refuses self-invites, unknown or malformed codes and paying customers', async () => {
    const deps = setup([BOB]);
    expect(await claimReferral(deps, ALICE, 'alice123')).toBe('self');
    expect(await claimReferral(deps, CAROL, 'zzzzzzzz')).toBe('unknown_code');
    expect(await claimReferral(deps, CAROL, 'nope')).toBe('invalid_code');
    expect(await claimReferral(deps, BOB, 'alice123')).toBe('already_paid');
    expect(await deps.referrals.referredBy(BOB)).toBeNull();
  });
});

describe('referral rewards', () => {
  it('pays the friend and the inviter once, however often the event is replayed', async () => {
    const deps = setup();
    await claimReferral(deps, CAROL, 'alice123');

    const first = await rewardReferral(deps, CAROL);
    expect(first.map((g) => [g.userId, g.credits])).toEqual([
      [CAROL, REFERRAL.refereeCredits],
      [ALICE, REFERRAL.referrerCredits],
    ]);
    expect(await rewardReferral(deps, CAROL)).toEqual([]);
    expect(deps.grants.balance(ALICE)).toBe(REFERRAL.referrerCredits);
    expect(deps.grants.balance(CAROL)).toBe(REFERRAL.refereeCredits);
    for (const g of deps.grants.grants.values()) expect(g.reason).toBe('referral_bonus');

    expect(await referralSummary(deps.referrals, ALICE)).toEqual({
      code: 'alice123',
      invited: 1,
      rewarded: 1,
    });
  });

  it('pays nothing for an account nobody invited', async () => {
    const deps = setup();
    expect(await rewardReferral(deps, CAROL)).toEqual([]);
    expect(deps.grants.grants.size).toBe(0);
  });

  it('stops paying the inviter at the cap, but still pays the friend', () => {
    const atCap = referralRewards({
      refereeId: CAROL,
      referrerId: ALICE,
      referrerRewardedCount: REFERRAL.maxRewardedPerReferrer,
    });
    expect(atCap.map((g) => g.userId)).toEqual([CAROL]);
  });

  it('is free credit, never a payment (keeps the watermark, not in paid metrics)', () => {
    expect(PAID_GRANT_REASONS).not.toContain('referral_bonus');
  });

  it('keeps a referred Starter sale above the margin target, even if all credits go to the worst job', () => {
    const worstUsdPerCredit = Math.max(
      ...Object.values(PLANS).map((p) => worstCase(allowedShapes(p)).usdPerCredit),
    );
    const starter = PLANS.starter;
    const credits = starter.monthlyCredits + REFERRAL.refereeCredits + REFERRAL.referrerCredits;
    const multiple = netRevenueUsd(starter.priceCents) / (credits * worstUsdPerCredit);
    expect(multiple).toBeGreaterThanOrEqual(TARGET_MARGIN_MULTIPLE);
  });
});

describe('carrying the invite code without a cookie', () => {
  it('rides from /login through to Create and Google sign-in', () => {
    const carried = readCarried({ ref: 'ALICE123' });
    expect(carried).toEqual({ idea: null, theme: null, ref: 'alice123' });
    expect(loginHrefFor({ ref: 'alice123', idea: 'Cats' })).toBe('/login?idea=Cats&ref=alice123');
    expect(createHrefAfterLogin(carried)).toBe('/create?ref=alice123');

    const redirectTo = new URL(oauthRedirectTo('https://s.app', carried));
    const next = redirectTo.searchParams.get('next')!;
    expect(refFromNext(next)).toBe('alice123');
    expect(loginAfterOAuthError(next, 'oauth_cancelled')).toBe(
      '/login?error=oauth_cancelled&ref=alice123',
    );
  });

  it('drops malformed codes and leaves idea-only carries unchanged', () => {
    expect(readCarried({ ref: '<script>' })).toEqual({ idea: null, theme: null });
    expect(refFromNext('https://evil.example/?ref=alice123')).toBeNull();
  });

  it('/r/<code> opens sign-up with the code; a bad code goes home', async () => {
    const go = async (code: string) => {
      const res = await inviteLink(new Request(`https://s.app/r/${code}`), {
        params: Promise.resolve({ code }),
      });
      return res.headers.get('location');
    };
    expect(await go('Alice123')).toBe('https://s.app/login?ref=alice123');
    expect(await go('nope')).toBe('https://s.app/');
  });
});

describe('referral migration and terms', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/0013_referrals.sql'), 'utf8');

  it('adds the code, the inviter and the new ledger reason', () => {
    expect(sql).toMatch(/referral_code text/);
    expect(sql).toMatch(/unique index[\s\S]*referral_code/);
    expect(sql).toMatch(/referred_by uuid references public\.profiles/);
    expect(sql).toMatch(/'referral_bonus'/);
    expect(sql).not.toMatch(/create policy/i); // writes stay server-only
  });

  it('states the real reward amounts in the Terms', () => {
    const credits = TERMS.sections.find((s) => s.id === 'credits')!.paragraphs.join('\n');
    expect(credits).toContain(REFERRAL.referrerCredits.toLocaleString('en'));
    expect(credits).toContain(REFERRAL.refereeCredits.toLocaleString('en'));
    expect(credits).toContain(String(REFERRAL.maxRewardedPerReferrer));
  });
});
