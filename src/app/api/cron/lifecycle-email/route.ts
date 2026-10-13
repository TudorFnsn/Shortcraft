/**
 * GET /api/cron/lifecycle-email — the daily activation + unused-credits
 * reminders (features/email). Vercel Cron calls it once a day (vercel.json).
 *
 * Auth: `Authorization: Bearer $CRON_SECRET`, like /api/cron/advance-jobs.
 * Without a database it does nothing; without Resend configured it is a dry
 * run that reports what it would send.
 */
import { env } from '@/lib/env';
import { isSupabaseConfigured } from '@/features/render/store';
import { emailLinkSecret, emailSiteUrl, lifecycleSender } from '@/features/email/config';
import { SupabaseLifecycleStore } from '@/features/email/repository.supabase';
import { runLifecycleEmails } from '@/features/email/run';

export async function GET(request: Request) {
  const authorized = env.CRON_SECRET
    ? request.headers.get('authorization') === `Bearer ${env.CRON_SECRET}`
    : env.NODE_ENV === 'development';
  if (!authorized) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) return Response.json({ skipped: 'no database' });

  const store = new SupabaseLifecycleStore();
  const report = await runLifecycleEmails(
    {
      source: store,
      log: store,
      sender: lifecycleSender(),
      siteUrl: emailSiteUrl(),
      linkSecret: emailLinkSecret() ?? '',
    },
    new Date(),
  );
  return Response.json(report);
}

export const maxDuration = 300;
