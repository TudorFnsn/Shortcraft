import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  GOODWILL_VIDEO_CREDITS,
  grantCommand,
  planReactivation,
  type ReactivationInput,
} from '@/features/outreach/reactivation';

const NOW = new Date('2026-11-21T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const user = (id: string, signupDaysAgo = 40) => ({
  id,
  email: `${id}@example.com`,
  emailConfirmed: true,
  createdAt: daysAgo(signupDaysAgo),
});

const base: ReactivationInput = {
  now: NOW,
  users: [],
  optedOut: new Set(),
  doneJobs: [],
  subscriptions: [],
  paidUserIds: new Set(),
  balances: new Map(),
};

describe('planReactivation', () => {
  it('segments users and orders them by priority', () => {
    const rows = planReactivation({
      ...base,
      users: [user('fresh'), user('never'), user('tried'), user('payer'), user('maker')],
      doneJobs: [
        { userId: 'tried', createdAt: daysAgo(30) },
        { userId: 'payer', createdAt: daysAgo(33) },
        { userId: 'maker', createdAt: daysAgo(2) },
      ],
      subscriptions: [
        { userId: 'payer', planId: 'pro', status: 'active' },
        { userId: 'maker', planId: 'starter', status: 'active' },
      ],
      paidUserIds: new Set(['payer', 'maker']),
    });
    expect(rows.map((r) => [r.userId, r.segment])).toEqual([
      ['payer', 'paying_idle'],
      ['tried', 'tried_and_left'],
      ['fresh', 'never_activated'],
      ['never', 'never_activated'],
      ['maker', 'active'],
    ]);
    const payer = rows[0]!;
    expect(payer.planId).toBe('pro');
    expect(payer.lastVideoOn).toBe('2026-10-19');
    expect(payer.daysSinceLastVideo).toBe(33);
    expect(payer.suggestedGrant).toBe(0);
  });

  it('treats a cancelled payer who left as tried_and_left, not paying_idle', () => {
    const [row] = planReactivation({
      ...base,
      users: [user('ex')],
      subscriptions: [{ userId: 'ex', planId: 'pro', status: 'canceled' }],
      paidUserIds: new Set(['ex']),
    });
    expect(row?.segment).toBe('tried_and_left');
    expect(row?.planId).toBeNull();
  });

  it('suggests only the credits missing for one 30s video', () => {
    const rows = planReactivation({
      ...base,
      users: [user('broke'), user('half'), user('rich')],
      balances: new Map([
        ['half', 1000],
        ['rich', GOODWILL_VIDEO_CREDITS + 5],
      ]),
    });
    const by = Object.fromEntries(rows.map((r) => [r.userId, r.suggestedGrant]));
    expect(by).toEqual({
      broke: GOODWILL_VIDEO_CREDITS,
      half: GOODWILL_VIDEO_CREDITS - 1000,
      rich: 0,
    });
  });

  it('marks opted-out, unconfirmed or address-less users as not contactable', () => {
    const rows = planReactivation({
      ...base,
      users: [
        user('ok'),
        user('out'),
        { ...user('unconfirmed'), emailConfirmed: false },
        { ...user('nomail'), email: null },
      ],
      optedOut: new Set(['out']),
    });
    const by = Object.fromEntries(rows.map((r) => [r.userId, r.contactable]));
    expect(by).toEqual({ ok: true, out: false, unconfirmed: false, nomail: false });
    expect(rows[0]?.userId).toBe('ok');
    const out = rows.find((r) => r.userId === 'out')!;
    expect(grantCommand(out, 'reactivation-2026-11')).toBeNull();
  });

  it('builds the dry-run grant command only when a grant is due', () => {
    const [row] = planReactivation({ ...base, users: [user('a')] });
    expect(grantCommand(row!, 'reactivation-2026-11')).toBe(
      `npx tsx scripts/grant-credits.mts --user a --credits ${GOODWILL_VIDEO_CREDITS} --note reactivation-2026-11`,
    );
  });
});
