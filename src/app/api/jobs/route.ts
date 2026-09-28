/**
 * POST /api/jobs — create a render job for the signed-in user and run it.
 * With mock providers the whole pipeline completes inline, so the response
 * carries the finished job. (When live async providers land, this returns early
 * with a running job and the pipeline resumes via webhooks.)
 */
import { z } from 'zod';
import { getCurrentUser } from '@/features/auth/session';
import { runRenderJob } from '@/features/render/orchestrator';
import { getStore } from '@/features/render/store';
import { isThemeId } from '@/config/themes';

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

  const store = getStore();
  const job = await store.createJob({
    userId: user.id,
    topic: parsed.data.topic,
    themeId: parsed.data.themeId,
    targetDurationSec: parsed.data.targetDurationSec,
    language: 'en',
    modelTier: parsed.data.modelTier,
  });

  const result = await runRenderJob({ repo: store, credits: store }, job.id);
  if (!result.ok) {
    return Response.json({ error: result.error.code, jobId: job.id }, { status: 400 });
  }
  return Response.json({ job: result.value });
}
