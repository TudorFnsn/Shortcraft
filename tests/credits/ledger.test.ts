import { describe, expect, it } from 'vitest';
import {
  balanceOf,
  canAfford,
  refundDelta,
  reserveDelta,
  settleDelta,
  type CreditTx,
} from '@/features/credits/ledger';

const tx = (delta: number, reason: CreditTx['reason']): CreditTx => ({
  id: Math.random().toString(36).slice(2),
  userId: 'u1',
  delta,
  reason,
  createdAt: new Date().toISOString(),
});

describe('balanceOf', () => {
  it('sums an empty log to zero', () => {
    expect(balanceOf([])).toBe(0);
  });

  it('sums signed deltas', () => {
    const log = [tx(3000, 'trial_grant'), tx(-1500, 'reserve'), tx(500, 'settle_adjust')];
    expect(balanceOf(log)).toBe(2000);
  });
});

describe('canAfford', () => {
  it('allows exact balance', () => {
    expect(canAfford(2000, 2000)).toBe(true);
  });
  it('rejects overspend', () => {
    expect(canAfford(1999, 2000)).toBe(false);
  });
});

describe('reserve / settle / refund deltas', () => {
  it('reserve is a negative hold', () => {
    expect(reserveDelta(2000)).toBe(-2000);
  });

  it('settle refunds the over-hold when actual is cheaper', () => {
    expect(settleDelta(2000, 1500)).toBe(500);
  });

  it('settle charges extra when actual is pricier', () => {
    expect(settleDelta(2000, 2300)).toBe(-300);
  });

  it('settle is zero on an exact match', () => {
    expect(settleDelta(2000, 2000)).toBe(0);
  });

  it('refund returns the whole hold', () => {
    expect(refundDelta(2000)).toBe(2000);
  });

  it('rejects invalid amounts', () => {
    expect(() => reserveDelta(-1)).toThrow();
    expect(() => reserveDelta(1.5)).toThrow();
    expect(() => settleDelta(2000, Number.NaN)).toThrow();
  });
});

describe('end-to-end lifecycles net out correctly', () => {
  it('successful job leaves balance = grant - actual', () => {
    const log: CreditTx[] = [tx(3000, 'trial_grant')];
    log.push(tx(reserveDelta(2000), 'reserve')); // start
    log.push(tx(settleDelta(2000, 1800), 'settle_adjust')); // success, cheaper
    expect(balanceOf(log)).toBe(3000 - 1800);
  });

  it('failed job restores the full balance', () => {
    const log: CreditTx[] = [tx(3000, 'trial_grant')];
    log.push(tx(reserveDelta(2000), 'reserve'));
    log.push(tx(refundDelta(2000), 'refund'));
    expect(balanceOf(log)).toBe(3000);
  });
});
