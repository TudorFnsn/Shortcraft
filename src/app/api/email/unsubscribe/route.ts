/**
 * /api/email/unsubscribe?u=<user id>&t=<signed token> — lifecycle-email opt-out.
 *
 * GET shows a confirm button (link scanners in inboxes open every link, so a
 * GET must not unsubscribe); POST unsubscribes. Mail clients that support
 * RFC 8058 one-click POST here directly from the List-Unsubscribe header.
 * No login: the HMAC token only works for the account it was sent to.
 */
import { siteConfig } from '@/config/site';
import { emailLinkSecret } from '@/features/email/config';
import { SupabaseLifecycleStore } from '@/features/email/repository.supabase';
import { verifyUnsubscribeToken } from '@/features/email/unsubscribe';
import { isSupabaseConfigured } from '@/features/render/store';

function page(body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Email preferences · ${siteConfig.name}</title></head><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:48px auto;padding:0 16px;color:#2b2420;line-height:1.5">${body}</body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

function verify(request: Request): string | null {
  const url = new URL(request.url);
  const userId = url.searchParams.get('u') ?? '';
  const token = url.searchParams.get('t') ?? '';
  const secret = emailLinkSecret();
  if (!secret || !userId || !token || !verifyUnsubscribeToken(userId, token, secret)) return null;
  return userId;
}

const INVALID = `<h1>This link doesn't work</h1><p>It may be incomplete. Email ${siteConfig.supportEmail} and we'll stop the reminders for you.</p>`;

export function GET(request: Request) {
  if (!verify(request)) return page(INVALID, 400);
  return page(
    `<h1>Stop reminder emails?</h1><p>You won't get ${siteConfig.name}'s reminders any more. Account emails, like password resets and receipts, still arrive.</p><form method="post"><button type="submit" style="font:inherit;padding:12px 20px;border-radius:10px;border:0;background:#c2571a;color:#fff;font-weight:600;cursor:pointer">Unsubscribe</button></form>`,
  );
}

export async function POST(request: Request) {
  const userId = verify(request);
  if (!userId) return page(INVALID, 400);
  if (isSupabaseConfigured()) await new SupabaseLifecycleStore().optOut(userId);
  return page(
    `<h1>You're unsubscribed</h1><p>No more reminder emails from ${siteConfig.name}.</p>`,
  );
}
