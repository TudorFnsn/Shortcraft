import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  evaluateColumnProbes,
  formatProbeReport,
  MIGRATION_PROBES,
  preflightSql,
  probeCondition,
} from '@/features/ops/schema-preflight';

const dir = join(process.cwd(), 'supabase', 'migrations');
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

describe('schema preflight probes', () => {
  it('has exactly one probe per migration file, in order', () => {
    expect(MIGRATION_PROBES.map((p) => `${p.migration}.sql`)).toEqual(files);
  });

  it('only probes columns the migration actually creates', () => {
    for (const p of MIGRATION_PROBES) {
      const sql = readFileSync(join(dir, `${p.migration}.sql`), 'utf8');
      for (const c of p.columns) {
        expect(sql, `${p.migration} ${c.table}`).toContain(c.table);
        for (const col of c.columns)
          expect(sql, `${p.migration} ${c.table}.${col}`).toMatch(new RegExp(`\\b${col}\\b`));
      }
    }
  });

  it('gives every probe something to check', () => {
    for (const p of MIGRATION_PROBES) expect(probeCondition(p)).not.toBe('true');
  });
});

describe('preflightSql', () => {
  const sql = preflightSql();

  it('lists every migration once', () => {
    for (const p of MIGRATION_PROBES) expect(sql.split(`'${p.migration}'`).length - 1).toBe(1);
  });

  it('is read-only', () => {
    const body = sql.replace(/--.*$/gm, '');
    expect(body).not.toMatch(/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate)\b/i);
  });

  it('checks the cron job, the referral and admin reasons, and the new columns', () => {
    expect(sql).toContain("jobname = 'shortcraft-advance-jobs'");
    expect(sql).toContain("'%''referral_bonus''%'");
    expect(sql).toContain("'%''admin_grant''%'");
    expect(sql).toContain("'cost_breakdown'");
  });
});

describe('evaluateColumnProbes', () => {
  it('reports applied, missing and SQL-only migrations', () => {
    const out = evaluateColumnProbes(new Set(['profiles.referral_code', 'profiles.referred_at']));
    expect(out.find((o) => o.migration === '0013_referrals')).toEqual({
      migration: '0013_referrals',
      status: 'missing',
      missing: ['profiles.referral_code', 'profiles.referred_at'],
    });
    expect(out.find((o) => o.migration === '0014_cost_breakdown')?.status).toBe('applied');
    expect(out.find((o) => o.migration === '0007_pg_cron_sweep')?.status).toBe('sql_only');
  });

  it('formats a report that says what to do', () => {
    const missing = formatProbeReport(
      evaluateColumnProbes(new Set(['render_jobs.cost_breakdown'])),
    );
    expect(missing).toContain('MISSING  0014_cost_breakdown: render_jobs.cost_breakdown');
    expect(missing).toContain('1 migration(s) missing');
    expect(formatProbeReport(evaluateColumnProbes(new Set()))).toContain('No missing columns');
  });
});
