/**
 * GET /api/cron/advance-jobs — resume render jobs nobody is working on.
 *
 * The background run after POST /api/jobs is capped by the function's time
 * limit, and a Premium job waits minutes on its AI clips. Vercel Cron calls
 * this every minute (vercel.json); it picks unfinished jobs whose lease has
 * expired and that haven't moved for a while, and drives each for a share of
 * this function's budget. The job lease keeps it from racing a live run.
 *
 * Auth: Vercel sends `Authorization: Bearer $CRON_SECRET`. Without CRON_SECRET
 * the route only answers in development.
 */
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { driveJob } from '@/features/render/orchestrator';
import { getStore } from '@/features/render/store';

/** A job this quiet with no lease has lost its worker. */
const STALLED_AFTER_MS = 20_000;
const MAX_JOBS_PER_RUN = 5;

export async function GET(request: Request) {
  const authorized = env.CRON_SECRET
    ? request.headers.get('authorization') === `Bearer ${env.CRON_SECRET}`
    : env.NODE_ENV === 'development';
  if (!authorized) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const store = getStore();
  const deps = { repo: store, credits: store, plans: store };
  const jobs = await store.listStalledJobs(STALLED_AFTER_MS, MAX_JOBS_PER_RUN);
  // Share the budget (minus headroom) so every picked job makes progress.
  const budgetMs = ((maxDuration - 30) * 1000) / Math.max(1, jobs.length);

  const results = await Promise.all(
    jobs.map(async (job) => {
      try {
        const res = await driveJob(deps, job.id, { budgetMs });
        return { id: job.id, status: res.ok ? res.value.job.status : 'failed' };
      } catch (cause) {
        logger.error('cron render run crashed', { jobId: job.id, cause: String(cause) });
        return { id: job.id, status: 'error' };
      }
    }),
  );
  if (results.length > 0) logger.info('cron advanced jobs', { results });
  return Response.json({ advanced: results });
}

export const maxDuration = 300;
