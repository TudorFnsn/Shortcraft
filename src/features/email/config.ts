/**
 * Wires the lifecycle email from env: a Resend sender only when the key, the
 * sender address and the link secret are all set (and never on Preview, see
 * applyDeploymentGuards); otherwise null, which makes the cron a dry run.
 */
import { env } from '@/lib/env';
import { resolveSiteUrl } from '@/features/seo/site';
import { ResendEmailSender, type EmailSender } from './sender';

export function lifecycleSender(): EmailSender | null {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM || !env.EMAIL_LINK_SECRET) return null;
  return new ResendEmailSender(env.RESEND_API_KEY, env.EMAIL_FROM);
}

export const emailLinkSecret = (): string | null => env.EMAIL_LINK_SECRET ?? null;

export const emailSiteUrl = (): string => resolveSiteUrl(process.env);
