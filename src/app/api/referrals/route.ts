/**
 * GET /api/referrals → { code, link, invited, rewarded, rewards: { you, friend },
 * maxRewarded }. The signed-in creator's invite link and how it's going.
 * `code`/`link` are null until migration 0013 is applied. Rewards are paid
 * when an invited friend starts a paid plan (features/referrals/referral.ts).
 */
import { REFERRAL } from '@/config/referrals';
import { getCurrentUser } from '@/features/auth/session';
import { referralLink } from '@/features/referrals/code';
import { referralSummary } from '@/features/referrals/referral';
import { getReferralRepository } from '@/features/referrals/store';

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const summary = await referralSummary(getReferralRepository(), user.id);
  const origin = new URL(request.url).origin;
  return Response.json({
    ...summary,
    link: summary.code ? referralLink(origin, summary.code) : null,
    rewards: { you: REFERRAL.referrerCredits, friend: REFERRAL.refereeCredits },
    maxRewarded: REFERRAL.maxRewardedPerReferrer,
  });
}
