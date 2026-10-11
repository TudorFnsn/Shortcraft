/**
 * GET /api/cron/advance-jobs — resume render jobs nobody is working on.
 *
 * The background run after POST /api/jobs is capped by the function's time
 * limit, and a Premium job waits minutes on its AI clips. Supabase pg_cron
 * calls this every minute (migration 0007, via pg_net) and Vercel Cron once a
 * day as a backstop (vercel.json; Hobby allows only daily crons). It answers
 * 202 at once with the jobs it picked and drives them in the background
 * (`after`), because pg_net gives up on a request after a few seconds.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` (Vercel sends it; pg_cron reads
 * it from Supabase Vault). Without CRON_SECRET the route only answers in
 * development.
 */
import { after } from 'next/server';
import { env } from '@/lib/env';
import { getStore } from '@/features/render/store';
import { advanceJobs, findStalledJobs } from '@/features/render/sweep';

export async function GET(request: Request) {
  const authorized = env.CRON_SECRET
    ? request.headers.get('authorization') === `Bearer ${env.CRON_SECRET}`
    : env.NODE_ENV === 'development';
  if (!authorized) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const store = getStore();
  const jobs = await findStalledJobs(store);
  if (jobs.length > 0) {
    const deps = { repo: store, credits: store, plans: store };
    // Leave headroom to release the leases cleanly before the platform kills us.
    after(() => advanceJobs(deps, jobs, (maxDuration - 30) * 1000));
  }
  return Response.json({ picked: jobs.map((j) => j.id) }, { status: 202 });
}

export const maxDuration = 300;
