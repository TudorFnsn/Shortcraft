/**
 * Store selector. Returns the Supabase-backed store when the service role is
 * configured, otherwise a process-singleton in-memory store so local dev works
 * without any database (state is ephemeral, per server process).
 */
import { env } from '@/lib/env';
import type { PlanRepository } from '@/features/billing/entitlements';
import type { CreditRepository, RenderRepository } from './repository';
import { InMemoryStore } from './repository.memory';
import { SupabaseStore } from './repository.supabase';

export type Store = RenderRepository & CreditRepository & PlanRepository;

/** Server-side persistence requires the service role key. */
export function isSupabaseConfigured(): boolean {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

let memo: InMemoryStore | null = null;

export function getStore(): Store {
  if (isSupabaseConfigured()) return new SupabaseStore();
  memo ??= new InMemoryStore();
  return memo;
}
