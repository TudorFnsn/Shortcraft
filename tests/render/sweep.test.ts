import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { InMemoryStore } from '@/features/render/repository.memory';
import { advanceJob } from '@/features/render/orchestrator';
import { advanceJobs } from '@/features/render/sweep';

const USER = 'user-1';

async function stalledJob() {
  const store = new InMemoryStore();
  store.seedCredits(USER, 50_000);
  const job = await store.createJob({
    userId: USER,
    topic: 'why cats purr',
    themeId: 'fun-facts',
    targetDurationSec: 12,
    language: 'en',
    modelTier: 'standard',
  });
  const deps = { repo: store, credits: store, plans: store };
  // What POST /api/jobs does before its background run dies: hold credits, stop.
  const held = await advanceJob(deps, job.id);
  expect(held.ok && held.value.job.status).toBe('scripting');
  return { store, job, deps };
}

describe('advanceJobs (cron sweep)', () => {
  it('finishes a job whose background run died', async () => {
    const { store, job, deps } = await stalledJob();
    const results = await advanceJobs(deps, [job], 60_000);
    expect(results).toEqual([{ id: job.id, status: 'done' }]);
    expect((await store.getJob(job.id))?.status).toBe('done');
  });

  it('one bad job does not stop the others', async () => {
    const { job, deps } = await stalledJob();
    const results = await advanceJobs(deps, [{ id: 'missing' }, job], 60_000);
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.id === job.id)?.status).toBe('done');
    expect(results.find((r) => r.id === 'missing')?.status).not.toBe('done');
  });

  it('does nothing for an empty sweep', async () => {
    const { deps } = await stalledJob();
    expect(await advanceJobs(deps, [], 60_000)).toEqual([]);
  });
});

describe('cron schedule config', () => {
  it('vercel.json only has daily (or rarer) crons, which Vercel Hobby accepts', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
      crons?: Array<{ path: string; schedule: string }>;
    };
    for (const cron of config.crons ?? []) {
      const [minute, hour] = cron.schedule.split(/\s+/);
      expect(minute, cron.schedule).toMatch(/^\d+$/);
      expect(hour, cron.schedule).toMatch(/^\d+$/);
    }
    expect(config.crons?.map((c) => c.path)).toContain('/api/cron/advance-jobs');
  });

  const sql = readFileSync('supabase/migrations/0007_pg_cron_sweep.sql', 'utf8');
  const code = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');

  it('pg_cron calls the sweep every minute', () => {
    expect(code).toMatch(
      /cron\.schedule\(\s*'shortcraft-advance-jobs',\s*'\* \* \* \* \*',\s*'select private\.advance_jobs_tick\(\)'/,
    );
    expect(code).toContain("'/api/cron/advance-jobs'");
  });

  it('keeps the URL and secret in Vault, never in the migration', () => {
    expect(code).toContain('vault.decrypted_secrets');
    expect(code).not.toMatch(/https?:\/\//);
    expect(code).not.toMatch(/Bearer [A-Za-z0-9]/);
  });

  it('keeps the tick function out of the exposed schema and off the RPC API', () => {
    expect(code).not.toMatch(/function\s+public\./i);
    expect(code).toMatch(
      /revoke execute on function private\.advance_jobs_tick\(\) from public, anon, authenticated;/,
    );
    expect(code).not.toMatch(/security\s+definer/i);
  });
});
