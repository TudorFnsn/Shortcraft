/**
 * POST /api/jobs — create a render job for the signed-in user and start it.
 *
 * The credit hold runs before responding (so "out of credits" is an immediate
 * error); everything after it runs in the background (`after`), one resumable
 * step at a time. Responds 202 with the job; /gallery shows progress. If this
 * function hits its time limit first (Premium clips take minutes), the cron
 * sweep (/api/cron/advance-jobs) resumes the job from where it stopped.
 */
import { after } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/features/auth/session';
import { advanceJob, driveJob } from '@/features/render/orchestrator';
import { getStore } from '@/features/render/store';
import { isThemeId } from '@/config/themes';
import { PLANS } from '@/config/plans';
import { checkPlanLimits } from '@/features/billing/entitlements';
import { getPromptModerator } from '@/features/moderation/prompt-check';
import { logger } from '@/lib/logger';

const Body = z.object({
  topic: z.string().min(3).max(300),
  themeId: z.string().refine(isThemeId, 'unknown theme'),
  targetDurationSec: z.number().int().min(6).max(120),
  modelTier: z.enum(['standard', 'premium']).default('standard'),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'invalid_input', issues: parsed.error.issues }, { status: 400 });
  }

  // Moderation before anything is created or held: a blocked topic is free.
  const moderation = await getPromptModerator().check(parsed.data.topic);
  if (!moderation.ok) {
    // Log the category, never the prompt text.
    logger.warn('prompt blocked', { userId: user.id, category: moderation.error.category });
    return Response.json(
      { error: moderation.error.code, message: moderation.error.message },
      { status: 422 },
    );
  }

  const store = getStore();

  // Plan gate before any job row or credit hold exists.
  const plan = PLANS[await store.planOf(user.id)];
  const allowed = checkPlanLimits(plan, parsed.data);
  if (!allowed.ok) {
    return Response.json(
      { error: allowed.error.code, message: allowed.error.message },
      { status: 403 },
    );
  }

  const job = await store.createJob({
    userId: user.id,
    topic: parsed.data.topic,
    themeId: parsed.data.themeId,
    targetDurationSec: parsed.data.targetDurationSec,
    language: 'en',
    modelTier: parsed.data.modelTier,
  });

  const deps = { repo: store, credits: store, plans: store };
  const held = await advanceJob(deps, job.id); // draft → scripting: reserves the credits
  if (!held.ok) {
    return Response.json({ error: held.error.code, jobId: job.id }, { status: 400 });
  }
  // Leave headroom to release the lease cleanly before the platform kills us.
  after(() =>
    driveJob(deps, job.id, { budgetMs: (maxDuration - 30) * 1000 }).catch((cause: unknown) =>
      // Infra errors only (provider errors fail + refund inside the step); cron retries.
      logger.error('background render run crashed', { jobId: job.id, cause: String(cause) }),
    ),
  );
  return Response.json({ job: held.value.job }, { status: 202 });
}

/** Seconds the background run may use (platform-capped); the cron sweep does the rest. */
export const maxDuration = 300;
