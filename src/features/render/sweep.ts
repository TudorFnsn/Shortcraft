/**
 * The cron sweep: resume render jobs nobody is working on. Any scheduler can
 * trigger it (Supabase pg_cron every minute, Vercel Cron daily as a backstop);
 * the job lease keeps it from racing a live run or another sweep.
 */
import { logger } from '@/lib/logger';
import { driveJob, type OrchestratorDeps } from './orchestrator';
import type { RenderJobRecord } from './repository';
import type { Store } from './store';

/** A job this quiet with no lease has lost its worker. */
export const STALLED_AFTER_MS = 20_000;
export const MAX_JOBS_PER_SWEEP = 5;

export function findStalledJobs(store: Store): Promise<RenderJobRecord[]> {
  return store.listStalledJobs(STALLED_AFTER_MS, MAX_JOBS_PER_SWEEP);
}

/** Drives each job for an equal share of `totalBudgetMs`, so every one makes progress. */
export async function advanceJobs(
  deps: OrchestratorDeps,
  jobs: readonly Pick<RenderJobRecord, 'id'>[],
  totalBudgetMs: number,
): Promise<Array<{ id: string; status: string }>> {
  const budgetMs = totalBudgetMs / Math.max(1, jobs.length);
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
  return results;
}
