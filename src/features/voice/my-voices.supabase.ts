/** Supabase-backed saved voices and design rounds (migration 0012, service role). */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import type { DesignRound, UserVoice, UserVoiceStore } from './my-voices';

interface VoiceRow {
  id: string;
  user_id: string;
  provider_voice_id: string;
  name: string;
  description: string;
  created_at: string;
}

interface RoundRow {
  id: string;
  user_id: string;
  description: string;
  generated_voice_ids: string[];
  saved_voice_id: string | null;
}

/** Rows keep a plain uuid; the app's public id is `u_<uuid>`. */
const toUuid = (publicId: string) => publicId.replace(/^u_/, '');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const toVoice = (r: VoiceRow): UserVoice => ({
  id: `u_${r.id}`,
  userId: r.user_id,
  providerVoiceId: r.provider_voice_id,
  name: r.name,
  description: r.description,
  createdAt: r.created_at,
});

export class SupabaseUserVoiceStore implements UserVoiceStore {
  private readonly db: SupabaseClient;
  constructor(client?: SupabaseClient) {
    this.db = client ?? createSupabaseAdminClient();
  }

  async listVoices(userId: string): Promise<UserVoice[]> {
    const { data, error } = await this.db
      .from('user_voices')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(`listVoices: ${error.message}`);
    return (data as VoiceRow[]).map(toVoice);
  }

  async getVoice(id: string): Promise<UserVoice | null> {
    const uuid = toUuid(id);
    if (!UUID.test(uuid)) return null;
    const { data, error } = await this.db
      .from('user_voices')
      .select('*')
      .eq('id', uuid)
      .maybeSingle();
    if (error) throw new Error(`getVoice: ${error.message}`);
    return data ? toVoice(data as VoiceRow) : null;
  }

  async insertVoice(v: Omit<UserVoice, 'createdAt'>): Promise<UserVoice> {
    const { data, error } = await this.db
      .from('user_voices')
      .insert({
        id: toUuid(v.id),
        user_id: v.userId,
        provider_voice_id: v.providerVoiceId,
        name: v.name,
        description: v.description,
      })
      .select('*')
      .single();
    if (error) throw new Error(`insertVoice: ${error.message}`);
    return toVoice(data as VoiceRow);
  }

  async renameVoice(id: string, name: string): Promise<void> {
    const { error } = await this.db.from('user_voices').update({ name }).eq('id', toUuid(id));
    if (error) throw new Error(`renameVoice: ${error.message}`);
  }

  async deleteVoice(id: string): Promise<void> {
    const { error } = await this.db.from('user_voices').delete().eq('id', toUuid(id));
    if (error) throw new Error(`deleteVoice: ${error.message}`);
  }

  async insertRound(r: Omit<DesignRound, 'savedVoiceId'>): Promise<void> {
    const { error } = await this.db.from('voice_design_rounds').insert({
      id: r.id,
      user_id: r.userId,
      description: r.description,
      generated_voice_ids: r.generatedVoiceIds,
    });
    if (error) throw new Error(`insertRound: ${error.message}`);
  }

  async getRound(id: string): Promise<DesignRound | null> {
    if (!UUID.test(id)) return null;
    const { data, error } = await this.db
      .from('voice_design_rounds')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`getRound: ${error.message}`);
    if (!data) return null;
    const r = data as RoundRow;
    return {
      id: r.id,
      userId: r.user_id,
      description: r.description,
      generatedVoiceIds: r.generated_voice_ids,
      savedVoiceId: r.saved_voice_id ? `u_${r.saved_voice_id}` : null,
    };
  }

  async markRoundSaved(id: string, voiceId: string): Promise<void> {
    const { error } = await this.db
      .from('voice_design_rounds')
      .update({ saved_voice_id: toUuid(voiceId) })
      .eq('id', id);
    if (error) throw new Error(`markRoundSaved: ${error.message}`);
  }
}
