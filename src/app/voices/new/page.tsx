import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { siteConfig } from '@/config/site';
import { getCurrentUser } from '@/features/auth/session';
import { SAVE_VOICE_CREDITS, VOICE_DESIGN_ROUND_CREDITS } from '@/features/render/pricing';
import { getStore } from '@/features/render/store';
import { getUserVoiceStore } from '@/features/voice/store';
import { slotsFor } from '../slots';
import { CreateVoiceView } from './create-voice-view';

export const metadata: Metadata = { title: `Create a voice — ${siteConfig.name}` };

export default async function CreateVoicePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const store = getStore();
  const [planId, balance, saved] = await Promise.all([
    store.planOf(user.id),
    store.balance(user.id),
    getUserVoiceStore().listVoices(user.id),
  ]);

  return (
    <main className="mx-auto max-w-[760px] px-4 py-8 sm:px-8 lg:py-12">
      <CreateVoiceView
        slots={slotsFor(saved.length, planId)}
        balance={balance}
        prices={{ designRound: VOICE_DESIGN_ROUND_CREDITS, save: SAVE_VOICE_CREDITS }}
      />
    </main>
  );
}
