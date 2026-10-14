import { describe, expect, it } from 'vitest';
import { slotsFor } from '@/app/voices/slots';

describe('slotsFor', () => {
  it('counts used slots against the plan', () => {
    expect(slotsFor(2, 'pro')).toMatchObject({
      used: 2,
      limit: 3,
      atLimit: false,
      line: '2 of 3 on Pro',
      more: { name: 'Ultra', limit: 10 },
    });
  });

  it('closes Create a voice at the limit and points at a bigger plan', () => {
    const s = slotsFor(1, 'starter');
    expect(s.atLimit).toBe(true);
    expect(s.more).toEqual({ name: 'Pro', limit: 3 });
  });

  it('has no bigger plan on Ultra', () => {
    expect(slotsFor(10, 'ultra')).toMatchObject({ atLimit: true, more: null });
  });
});
