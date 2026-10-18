/**
 * POST /api/jobs/:id/redo-scene — make a new version of the caller's finished
 * video with one scene redone: a fresh picture (and, on Premium, a fresh AI
 * clip), optionally from an edited picture description (Studio).
 *
 * Body: { idx, imagePrompt? }. The source stays as it is; the new version is a
 * child job that reuses every other scene and the voiceover, so only that
 * scene and the final cut run, at the fixed redo price (held before
 * responding, like POST /api/jobs). An edited description goes through the
 * same prompt screen as a topic. Responds 202 with the new job; the Library
 * shows its progress.
 */
import { after } from 'next/server';
import { z } from 'zod';
import { PLANS } from '@/config/plans';
import { getCurrentUser } from '@/features/auth/session';
import { checkPlanLimits } from '@/features/billing/entitlements';
import { getPromptModerator } from '@/features/moderation/prompt-check';
import { advanceJob, driveJob } from '@/features/render/orchestrator';
import { createSceneRedoJob, planSceneRedo } from '@/features/render/redo-scene';
import { getStore } from '@/features/render/store';
import { getUserVoiceStore } from '@/features/voice/store';
import { logger } from '@/lib/logger';

const Body = z.object({
  idx: z.number().int().min(0),
  imagePrompt: z.string().max(5000).optional(),
});

export async function POST(
  request: Request,
  { params }: RouteContext<'/api/jobs/[id]/redo-scene'>,
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'invalid_input', issues: parsed.error.issues }, { status: 400 });
  }

  const { id } = await params;
  const store = getStore();
  const source = await store.getJob(id);
  // Someone else's video is "not found", never "forbidden": no existence leak.
  if (!source || source.userId !== user.id) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
  if (source.status !== 'done' || !source.voiceoverUrl) {
    return Response.json(
      { error: 'not_ready', message: 'Only a finished video can have a scene redone.' },
      { status: 409 },
    );
  }

  // A redo renders at the source's quality: the plan must still allow it (e.g. after a downgrade).
  const plan = PLANS[await store.planOf(user.id)];
  const allowed = checkPlanLimits(plan, source);
  if (!allowed.ok) {
    return Response.json(
      { error: allowed.error.code, message: allowed.error.message },
      { status: 403 },
    );
  }

  const sourceScenes = await store.listScenes(source.id);
  const redo = planSceneRedo(source, sourceScenes, parsed.data);
  if (!redo.ok) {
    return Response.json({ error: redo.error.code, message: redo.error.message }, { status: 400 });
  }

  // A new description will be drawn: screen it like a topic, before anything is held.
  if (redo.value.promptChanged) {
    const moderation = await getPromptModerator().check(redo.value.imagePrompt);
    if (!moderation.ok) {
      logger.warn('scene redo prompt blocked', {
        userId: user.id,
        category: moderation.error.category,
      });
      return Response.json(
        { error: moderation.error.code, message: moderation.error.message },
        { status: 422 },
      );
    }
  }

  const job = await createSceneRedoJob(store, source, sourceScenes, redo.value);
  const deps = { repo: store, credits: store, plans: store, voices: getUserVoiceStore() };
  const held = await advanceJob(deps, job.id); // draft → images: holds the redo price
  if (!held.ok) {
    return Response.json({ error: held.error.code, jobId: job.id }, { status: 400 });
  }
  after(() =>
    driveJob(deps, job.id, { budgetMs: (maxDuration - 30) * 1000 }).catch((cause: unknown) =>
      logger.error('background scene redo run crashed', { jobId: job.id, cause: String(cause) }),
    ),
  );
  return Response.json({ job: held.value.job }, { status: 202 });
}

export const maxDuration = 300;
