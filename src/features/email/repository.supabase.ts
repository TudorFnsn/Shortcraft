/**
 * Supabase-backed lifecycle-email data (service role; migration 0009).
 * Reads only what the planner needs, within LOOKBACK_MS, plus the auth users
 * (email + confirmation), paged.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { SupabaseStore } from '@/features/render/repository.supabase';
import { PAID_GRANT_REASONS } from '@/features/billing/entitlements';
import { LOOKBACK_MS, type Audience, type LifecycleKind } from './lifecycle';
import type { EmailLog, LifecycleSource } from './run';

const USERS_PAGE = 1000;
const ROWS_PAGE = 1000;

export class SupabaseLifecycleStore implements LifecycleSource, EmailLog {
  private readonly db: SupabaseClient;
  private readonly credits: SupabaseStore;

  constructor(client?: SupabaseClient) {
    this.db = client ?? createSupabaseAdminClient();
    this.credits = new SupabaseStore(this.db);
  }

  async loadAudience(now: Date): Promise<Audience> {
    const since = new Date(now.getTime() - LOOKBACK_MS).toISOString();
    const [authUsers, optedOut, jobs, subs, sends, paid] = await Promise.all([
      this.listAuthUsers(),
      this.db.from('profiles').select('id').eq('email_opt_out', true),
      this.db
        .from('render_jobs')
        .select('user_id, created_at')
        .eq('status', 'done')
        .gte('created_at', since),
      this.db.from('subscriptions').select('user_id, plan_id, status, created_at'),
      this.db.from('email_log').select('user_id, kind, created_at').gte('created_at', since),
      this.listPaidUserIds(),
    ]);
    for (const r of [optedOut, jobs, subs, sends]) {
      if (r.error) throw new Error(`lifecycle audience: ${r.error.message}`);
    }
    const out = new Set((optedOut.data ?? []).map((r: { id: string }) => r.id));
    type Row = Record<string, string>;
    return {
      users: authUsers.map((u) => ({ ...u, optedOut: out.has(u.id) })),
      doneJobs: ((jobs.data ?? []) as Row[]).map((r) => ({
        userId: r.user_id!,
        createdAt: new Date(r.created_at!),
      })),
      subscriptions: ((subs.data ?? []) as Row[]).map((r) => ({
        userId: r.user_id!,
        planId: r.plan_id!,
        status: r.status!,
        createdAt: new Date(r.created_at!),
      })),
      recentSends: ((sends.data ?? []) as Row[]).map((r) => ({
        userId: r.user_id!,
        kind: r.kind as LifecycleKind,
        createdAt: new Date(r.created_at!),
      })),
      paidUserIds: paid,
    };
  }

  /**
   * Everyone with a plan or top-up grant, paged: the API caps a select at 1,000
   * rows, and a truncated list would send the upgrade email to a payer.
   */
  private async listPaidUserIds(): Promise<string[]> {
    const ids = new Set<string>();
    for (let from = 0; ; from += ROWS_PAGE) {
      const { data, error } = await this.db
        .from('credit_transactions')
        .select('id, user_id')
        .in('reason', [...PAID_GRANT_REASONS])
        .order('id')
        .range(from, from + ROWS_PAGE - 1);
      if (error) throw new Error(`lifecycle paid users: ${error.message}`);
      for (const r of data as { user_id: string }[]) ids.add(r.user_id);
      if (data.length < ROWS_PAGE) return [...ids];
    }
  }

  private async listAuthUsers() {
    const users: { id: string; email: string | null; emailConfirmed: boolean; createdAt: Date }[] =
      [];
    for (let page = 1; ; page++) {
      const { data, error } = await this.db.auth.admin.listUsers({ page, perPage: USERS_PAGE });
      if (error) throw new Error(`lifecycle users: ${error.message}`);
      for (const u of data.users) {
        users.push({
          id: u.id,
          email: u.email ?? null,
          emailConfirmed: Boolean(u.email_confirmed_at),
          createdAt: new Date(u.created_at),
        });
      }
      if (data.users.length < USERS_PAGE) return users;
    }
  }

  balance(userId: string): Promise<number> {
    return this.credits.balance(userId);
  }

  async claim(userId: string, kind: LifecycleKind, periodKey: string): Promise<boolean> {
    const { error } = await this.db
      .from('email_log')
      .insert({ user_id: userId, kind, period_key: periodKey });
    if (!error) return true;
    if (error.code === '23505') return false; // unique_violation: already claimed
    throw new Error(`email_log claim: ${error.message}`);
  }

  async release(userId: string, kind: LifecycleKind, periodKey: string): Promise<void> {
    const { error } = await this.db
      .from('email_log')
      .delete()
      .match({ user_id: userId, kind, period_key: periodKey });
    if (error) throw new Error(`email_log release: ${error.message}`);
  }

  async optOut(userId: string): Promise<void> {
    const { error } = await this.db
      .from('profiles')
      .update({ email_opt_out: true })
      .eq('id', userId);
    if (error) throw new Error(`email opt-out: ${error.message}`);
  }
}
