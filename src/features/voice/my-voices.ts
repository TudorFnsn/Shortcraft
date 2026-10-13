/**
 * My voices (Voice Studio V4): creators describe a voice, hear 3 designed
 * samples, and keep one as their own narrator for every future video.
 *
 * Money follows the video flow: each paid step places a credit hold first
 * (ref = the round or voice id), then the provider runs; a failure refunds
 * the hold. Designed voices are synthetic (they belong to no real person);
 * descriptions that ask for a real person's voice are refused.
 */
import { randomUUID } from 'node:crypto';
import type { Plan } from '@/config/plans';
import { isUserVoiceId } from '@/config/voices';
import { refundJob, reserveForJob } from '@/features/credits/service';
import type { CreditRepository } from '@/features/render/repository';
import { SAVE_VOICE_CREDITS, VOICE_DESIGN_ROUND_CREDITS } from '@/features/render/pricing';
import { appError, err, ok, type AppError, type Result } from '@/lib/result';
import type { VoiceDesigner } from './designer';

export interface UserVoice {
  /** Public id, `u_<uuid>`: what jobs store and the API accepts as `voiceId`. */
  id: string;
  userId: string;
  providerVoiceId: string;
  name: string;
  description: string;
  createdAt: string;
}

export interface DesignRound {
  id: string;
  userId: string;
  description: string;
  generatedVoiceIds: string[];
  /** Set once one of its samples was saved (a round can be saved once). */
  savedVoiceId: string | null;
}

export interface UserVoiceStore {
  listVoices(userId: string): Promise<UserVoice[]>;
  getVoice(id: string): Promise<UserVoice | null>;
  insertVoice(voice: Omit<UserVoice, 'createdAt'>): Promise<UserVoice>;
  renameVoice(id: string, name: string): Promise<void>;
  deleteVoice(id: string): Promise<void>;
  insertRound(round: Omit<DesignRound, 'savedVoiceId'>): Promise<void>;
  getRound(id: string): Promise<DesignRound | null>;
  markRoundSaved(id: string, voiceId: string): Promise<void>;
}

export interface MyVoicesDeps {
  voices: UserVoiceStore;
  credits: CreditRepository;
  designer: VoiceDesigner;
}

export { isUserVoiceId };
export const newUserVoiceId = (): string => `u_${randomUUID()}`;
/** The uuid part, used as the credit hold's reference. */
const holdRef = (voiceId: string) => voiceId.slice(2);

export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 500;
export const NAME_MAX = 40;

/** Asking for a specific person's voice is a deepfake, not a design. */
const REAL_PERSON =
  /\b(sounds?|sounding)\s+(exactly\s+)?like\b|\bvoice\s+of\b|\bimpersonat|\bimitat|\bclon(e|ing)\b/i;

export function checkDescription(text: string): Result<string, AppError> {
  const d = text.replace(/\s+/g, ' ').trim();
  if (d.length < DESCRIPTION_MIN) {
    return err(
      appError(
        'invalid_input',
        'Describe the voice in a bit more detail (age, accent, pace, mood).',
      ),
    );
  }
  if (d.length > DESCRIPTION_MAX) {
    return err(
      appError('invalid_input', `Keep the description under ${DESCRIPTION_MAX} characters.`),
    );
  }
  if (REAL_PERSON.test(d)) {
    return err(appError('invalid_input', 'Describe a type of voice, not a real person.'));
  }
  return ok(d);
}

/** The ledger's "not enough credits" speaks of videos; say what this costs instead. */
const noCredits = (e: AppError, price: number): AppError =>
  e.code === 'insufficient_credits'
    ? appError(e.code, `This needs ${price.toLocaleString('en-US')} credits.`)
    : e;

/** One paid design round: 3 samples to choose from. */
export async function designVoice(
  deps: MyVoicesDeps,
  userId: string,
  description: string,
): Promise<
  Result<{ roundId: string; samples: { audioDataUrl: string }[]; credits: number }, AppError>
> {
  const checked = checkDescription(description);
  if (!checked.ok) return checked;
  const roundId = randomUUID();
  const held = await reserveForJob(deps.credits, userId, roundId, VOICE_DESIGN_ROUND_CREDITS);
  if (!held.ok) return err(noCredits(held.error, VOICE_DESIGN_ROUND_CREDITS));
  try {
    const { samples } = await deps.designer.design(checked.value);
    await deps.voices.insertRound({
      id: roundId,
      userId,
      description: checked.value,
      generatedVoiceIds: samples.map((s) => s.generatedVoiceId),
    });
    return ok({
      roundId,
      samples: samples.map((s) => ({ audioDataUrl: s.audioDataUrl })),
      credits: VOICE_DESIGN_ROUND_CREDITS,
    });
  } catch (cause) {
    await refundJob(deps.credits, userId, roundId, VOICE_DESIGN_ROUND_CREDITS);
    return err(
      appError('provider_failed', 'The voice samples could not be made; credits refunded.', cause),
    );
  }
}

/** Keep one sample of a paid round as the creator's voice, within the plan's limit. */
export async function saveVoice(
  deps: MyVoicesDeps,
  userId: string,
  plan: Plan,
  /** `sample` is the sample's position in the round (0–2): provider ids never reach the client. */
  input: { roundId: string; sample: number; name: string },
): Promise<Result<UserVoice, AppError>> {
  const round = await deps.voices.getRound(input.roundId);
  const generatedVoiceId = round?.generatedVoiceIds[input.sample];
  if (!round || round.userId !== userId || !generatedVoiceId) {
    return err(appError('not_found', 'That sample is no longer available. Make new samples.'));
  }
  if (round.savedVoiceId) {
    return err(appError('invalid_input', 'A voice from these samples is already saved.'));
  }
  const name = input.name.replace(/\s+/g, ' ').trim();
  if (!name || name.length > NAME_MAX) {
    return err(appError('invalid_input', `Give the voice a name (up to ${NAME_MAX} characters).`));
  }
  const used = (await deps.voices.listVoices(userId)).length;
  if (used >= plan.limits.savedVoices) {
    return err(
      appError(
        'plan_limit',
        `Your ${plan.name} plan keeps ${plan.limits.savedVoices} saved ${plan.limits.savedVoices === 1 ? 'voice' : 'voices'}. Delete one or upgrade to keep more.`,
      ),
    );
  }

  const id = newUserVoiceId();
  const held = await reserveForJob(deps.credits, userId, holdRef(id), SAVE_VOICE_CREDITS);
  if (!held.ok) return err(noCredits(held.error, SAVE_VOICE_CREDITS));
  let providerVoiceId: string | null = null;
  try {
    providerVoiceId = await deps.designer.save(generatedVoiceId, name, round.description);
    const voice = await deps.voices.insertVoice({
      id,
      userId,
      providerVoiceId,
      name,
      description: round.description,
    });
    await deps.voices.markRoundSaved(round.id, id);
    return ok(voice);
  } catch (cause) {
    await refundJob(deps.credits, userId, holdRef(id), SAVE_VOICE_CREDITS);
    // Saved at the provider but not here: free the slot rather than leak it.
    if (providerVoiceId) await deps.designer.remove(providerVoiceId).catch(() => undefined);
    return err(
      appError('provider_failed', 'The voice could not be saved; credits refunded.', cause),
    );
  }
}

export async function deleteVoice(
  deps: Pick<MyVoicesDeps, 'voices' | 'designer'>,
  userId: string,
  voiceId: string,
): Promise<Result<void, AppError>> {
  const voice = await deps.voices.getVoice(voiceId);
  if (!voice || voice.userId !== userId) return err(appError('not_found', 'Voice not found.'));
  // Provider first: if that fails the voice stays listed, so a retry can finish it.
  await deps.designer.remove(voice.providerVoiceId);
  await deps.voices.deleteVoice(voiceId);
  return ok(undefined);
}

export async function renameVoice(
  voices: UserVoiceStore,
  userId: string,
  voiceId: string,
  name: string,
): Promise<Result<void, AppError>> {
  const voice = await voices.getVoice(voiceId);
  if (!voice || voice.userId !== userId) return err(appError('not_found', 'Voice not found.'));
  const clean = name.replace(/\s+/g, ' ').trim();
  if (!clean || clean.length > NAME_MAX) {
    return err(appError('invalid_input', `Give the voice a name (up to ${NAME_MAX} characters).`));
  }
  await voices.renameVoice(voiceId, clean);
  return ok(undefined);
}

/**
 * The caller may narrate with this voice id: a catalog voice, or a saved
 * voice they own. Used by every route that takes a `voiceId`.
 */
export async function canUseVoice(
  voices: Pick<UserVoiceStore, 'getVoice'>,
  userId: string,
  voiceId: string | undefined,
): Promise<boolean> {
  if (!voiceId || !isUserVoiceId(voiceId)) return true; // catalog slugs are validated by the schema
  const v = await voices.getVoice(voiceId);
  return v !== null && v.userId === userId;
}

/** What the API returns for a saved voice: no provider id. */
export const publicVoice = (v: UserVoice) => ({
  id: v.id,
  name: v.name,
  description: v.description,
  createdAt: v.createdAt,
});

/** In-memory store for tests and mock mode. */
export class InMemoryUserVoiceStore implements UserVoiceStore {
  readonly voices = new Map<string, UserVoice>();
  readonly rounds = new Map<string, DesignRound>();

  async listVoices(userId: string) {
    return [...this.voices.values()].filter((v) => v.userId === userId);
  }
  async getVoice(id: string) {
    return this.voices.get(id) ?? null;
  }
  async insertVoice(v: Omit<UserVoice, 'createdAt'>) {
    const voice = { ...v, createdAt: new Date().toISOString() };
    this.voices.set(v.id, voice);
    return { ...voice };
  }
  async renameVoice(id: string, name: string) {
    const v = this.voices.get(id);
    if (v) v.name = name;
  }
  async deleteVoice(id: string) {
    this.voices.delete(id);
  }
  async insertRound(r: Omit<DesignRound, 'savedVoiceId'>) {
    this.rounds.set(r.id, { ...r, savedVoiceId: null });
  }
  async getRound(id: string) {
    const r = this.rounds.get(id);
    return r ? { ...r } : null;
  }
  async markRoundSaved(id: string, voiceId: string) {
    const r = this.rounds.get(id);
    if (r) r.savedVoiceId = voiceId;
  }
}
