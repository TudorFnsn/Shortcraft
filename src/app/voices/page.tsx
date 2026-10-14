import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { siteConfig } from '@/config/site';
import { getCurrentUser } from '@/features/auth/session';
import { getStore } from '@/features/render/store';
import { publicVoice } from '@/features/voice/my-voices';
import { getUserVoiceStore } from '@/features/voice/store';
import { MyVoicesView } from './my-voices-view';
import { slotsFor } from './slots';

export const metadata: Metadata = { title: `My voices — ${siteConfig.name}` };

export default async function MyVoicesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [planId, saved] = await Promise.all([
    getStore().planOf(user.id),
    getUserVoiceStore().listVoices(user.id),
  ]);
  const voices = saved.map(publicVoice);

  return (
    <main className="flex flex-col gap-3 px-2 pt-2 pb-28 sm:gap-6 sm:px-6 md:pb-6">
      <MyVoicesView voices={voices} slots={slotsFor(voices.length, planId)} />
    </main>
  );
}
