/**
 * Best-effort referral claim for routes: never throws, so a referral problem
 * can't break sign-in or checkout. Logs the outcome, never the code owner.
 */
import { logger } from '@/lib/logger';
import { getStore } from '@/features/render/store';
import { claimReferral, type ClaimOutcome } from './referral';
import { getReferralRepository } from './store';

export async function claimReferralSafely(
  userId: string,
  rawCode: unknown,
): Promise<ClaimOutcome | null> {
  if (typeof rawCode !== 'string' || !rawCode) return null;
  try {
    const outcome = await claimReferral(
      { referrals: getReferralRepository(), plans: getStore() },
      userId,
      rawCode,
    );
    logger.info('referral claim', { userId, outcome });
    return outcome;
  } catch (e) {
    logger.warn('referral claim failed', { userId, error: (e as Error).message });
    return null;
  }
}
