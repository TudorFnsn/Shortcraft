/**
 * Saved-voice store selector, like render/store.ts: Supabase when the service
 * role is configured, otherwise one in-memory store per server process.
 */
import { isSupabaseConfigured } from '@/features/render/store';
import { InMemoryUserVoiceStore, type UserVoiceStore } from './my-voices';
import { SupabaseUserVoiceStore } from './my-voices.supabase';

let memo: InMemoryUserVoiceStore | null = null;

export function getUserVoiceStore(): UserVoiceStore {
  if (isSupabaseConfigured()) return new SupabaseUserVoiceStore();
  memo ??= new InMemoryUserVoiceStore();
  return memo;
}
