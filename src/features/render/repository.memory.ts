/**
 * In-memory implementation of the render + credit repositories.
 *
 * Backs tests and local mock-mode dev so the full product is clickable with no
 * database. Mirrors the semantics of the SQL functions in 0001_init.sql:
 * append-only credit log, atomic reserve with a balance check.
 */
import { appError, err, ok, type Result, type AppError } from '@/lib/result';
import type { WordTiming } from '@/features/providers/types';
import type { PlanId } from '@/config/plans';
import {
  effectivePlanId,
  PAID_GRANT_REASONS,
  type PlanRepository,
  type SubscriptionSnapshot,
} from '@/features/billing/entitlements';
import type {
  AssetKind,
  CreateJobInput,
  CreditRepository,
  NewScene,
  RenderJobRecord,
  RenderRepository,
  SceneRecord,
} from './repository';

let counter = 0;
const id = (prefix: string): string =>
  `${prefix}_${(++counter).toString(36)}_${Date.now().toString(36)}`;

interface CreditTx {
  userId: string;
  delta: number;
  reason: string;
  jobId?: string;
}

export class InMemoryStore implements RenderRepository, CreditRepository, PlanRepository {
  private jobs = new Map<string, RenderJobRecord>();
  private scenes = new Map<string, SceneRecord>();
  private assets: { id: string; userId: string; jobId: string; kind: AssetKind; url: string }[] =
    [];
  private credits: CreditTx[] = [];
  private leases = new Map<string, { owner: string; until: number }>();
  private subscriptions = new Map<string, SubscriptionSnapshot>();

  /** Test helper: seed a user with a starting balance. */
  seedCredits(userId: string, amount: number): void {
    this.credits.push({ userId, delta: amount, reason: 'trial_grant' });
  }

  /** Test helper: give a user a subscription (status defaults to active). */
  setSubscription(userId: string, planId: PlanId, status = 'active'): void {
    this.subscriptions.set(userId, { planId, status });
  }

  // ── PlanRepository ────────────────────────────────────────────────────────
  async planOf(userId: string): Promise<PlanId> {
    return effectivePlanId(this.subscriptions.get(userId) ?? null);
  }

  async hasPaid(userId: string): Promise<boolean> {
    const paid: readonly string[] = PAID_GRANT_REASONS;
    return this.credits.some((t) => t.userId === userId && paid.includes(t.reason));
  }

  // ── RenderRepository ──────────────────────────────────────────────────────
  async createJob(input: CreateJobInput): Promise<RenderJobRecord> {
    const now = new Date().toISOString();
    const job: RenderJobRecord = {
      id: id('job'),
      userId: input.userId,
      status: 'draft',
      topic: input.topic,
      themeId: input.themeId,
      targetDurationSec: input.targetDurationSec,
      language: input.language,
      modelTier: input.modelTier,
      title: null,
      voiceoverUrl: null,
      words: null,
      outputAssetUrl: null,
      estimatedCredits: 0,
      chargedCredits: 0,
      actualCredits: 0,
      apiCostUsd: 0,
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    return { ...job };
  }

  async getJob(jobId: string): Promise<RenderJobRecord | null> {
    const job = this.jobs.get(jobId);
    return job ? { ...job } : null;
  }

  async updateJob(jobId: string, patch: Partial<RenderJobRecord>): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`job ${jobId} not found`);
    this.jobs.set(jobId, { ...job, ...patch, updatedAt: new Date().toISOString() });
  }

  async listJobs(userId: string): Promise<RenderJobRecord[]> {
    return [...this.jobs.values()]
      .filter((j) => j.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((j) => ({ ...j }));
  }

  async addScenes(jobId: string, scenes: NewScene[]): Promise<SceneRecord[]> {
    const created = scenes.map((s) => {
      const record: SceneRecord = {
        id: id('scene'),
        jobId,
        idx: s.idx,
        narration: s.narration,
        imagePrompt: s.imagePrompt,
        motionPrompt: s.motionPrompt,
        durationSec: s.durationSec,
        imageUrl: null,
        videoUrl: null,
        videoJob: null,
        clipDurationMs: null,
        status: 'pending',
      };
      this.scenes.set(record.id, record);
      return { ...record };
    });
    return created;
  }

  async listScenes(jobId: string): Promise<SceneRecord[]> {
    return [...this.scenes.values()]
      .filter((s) => s.jobId === jobId)
      .sort((a, b) => a.idx - b.idx)
      .map((s) => ({ ...s }));
  }

  async updateScene(sceneId: string, patch: Partial<SceneRecord>): Promise<void> {
    const scene = this.scenes.get(sceneId);
    if (!scene) throw new Error(`scene ${sceneId} not found`);
    this.scenes.set(sceneId, { ...scene, ...patch });
  }

  async claimJob(jobId: string, owner: string, ttlMs: number): Promise<boolean> {
    const lease = this.leases.get(jobId);
    if (lease && lease.until > Date.now() && lease.owner !== owner) return false;
    this.leases.set(jobId, { owner, until: Date.now() + ttlMs });
    return true;
  }

  async releaseJob(jobId: string, owner: string): Promise<void> {
    if (this.leases.get(jobId)?.owner === owner) this.leases.delete(jobId);
  }

  async listStalledJobs(idleMs: number, limit: number): Promise<RenderJobRecord[]> {
    const now = Date.now();
    return [...this.jobs.values()]
      .filter((j) => j.status !== 'done' && j.status !== 'failed')
      .filter((j) => (this.leases.get(j.id)?.until ?? 0) <= now)
      .filter((j) => Date.parse(j.updatedAt) <= now - idleMs)
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      .slice(0, limit)
      .map((j) => ({ ...j }));
  }

  async saveAsset(input: {
    userId: string;
    jobId: string;
    kind: AssetKind;
    url: string;
  }): Promise<{ id: string; url: string }> {
    const asset = { id: id('asset'), ...input };
    this.assets.push(asset);
    return { id: asset.id, url: asset.url };
  }

  // ── CreditRepository ──────────────────────────────────────────────────────
  async balance(userId: string): Promise<number> {
    return this.credits.filter((t) => t.userId === userId).reduce((sum, t) => sum + t.delta, 0);
  }

  async reserve(userId: string, amount: number, jobId: string): Promise<Result<number, AppError>> {
    if (amount < 0) throw new Error('amount must be >= 0');
    const current = await this.balance(userId);
    if (current < amount) {
      return err(appError('insufficient_credits', 'Not enough credits for this video.'));
    }
    this.credits.push({ userId, delta: -amount, reason: 'reserve', jobId });
    return ok(current - amount);
  }

  async add(
    userId: string,
    delta: number,
    reason: 'trial_grant' | 'monthly_grant' | 'topup' | 'settle_adjust' | 'refund',
    jobId?: string,
  ): Promise<number> {
    this.credits.push({ userId, delta, reason, jobId });
    return this.balance(userId);
  }
}

/** Convenience: word timings type re-export for consumers building fakes. */
export type { WordTiming };
