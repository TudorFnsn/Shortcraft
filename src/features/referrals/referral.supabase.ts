/**
 * Supabase-backed referrals (migration 0013, service role). Before 0013 is
 * applied the columns don't exist: reads then answer "no code / no inviter"
 * (with a warning) so sign-in, checkout and the webhook keep working.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import type { ReferralRepository } from './referral';

interface PgError {
  code?: string;
  message?: string;
}

/** Undefined column (raw Postgres or PostgREST's schema cache): 0013 not applied. */
const isNotMigrated = (e: PgError): boolean =>
  e.code === '42703' || e.code === 'PGRST204' || /referr\w* does not exist/i.test(e.message ?? '');

export class SupabaseReferralRepository implements ReferralRepository {
  private readonly db: SupabaseClient;
  constructor(client?: SupabaseClient) {
    this.db = client ?? createSupabaseAdminClient();
  }

  private fail(op: string, error: PgError): null {
    if (isNotMigrated(error)) {
      logger.warn('referrals: migration 0013 not applied', { op });
      return null;
    }
    throw new Error(`${op}: ${error.message}`);
  }

  async userIdForCode(code: string): Promise<string | null> {
    const { data, error } = await this.db
      .from('profiles')
      .select('id')
      .eq('referral_code', code)
      .maybeSingle();
    if (error) return this.fail('userIdForCode', error);
    return (data as { id: string } | null)?.id ?? null;
  }

  async codeOf(userId: string): Promise<string | null> {
    const { data, error } = await this.db
      .from('profiles')
      .select('referral_code')
      .eq('id', userId)
      .maybeSingle();
    if (error) return this.fail('codeOf', error);
    return (data as { referral_code: string | null } | null)?.referral_code ?? null;
  }

  async referredBy(userId: string): Promise<string | null> {
    const { data, error } = await this.db
      .from('profiles')
      .select('referred_by')
      .eq('id', userId)
      .maybeSingle();
    if (error) return this.fail('referredBy', error);
    return (data as { referred_by: string | null } | null)?.referred_by ?? null;
  }

  async attach(refereeId: string, referrerId: string): Promise<boolean> {
    // `referred_by is null` makes the first claim win, even under a race.
    const { data, error } = await this.db
      .from('profiles')
      .update({ referred_by: referrerId, referred_at: new Date().toISOString() })
      .eq('id', refereeId)
      .is('referred_by', null)
      .select('id');
    if (error) return this.fail('attach', error) ?? false;
    return ((data as unknown[] | null) ?? []).length > 0;
  }

  async invitedCount(referrerId: string): Promise<number> {
    const { count, error } = await this.db
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('referred_by', referrerId);
    if (error) return this.fail('invitedCount', error) ?? 0;
    return count ?? 0;
  }

  async rewardedCount(referrerId: string): Promise<number> {
    const { count, error } = await this.db
      .from('credit_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', referrerId)
      .eq('reason', 'referral_bonus')
      .like('idempotency_key', 'referral:%:referrer');
    if (error) return this.fail('rewardedCount', error) ?? 0;
    return count ?? 0;
  }
}
