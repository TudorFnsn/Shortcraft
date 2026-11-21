/**
 * GET /r/<code> — a creator's invite link. Opens sign-up with the referral
 * code carried in the URL (no cookie); an unknown or malformed code just
 * lands on the home page. The code is checked and claimed after sign-in.
 */
import { NextResponse } from 'next/server';
import { normalizeReferralCode } from '@/features/referrals/code';

export async function GET(request: Request, ctx: RouteContext<'/r/[code]'>) {
  const { code } = await ctx.params;
  const ref = normalizeReferralCode(code);
  const target = ref ? `/login?${new URLSearchParams({ ref }).toString()}` : '/';
  return NextResponse.redirect(new URL(target, request.url));
}
