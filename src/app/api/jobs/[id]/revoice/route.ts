/**
 * POST /api/jobs/:id/revoice — make a new version of the caller's finished
 * video with edited narration and/or another voice (Voice Studio V3).
 *
 * Body: { scenes?: [{ idx, narration }], voiceId?, speed?, delivery? }.
 * The source stays as it is; the new version is a child job that reuses the
 * source's pictures and clips and only re-runs the voice and the final cut,
 * at the fixed re-voice price (held before responding, like POST /api/jobs).
 * Edited narration is spoken, so it goes through the same prompt screen as a
 * topic. Responds 202 with the new job; the Library shows its progress.
 */
import { after } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/features/auth/session';
import { getPromptModerator } from '@/features/moderation/prompt-check';
import { advanceJob, driveJob } from '@/features/render/orchestrator';
import { createRevoiceJob, planNarration } from '@/features/render/revoice';
import { getStore } from '@/features/render/store';
import { VoiceFields, voiceChoice } from '@/features/render/voice';
import { logger } from '@/lib/logger';

const Body = VoiceFields.extend({
  scenes: z
    .array(z.object({ idx: z.number().int().min(0), narration: z.string().max(2000) }))
    .max(50)
    .default([]),
});

export async function POST(request: Request, { params }: RouteContext<'/api/jobs/[id]/revoice'>) {
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
  if (source.status !== 'done') {
    return Response.json(
      { error: 'not_ready', message: 'Only a finished video can get a new voiceover.' },
      { status: 409 },
    );
  }

  const sourceScenes = await store.listScenes(source.id);
  const plan = planNarration(sourceScenes, parsed.data.scenes);
  if (!plan.ok) {
    return Response.json({ error: plan.error.code, message: plan.error.message }, { status: 400 });
  }
  const voice = voiceChoice(parsed.data);
  if (plan.value.changed.length === 0 && !voice.voiceId && !voice.voiceSettings) {
    return Response.json(
      { error: 'nothing_to_change', message: 'Change a line or the voice first.' },
      { status: 400 },
    );
  }

  // New lines will be spoken: screen them like a topic, before anything is held.
  if (plan.value.changed.length > 0) {
    const text = plan.value.changed.map((c) => c.narration).join('\n');
    const moderation = await getPromptModerator().check(text);
    if (!moderation.ok) {
      logger.warn('revoice narration blocked', {
        userId: user.id,
        category: moderation.error.category,
      });
      return Response.json(
        { error: moderation.error.code, message: moderation.error.message },
        { status: 422 },
      );
    }
  }

  const job = await createRevoiceJob(store, source, sourceScenes, plan.value.narrations, voice);
  const deps = { repo: store, credits: store, plans: store };
  const held = await advanceJob(deps, job.id); // draft → voiceover: holds the re-voice price
  if (!held.ok) {
    return Response.json({ error: held.error.code, jobId: job.id }, { status: 400 });
  }
  after(() =>
    driveJob(deps, job.id, { budgetMs: (maxDuration - 30) * 1000 }).catch((cause: unknown) =>
      logger.error('background re-voice run crashed', { jobId: job.id, cause: String(cause) }),
    ),
  );
  return Response.json({ job: held.value.job }, { status: 202 });
}

export const maxDuration = 300;
