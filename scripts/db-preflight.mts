/**
 * Database preflight (READ-ONLY): which migrations the Supabase project in
 * `.env.local` is missing, before a deploy. Probes every column a migration
 * adds with a zero-row select through the Data API (service role), then prints
 * one SQL query for the SQL Editor that also checks functions, the ledger
 * reason constraint and the pg_cron job. Never writes. Exit 1 = something missing.
 *
 * Run: npx tsx scripts/db-preflight.mts           (probe + print the SQL)
 *      npx tsx scripts/db-preflight.mts --sql     (only print the SQL, no keys needed)
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = resolve('.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const { MIGRATION_PROBES, evaluateColumnProbes, formatProbeReport, preflightSql } =
  await import('@/features/ops/schema-preflight');

if (process.argv.includes('--sql')) {
  console.log(preflightSql());
  process.exit(0);
}

const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');
const admin = createSupabaseAdminClient();

// profiles.id exists since 0001: if even that fails, the connection or key is wrong.
const ping = await admin.from('profiles').select('id').limit(0);
if (ping.error) {
  console.error(`Cannot read the database: ${ping.error.message}`);
  process.exit(2);
}

const missing = new Set<string>();
for (const probe of MIGRATION_PROBES) {
  for (const { table, columns } of probe.columns) {
    // One column at a time so the report names exactly what is missing.
    for (const column of columns) {
      const { error } = await admin.from(table).select(column).limit(0);
      if (error) missing.add(`${table}.${column}`);
    }
  }
}

const outcomes = evaluateColumnProbes(missing);
console.log(formatProbeReport(outcomes));
console.log('\nPaste into the Supabase SQL Editor for the full check (read-only):\n');
console.log(preflightSql());
process.exit(outcomes.some((o) => o.status === 'missing') ? 1 : 0);
