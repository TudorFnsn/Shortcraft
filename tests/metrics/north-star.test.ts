import { describe, expect, it } from 'vitest';
import {
  computeNorthStar,
  DAY_MS,
  formatRatio,
  type MetricsInput,
} from '@/features/metrics/north-star';

const NOW = new Date('2026-10-12T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);

const empty: MetricsInput = { users: [], jobs: [], subscriptions: [], paidGrants: [], now: NOW };

describe('computeNorthStar', () => {
  it('returns zeros and n/a ratios with no data', () => {
    const r = computeNorthStar(empty);
    expect(r.northStar).toBe(0);
    expect(r.payingSubscribers).toBe(0);
    expect(r.activation.rate).toBeNull();
    expect(r.failureRate.rate).toBeNull();
    expect(r.weeks).toHaveLength(4);
    expect(r.weeks.at(-1)?.weekStart).toBe('2026-10-05');
    expect(r.asOf).toBe(NOW.toISOString());
  });

  it('counts only live subscribers with a finished video in the last 7 days', () => {
    const r = computeNorthStar({
      ...empty,
      subscriptions: [
        { userId: 'active-maker', planId: 'pro', status: 'active' },
        { userId: 'past-due-maker', planId: 'starter', status: 'past_due' },
        { userId: 'idle-sub', planId: 'pro', status: 'active' },
        { userId: 'canceled-maker', planId: 'pro', status: 'canceled' },
        { userId: 'failed-only', planId: 'ultra', status: 'active' },
        { userId: 'stale-maker', planId: 'pro', status: 'active' },
      ],
      jobs: [
        { userId: 'active-maker', status: 'done', createdAt: daysAgo(1) },
        { userId: 'active-maker', status: 'done', createdAt: daysAgo(2) },
        { userId: 'past-due-maker', status: 'done', createdAt: daysAgo(6.9) },
        { userId: 'canceled-maker', status: 'done', createdAt: daysAgo(1) },
        { userId: 'failed-only', status: 'failed', createdAt: daysAgo(1) },
        { userId: 'stale-maker', status: 'done', createdAt: daysAgo(7.1) },
        { userId: 'trial-maker', status: 'done', createdAt: daysAgo(3) },
      ],
    });
    expect(r.northStar).toBe(2);
    expect(r.payingSubscribers).toBe(5);
    expect(formatRatio(r.subscriberWeeklyUse)).toBe('40% (2/5)');
    expect(r.weeklyCreators).toBe(4);
    expect(r.videosThisWeek).toBe(5);
    expect(formatRatio(r.failureRate)).toBe('17% (1/6)');
  });

  it('measures activation on the 7–14 day cohort, within 7 days of signup', () => {
    const r = computeNorthStar({
      ...empty,
      users: [
        { id: 'fast', createdAt: daysAgo(10) },
        { id: 'late', createdAt: daysAgo(13) },
        { id: 'never', createdAt: daysAgo(8) },
        { id: 'only-failed', createdAt: daysAgo(9) },
        { id: 'too-new', createdAt: daysAgo(2) },
        { id: 'too-old', createdAt: daysAgo(20) },
      ],
      jobs: [
        { userId: 'fast', status: 'done', createdAt: daysAgo(9.9) },
        { userId: 'late', status: 'done', createdAt: daysAgo(1) },
        { userId: 'only-failed', status: 'failed', createdAt: daysAgo(8) },
        { userId: 'too-new', status: 'done', createdAt: daysAgo(1) },
      ],
    });
    expect(formatRatio(r.activation)).toBe('25% (1/4)');
    expect(r.signupsThisWeek).toBe(1);
  });

  it('measures trial → paid on the 7–35 day cohort with any paid grant', () => {
    const r = computeNorthStar({
      ...empty,
      users: [
        { id: 'subscriber', createdAt: daysAgo(30) },
        { id: 'topup-buyer', createdAt: daysAgo(12) },
        { id: 'trial-only', createdAt: daysAgo(9) },
        { id: 'too-new-payer', createdAt: daysAgo(3) },
      ],
      paidGrants: [
        { userId: 'subscriber', createdAt: daysAgo(29) },
        { userId: 'subscriber', createdAt: daysAgo(1) },
        { userId: 'topup-buyer', createdAt: daysAgo(2) },
        { userId: 'too-new-payer', createdAt: daysAgo(1) },
      ],
    });
    expect(formatRatio(r.trialToPaid)).toBe('67% (2/3)');
  });

  it('builds a weekly trend with "paid by week end" as the paying proxy', () => {
    const r = computeNorthStar(
      {
        ...empty,
        jobs: [
          { userId: 'a', status: 'done', createdAt: daysAgo(15) },
          { userId: 'a', status: 'done', createdAt: daysAgo(3) },
          { userId: 'b', status: 'done', createdAt: daysAgo(3) },
          { userId: 'b', status: 'done', createdAt: daysAgo(4) },
        ],
        paidGrants: [{ userId: 'a', createdAt: daysAgo(10) }],
      },
      3,
    );
    expect(r.weeks).toEqual([
      { weekStart: '2026-09-21', creators: 1, paidCreators: 0, videos: 1 },
      { weekStart: '2026-09-28', creators: 0, paidCreators: 0, videos: 0 },
      { weekStart: '2026-10-05', creators: 2, paidCreators: 1, videos: 3 },
    ]);
  });
});
