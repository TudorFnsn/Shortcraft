/**
 * Carries a chosen idea (and its theme) through sign-up, so a visitor who
 * clicks "Make this video" on a public page lands in Create with it prefilled
 * instead of an empty form. Pure, so the server redirect in `/create` and the
 * client login page share one implementation (tests/ui/carry.test.ts).
 *
 * It also carries a friend's referral code (`ref`, from `/r/<code>`) the same
 * way, so attribution needs no cookie (features/referrals/referral.ts).
 */
import { isThemeId } from '@/config/themes';
import { normalizeReferralCode } from '@/features/referrals/code';

type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

export interface Carried {
  idea: string | null;
  theme: string | null;
  /** A well-formed referral code; present only when one was carried. */
  ref?: string;
}

/** The idea (trimmed, ≤300 chars) and a known theme id from a query string. */
export function readCarried(params: Params): Carried {
  const idea = first(params.idea)?.trim().slice(0, 300) || null;
  const rawTheme = first(params.theme);
  const theme = rawTheme && isThemeId(rawTheme) ? rawTheme : null;
  const ref = normalizeReferralCode(first(params.ref));
  return ref ? { idea, theme, ref } : { idea, theme };
}

function withQuery(path: string, c: Carried): string {
  const q = new URLSearchParams();
  if (c.idea) q.set('idea', c.idea);
  if (c.theme) q.set('theme', c.theme);
  if (c.ref) q.set('ref', c.ref);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

/** Where a signed-out visitor to `/create?…` is sent: login, keeping idea + theme. */
export const loginHrefFor = (params: Params): string => withQuery('/login', readCarried(params));

/** Where login sends the visitor afterwards: Create, prefilled. */
export const createHrefAfterLogin = (c: Carried): string => withQuery('/create', c);
