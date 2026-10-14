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
    <main className="mx-auto max-w-[760px] px-4 py-8 sm:px-8 lg:py-12">
      <MyVoicesView voices={voices} slots={slotsFor(voices.length, planId)} />
    </main>
  );
}
