import { KEYWORD_PAGES } from '@/config/keyword-pages';

/**
 * Which shell pieces show where (DesignPlan §4 B.2, Shell rows). Pure, so the
 * header, footer and phone "+" agree and the rules are tested.
 */

const MARKETING = ['/pricing', '/terms', '/privacy', '/ideas'];
const KEYWORDS = KEYWORD_PAGES.map((p) => `/${p.slug}`);

const under = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

/** Landing, pricing, legal, keyword and ideas pages get the big dark footer. */
export function isMarketingPath(pathname: string): boolean {
  if (pathname === '/') return true;
  return [...MARKETING, ...KEYWORDS].some((base) => under(pathname, base));
}

export type AppLink = 'videos' | 'create';

/**
 * Signed-in header links: the page you are not on. Your videos shows "New
 * video", Create shows "Your videos", anywhere else shows both.
 */
export function signedInLinks(pathname: string): AppLink[] {
  if (under(pathname, '/gallery')) return ['create'];
  if (under(pathname, '/create')) return ['videos'];
  return ['videos', 'create'];
}

/** The phone "+" shows on Your videos and the voice pages, never on Create. */
export function fabVisible(pathname: string): boolean {
  return under(pathname, '/gallery') || under(pathname, '/voices');
}
