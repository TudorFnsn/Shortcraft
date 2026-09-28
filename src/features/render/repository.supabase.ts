/**
 * Supabase-backed implementation of the render + credit repositories.
 *
 * Uses the service-role admin client so the server can write jobs/scenes/assets
 * (RLS only grants clients SELECT on their own rows). Credit movement always goes
 * through the reserve_credits / add_credits SQL functions, never a raw write.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { appError, err, ok, type AppError, type Result } from '@/lib/result';
import type { WordTiming } from '@/features/providers/types';
import type { RenderStatus } from './machine';
import type {
  AssetKind,
  CreateJobInput,
  CreditRepository,
  NewScene,
  RenderJobRecord,
  RenderRepository,
  SceneRecord,
} from './repository';

interface JobRow {
  id: string;
  user_id: string;
  status: string;
  topic: string;
  theme_id: string;
  target_duration_sec: number;
  language: string;
  model_tier: string;
  title: string | null;
  voiceover_url: string | null;
  words: WordTiming[] | null;
  output_asset_url: string | null;
  estimated_credits: number;
  actual_credits: number;
  api_cost_usd: number;
  error: string | null;
  created_at: string;
  updated_at: string;
}

interface SceneRow {
  id: string;
  job_id: string;
  idx: number;
  narration: string;
  image_prompt: string;
  motion_prompt: string;
  duration_sec: number;
  image_url: string | null;
  video_url: string | null;
  status: string;
}

const toJob = (r: JobRow): RenderJobRecord => ({
  id: r.id,
  userId: r.user_id,
  status: r.status as RenderStatus,
  topic: r.topic,
  themeId: r.theme_id,
  targetDurationSec: r.target_duration_sec,
  language: r.language,
  modelTier: r.model_tier as RenderJobRecord['modelTier'],
  title: r.title,
  voiceoverUrl: r.voiceover_url,
  words: r.words,
  outputAssetUrl: r.output_asset_url,
  estimatedCredits: Number(r.estimated_credits),
  actualCredits: Number(r.actual_credits),
  apiCostUsd: Number(r.api_cost_usd),
  error: r.error,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toScene = (r: SceneRow): SceneRecord => ({
  id: r.id,
  jobId: r.job_id,
  idx: r.idx,
  narration: r.narration,
  imagePrompt: r.image_prompt,
  motionPrompt: r.motion_prompt,
  durationSec: r.duration_sec,
  imageUrl: r.image_url,
  videoUrl: r.video_url,
  status: r.status as SceneRecord['status'],
});

/** Map a camelCase job patch to the snake_case DB columns that were provided. */
function jobPatchToRow(patch: Partial<RenderJobRecord>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.voiceoverUrl !== undefined) row.voiceover_url = patch.voiceoverUrl;
  if (patch.words !== undefined) row.words = patch.words;
  if (patch.outputAssetUrl !== undefined) row.output_asset_url = patch.outputAssetUrl;
  if (patch.estimatedCredits !== undefined) row.estimated_credits = patch.estimatedCredits;
  if (patch.actualCredits !== undefined) row.actual_credits = patch.actualCredits;
  if (patch.apiCostUsd !== undefined) row.api_cost_usd = patch.apiCostUsd;
  if (patch.error !== undefined) row.error = patch.error;
  row.updated_at = new Date().toISOString();
  return row;
}

export class SupabaseStore implements RenderRepository, CreditRepository {
  private db: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.db = client ?? createSupabaseAdminClient();
  }

  // ── RenderRepository ──────────────────────────────────────────────────────
  async createJob(input: CreateJobInput): Promise<RenderJobRecord> {
    const { data, error } = await this.db
      .from('render_jobs')
      .insert({
        user_id: input.userId,
        topic: input.topic,
        theme_id: input.themeId,
        target_duration_sec: input.targetDurationSec,
        language: input.language,
        model_tier: input.modelTier,
        status: 'draft',
      })
      .select()
      .single();
    if (error) throw new Error(`createJob: ${error.message}`);
    return toJob(data as JobRow);
  }

  async getJob(id: string): Promise<RenderJobRecord | null> {
    const { data, error } = await this.db.from('render_jobs').select().eq('id', id).maybeSingle();
    if (error) throw new Error(`getJob: ${error.message}`);
    return data ? toJob(data as JobRow) : null;
  }

  async updateJob(id: string, patch: Partial<RenderJobRecord>): Promise<void> {
    const { error } = await this.db.from('render_jobs').update(jobPatchToRow(patch)).eq('id', id);
    if (error) throw new Error(`updateJob: ${error.message}`);
  }

  async listJobs(userId: string): Promise<RenderJobRecord[]> {
    const { data, error } = await this.db
      .from('render_jobs')
      .select()
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`listJobs: ${error.message}`);
    return (data as JobRow[]).map(toJob);
  }

  async addScenes(jobId: string, scenes: NewScene[]): Promise<SceneRecord[]> {
    const rows = scenes.map((s) => ({
      job_id: jobId,
      idx: s.idx,
      narration: s.narration,
      image_prompt: s.imagePrompt,
      motion_prompt: s.motionPrompt,
      duration_sec: s.durationSec,
    }));
    const { data, error } = await this.db.from('scenes').insert(rows).select();
    if (error) throw new Error(`addScenes: ${error.message}`);
    return (data as SceneRow[]).map(toScene).sort((a, b) => a.idx - b.idx);
  }

  async listScenes(jobId: string): Promise<SceneRecord[]> {
    const { data, error } = await this.db
      .from('scenes')
      .select()
      .eq('job_id', jobId)
      .order('idx', { ascending: true });
    if (error) throw new Error(`listScenes: ${error.message}`);
    return (data as SceneRow[]).map(toScene);
  }

  async updateScene(id: string, patch: Partial<SceneRecord>): Promise<void> {
    const row: Record<string, unknown> = {};
    if (patch.imageUrl !== undefined) row.image_url = patch.imageUrl;
    if (patch.videoUrl !== undefined) row.video_url = patch.videoUrl;
    if (patch.status !== undefined) row.status = patch.status;
    const { error } = await this.db.from('scenes').update(row).eq('id', id);
    if (error) throw new Error(`updateScene: ${error.message}`);
  }

  async saveAsset(input: {
    userId: string;
    jobId: string;
    kind: AssetKind;
    url: string;
  }): Promise<{ id: string; url: string }> {
    const { data, error } = await this.db
      .from('assets')
      .insert({ user_id: input.userId, job_id: input.jobId, kind: input.kind, url: input.url })
      .select('id, url')
      .single();
    if (error) throw new Error(`saveAsset: ${error.message}`);
    return { id: (data as { id: string }).id, url: (data as { url: string }).url };
  }

  // ── CreditRepository ──────────────────────────────────────────────────────
  async balance(userId: string): Promise<number> {
    const { data, error } = await this.db
      .from('credit_transactions')
      .select('delta')
      .eq('user_id', userId);
    if (error) throw new Error(`balance: ${error.message}`);
    return (data as { delta: number }[]).reduce((sum, t) => sum + Number(t.delta), 0);
  }

  async reserve(userId: string, amount: number, jobId: string): Promise<Result<number, AppError>> {
    const { data, error } = await this.db.rpc('reserve_credits', {
      p_user: userId,
      p_amount: amount,
      p_job: jobId,
    });
    if (error) {
      if (error.code === 'P0001' || /insufficient_credits/.test(error.message)) {
        return err(appError('insufficient_credits', 'Not enough credits for this video.'));
      }
      throw new Error(`reserve: ${error.message}`);
    }
    return ok(Number(data));
  }

  async add(
    userId: string,
    delta: number,
    reason: 'trial_grant' | 'monthly_grant' | 'topup' | 'settle_adjust' | 'refund',
    jobId?: string,
  ): Promise<number> {
    const { data, error } = await this.db.rpc('add_credits', {
      p_user: userId,
      p_delta: delta,
      p_reason: reason,
      p_job: jobId ?? null,
    });
    if (error) throw new Error(`add: ${error.message}`);
    return Number(data);
  }
}
