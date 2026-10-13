/** Supabase-backed preview log (migration 0011, service role). */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import type { PreviewLog } from './preview';

export class SupabasePreviewLog implements PreviewLog {
  private readonly db: SupabaseClient;
  constructor(client?: SupabaseClient) {
    this.db = client ?? createSupabaseAdminClient();
  }

  async findCached(cacheKey: string, since: Date): Promise<string | null> {
    const { data, error } = await this.db
      .from('voice_previews')
      .select('audio_url')
      .eq('cache_key', cacheKey)
      .gt('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`voice preview cache: ${error.message}`);
    return (data as { audio_url: string } | null)?.audio_url ?? null;
  }

  async countSince(userId: string, since: Date): Promise<number> {
    const { count, error } = await this.db
      .from('voice_previews')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gt('created_at', since.toISOString());
    if (error) throw new Error(`voice preview count: ${error.message}`);
    return count ?? 0;
  }

  async record(userId: string, cacheKey: string, audioUrl: string): Promise<void> {
    const { error } = await this.db
      .from('voice_previews')
      .insert({ user_id: userId, cache_key: cacheKey, audio_url: audioUrl });
    if (error) throw new Error(`voice preview record: ${error.message}`);
  }
}
