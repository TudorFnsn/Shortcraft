/**
 * Signed one-click unsubscribe links. The token is an HMAC of the user id, so
 * a link can only unsubscribe the account it was sent to, and needs no login
 * (RFC 8058 one-click: mail clients POST to it without cookies).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export function unsubscribeToken(userId: string, secret: string): string {
  return createHmac('sha256', secret).update(`unsubscribe:${userId}`).digest('base64url');
}

export function verifyUnsubscribeToken(userId: string, token: string, secret: string): boolean {
  const expected = Buffer.from(unsubscribeToken(userId, secret));
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export const unsubscribeUrl = (siteUrl: string, userId: string, secret: string): string =>
  `${siteUrl}/api/email/unsubscribe?${new URLSearchParams({
    u: userId,
    t: unsubscribeToken(userId, secret),
  }).toString()}`;
