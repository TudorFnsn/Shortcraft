/**
 * Credit operations for a render job, expressed over the CreditRepository port.
 * The math comes from the pure ledger; the repo provides atomicity.
 */
import type { CreditRepository } from '@/features/render/repository';
import type { AppError, Result } from '@/lib/result';
import { refundDelta, settleDelta } from './ledger';

/** Place the hold when a job starts. Err when the balance is insufficient. */
export function reserveForJob(
  credits: CreditRepository,
  userId: string,
  jobId: string,
  estimate: number,
): Promise<Result<number, AppError>> {
  return credits.reserve(userId, estimate, jobId);
}

/** On success: give back the difference between the hold and the real cost. */
export async function settleJob(
  credits: CreditRepository,
  userId: string,
  jobId: string,
  estimate: number,
  actual: number,
): Promise<void> {
  const delta = settleDelta(estimate, actual);
  if (delta !== 0) await credits.add(userId, delta, 'settle_adjust', jobId);
}

/** On failure: return the whole hold. */
export async function refundJob(
  credits: CreditRepository,
  userId: string,
  jobId: string,
  estimate: number,
): Promise<void> {
  await credits.add(userId, refundDelta(estimate), 'refund', jobId);
}
