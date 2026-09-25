/**
 * Credits ledger — append-only accounting core (pure, DB-agnostic).
 *
 * We never mutate a stored balance. Balance is always SUM(delta) over an
 * immutable transaction log, so it's auditable and race-safe once the write is
 * done inside a single row-locked Postgres function (added in the DB step).
 *
 * Lifecycle of a render job's credits:
 *   1. reserve(estimate)  -> negative hold when the job starts
 *   2a. settle(estimate, actual) on success -> refunds any over-hold
 *   2b. refund(estimate)  on failure        -> returns the whole hold
 *
 * This module holds the MATH; the atomic persistence wraps these deltas.
 */

export type CreditReason =
  'trial_grant' | 'monthly_grant' | 'topup' | 'reserve' | 'settle_adjust' | 'refund';

export interface CreditTx {
  id: string;
  userId: string;
  /** Signed: grants/refunds positive, reserves negative. */
  delta: number;
  reason: CreditReason;
  refJobId?: string;
  createdAt: string; // ISO
}

/** Current balance = sum of all deltas. */
export const balanceOf = (txs: readonly CreditTx[]): number =>
  txs.reduce((sum, t) => sum + t.delta, 0);

export const canAfford = (balance: number, cost: number): boolean => balance >= cost;

/** Negative hold written when a job starts. `estimate` must be >= 0. */
export function reserveDelta(estimate: number): number {
  assertNonNegativeInt(estimate, 'estimate');
  return -estimate;
}

/**
 * On success, reconcile the hold against the real cost.
 * Returns the *adjusting* delta to append (0 if it matched exactly).
 *  - actual < estimate  -> positive delta (give back the difference)
 *  - actual > estimate  -> negative delta (charge the extra)
 */
export function settleDelta(estimate: number, actual: number): number {
  assertNonNegativeInt(estimate, 'estimate');
  assertNonNegativeInt(actual, 'actual');
  return estimate - actual;
}

/** On failure, return the entire hold. */
export function refundDelta(estimate: number): number {
  assertNonNegativeInt(estimate, 'estimate');
  return estimate;
}

function assertNonNegativeInt(n: number, name: string): void {
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new Error(`${name} must be a non-negative integer, got ${n}`);
  }
}
