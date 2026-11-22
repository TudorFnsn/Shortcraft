/**
 * Database preflight: which migrations a Supabase project is missing, checked
 * READ-ONLY before a deploy (the owner applies migrations by hand, so prod can
 * lag the code: e.g. 0007 was found unapplied in prod on 2026-11-14).
 *
 * Each migration has one probe: the columns it adds (checkable through the
 * Data API with a zero-row select) and/or a SQL condition for what the Data
 * API can't see (functions, constraints, cron jobs). `preflightSql()` turns
 * every probe into one query to paste into the Supabase SQL Editor;
 * `scripts/db-preflight.mts` runs the column probes with the service role.
 * Pure: no I/O here. tests/ops/schema-preflight.test.ts requires a probe for
 * every file in supabase/migrations.
 */
import { CREDIT_REASONS } from '@/features/credits/ledger';

export interface ColumnProbe {
  table: string;
  columns: string[];
}

export interface MigrationProbe {
  /** File name without `.sql`, e.g. `0013_referrals`. */
  migration: string;
  /** Columns the migration adds (public schema). */
  columns: ColumnProbe[];
  /** Extra SQL boolean for what columns can't show; null when columns suffice. */
  sql: string | null;
}

const fn = (name: string) =>
  `exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '${name}')`;

/** True when the ledger reason check allows every reason the code writes. */
const reasonsSql = `coalesce((select ${CREDIT_REASONS.map(
  (r) => `pg_get_constraintdef(c.oid) like '%''${r}''%'`,
).join(
  ' and ',
)} from pg_constraint c where c.conname = 'credit_transactions_reason_check'), false)`;

export const MIGRATION_PROBES: readonly MigrationProbe[] = [
  {
    migration: '0001_init',
    columns: [
      { table: 'profiles', columns: ['id', 'plan_id'] },
      { table: 'credit_transactions', columns: ['id', 'user_id', 'delta', 'reason'] },
      { table: 'render_jobs', columns: ['id', 'status'] },
      { table: 'scenes', columns: ['id', 'job_id'] },
      { table: 'assets', columns: ['id', 'job_id'] },
      { table: 'subscriptions', columns: ['id', 'status'] },
    ],
    sql: `${fn('reserve_credits')} and ${fn('add_credits')}`,
  },
  {
    migration: '0002_stripe_events',
    columns: [{ table: 'stripe_events', columns: ['id'] }],
    sql: null,
  },
  {
    migration: '0003_credit_idempotency',
    columns: [{ table: 'credit_transactions', columns: ['idempotency_key'] }],
    sql: fn('grant_credits_once'),
  },
  {
    migration: '0004_async_pipeline',
    columns: [
      { table: 'render_jobs', columns: ['charged_credits', 'locked_by', 'locked_until'] },
      { table: 'scenes', columns: ['video_job', 'clip_duration_ms'] },
    ],
    sql: `${fn('claim_render_job')} and ${fn('release_render_job')}`,
  },
  {
    migration: '0005_hardening',
    columns: [],
    sql: `exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'assets' and indexdef ilike '%(job_id)%')`,
  },
  {
    migration: '0006_rls_auto_enable_rpc',
    columns: [],
    // Only revokes; "applied" = the RPC is no longer executable by signed-in users.
    sql: `not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'rls_auto_enable' and has_function_privilege('authenticated', p.oid, 'execute'))`,
  },
  {
    migration: '0007_pg_cron_sweep',
    columns: [],
    sql: `exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from cron.job where jobname = 'shortcraft-advance-jobs')`,
  },
  {
    migration: '0008_posted_at',
    columns: [{ table: 'render_jobs', columns: ['posted_at'] }],
    sql: null,
  },
  {
    migration: '0009_lifecycle_email',
    columns: [
      { table: 'email_log', columns: ['id', 'user_id', 'kind'] },
      { table: 'profiles', columns: ['email_opt_out'] },
    ],
    sql: null,
  },
  {
    migration: '0010_voice_studio',
    columns: [{ table: 'render_jobs', columns: ['voice_id', 'voice_settings', 'parent_job_id'] }],
    sql: null,
  },
  {
    migration: '0011_voice_previews',
    columns: [{ table: 'voice_previews', columns: ['id', 'user_id', 'cache_key'] }],
    sql: null,
  },
  {
    migration: '0012_user_voices',
    columns: [
      { table: 'user_voices', columns: ['id', 'user_id', 'provider_voice_id'] },
      { table: 'voice_design_rounds', columns: ['id', 'user_id', 'description'] },
    ],
    sql: null,
  },
  {
    migration: '0013_referrals',
    columns: [{ table: 'profiles', columns: ['referral_code', 'referred_by', 'referred_at'] }],
    sql: reasonsSql,
  },
  {
    migration: '0014_cost_breakdown',
    columns: [{ table: 'render_jobs', columns: ['cost_breakdown'] }],
    sql: null,
  },
  { migration: '0015_admin_grant_reason', columns: [], sql: reasonsSql },
];

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;

function columnsSql(probe: ColumnProbe): string {
  return `(select count(*) from information_schema.columns where table_schema = 'public' and table_name = ${quote(
    probe.table,
  )} and column_name in (${probe.columns.map(quote).join(', ')})) = ${probe.columns.length}`;
}

/** Everything a probe checks, as one SQL boolean. */
export function probeCondition(probe: MigrationProbe): string {
  const parts = [...probe.columns.map(columnsSql), ...(probe.sql ? [`(${probe.sql})`] : [])];
  return parts.length ? parts.join(' and ') : 'true';
}

/**
 * One read-only query (selects from catalogs only) listing each migration with
 * `applied` true/false. Paste into the Supabase SQL Editor. The 0007 check reads
 * `cron.job`, so it errors if pg_cron is not installed at all: that also means
 * 0007 is not applied.
 */
export function preflightSql(probes: readonly MigrationProbe[] = MIGRATION_PROBES): string {
  const rows = probes.map(
    (p) => `  select ${quote(p.migration)} as migration, (${probeCondition(p)}) as applied`,
  );
  return `-- Shortcraft database preflight (read-only)\n${rows.join('\nunion all\n')}\norder by migration;\n`;
}

export type ProbeOutcome =
  | { migration: string; status: 'applied' }
  | { migration: string; status: 'missing'; missing: string[] }
  | { migration: string; status: 'sql_only' };

/**
 * Turns column-probe results into per-migration outcomes. `missingColumns`
 * holds `table.column` entries the Data API rejected (a missing table makes
 * all its columns missing). A migration with no columns needs the SQL query.
 */
export function evaluateColumnProbes(
  missingColumns: ReadonlySet<string>,
  probes: readonly MigrationProbe[] = MIGRATION_PROBES,
): ProbeOutcome[] {
  return probes.map((p) => {
    if (p.columns.length === 0) return { migration: p.migration, status: 'sql_only' };
    const missing = p.columns.flatMap((c) =>
      c.columns.map((col) => `${c.table}.${col}`).filter((k) => missingColumns.has(k)),
    );
    return missing.length
      ? { migration: p.migration, status: 'missing', missing }
      : { migration: p.migration, status: 'applied' };
  });
}

export function formatProbeReport(outcomes: readonly ProbeOutcome[]): string {
  const lines = outcomes.map((o) => {
    if (o.status === 'applied')
      return `  ok       ${o.migration} (columns; also run the SQL check)`;
    if (o.status === 'sql_only') return `  ?        ${o.migration} (only the SQL check can tell)`;
    return `  MISSING  ${o.migration}: ${o.missing.join(', ')}`;
  });
  const missing = outcomes.filter((o) => o.status === 'missing').length;
  return [
    'Database preflight (read-only, Data API column probes)',
    ...lines,
    '',
    missing
      ? `${missing} migration(s) missing: apply them in order in the Supabase SQL Editor before deploying.`
      : 'No missing columns. Run the SQL check below for functions, constraints and the cron job.',
  ].join('\n');
}
