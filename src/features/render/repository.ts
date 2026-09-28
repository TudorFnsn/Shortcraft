/**
 * Persistence ports for the render pipeline.
 *
 * The orchestrator depends on these interfaces, never on Supabase directly, so
 * it runs against an in-memory fake in tests/mock-mode and against Postgres in
 * production with zero code changes.
 */
import type { ModelTier } from '@/config/models';
import type { AppError } from '@/lib/result';
import type { Result } from '@/lib/result';
import type { WordTiming } from '@/features/providers/types';
import type { RenderStatus } from './machine';

export interface RenderJobRecord {
  id: string;
  userId: string;
  status: RenderStatus;
  topic: string;
  themeId: string;
  targetDurationSec: number;
  language: string;
  modelTier: ModelTier;
  title: string | null;
  voiceoverUrl: string | null;
  words: WordTiming[] | null;
  outputAssetUrl: string | null;
  estimatedCredits: number;
  actualCredits: number;
  apiCostUsd: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SceneRecord {
  id: string;
  jobId: string;
  idx: number;
  narration: string;
  imagePrompt: string;
  motionPrompt: string;
  durationSec: number;
  imageUrl: string | null;
  videoUrl: string | null;
  status: 'pending' | 'done' | 'failed';
}

export interface CreateJobInput {
  userId: string;
  topic: string;
  themeId: string;
  targetDurationSec: number;
  language: string;
  modelTier: ModelTier;
}

export interface NewScene {
  idx: number;
  narration: string;
  imagePrompt: string;
  motionPrompt: string;
  durationSec: number;
}

export type AssetKind = 'image' | 'video' | 'audio' | 'final';

export interface RenderRepository {
  createJob(input: CreateJobInput): Promise<RenderJobRecord>;
  getJob(id: string): Promise<RenderJobRecord | null>;
  updateJob(id: string, patch: Partial<RenderJobRecord>): Promise<void>;
  listJobs(userId: string): Promise<RenderJobRecord[]>;
  addScenes(jobId: string, scenes: NewScene[]): Promise<SceneRecord[]>;
  listScenes(jobId: string): Promise<SceneRecord[]>;
  updateScene(id: string, patch: Partial<SceneRecord>): Promise<void>;
  saveAsset(input: {
    userId: string;
    jobId: string;
    kind: AssetKind;
    url: string;
  }): Promise<{ id: string; url: string }>;
}

export interface CreditRepository {
  balance(userId: string): Promise<number>;
  /** Atomic reserve; Err('insufficient_credits') when the balance is too low. */
  reserve(userId: string, amount: number, jobId: string): Promise<Result<number, AppError>>;
  /** Signed adjustment for grants / settle / refund / top-up. Returns new balance. */
  add(
    userId: string,
    delta: number,
    reason: 'trial_grant' | 'monthly_grant' | 'topup' | 'settle_adjust' | 'refund',
    jobId?: string,
  ): Promise<number>;
}
