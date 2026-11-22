/**
 * Referral store selector, like render/store.ts: Supabase when the service
 * role is configured, otherwise one in-memory store per server process.
 */
import { isSupabaseConfigured } from '@/features/render/store';
import { InMemoryReferralRepository, type ReferralRepository } from './referral';
import { SupabaseReferralRepository } from './referral.supabase';

let memo: InMemoryReferralRepository | null = null;

export function getReferralRepository(): ReferralRepository {
  if (isSupabaseConfigured()) return new SupabaseReferralRepository();
  memo ??= new InMemoryReferralRepository();
  return memo;
}
