import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { siteConfig } from '@/config/site';
import { getCurrentUser } from '@/features/auth/session';
import { getStore } from '@/features/render/store';
import { PLANS } from '@/config/plans';
import { CreateForm } from './create-form';
import { initialSelection } from './composer';
import { initialVoice, isPickable } from '@/components/voice/voice-choice';
import { publicVoice } from '@/features/voice/my-voices';
import { getUserVoiceStore } from '@/features/voice/store';
import { loginHrefFor } from '@/features/auth/carry';

export const metadata: Metadata = { title: `Create a video — ${siteConfig.name}` };

export default async function CreatePage({ searchParams }: PageProps<'/create'>) {
  const user = await getCurrentUser();
  // Keep the idea + theme a signed-out visitor picked (e.g. on /ideas/<theme>).
  if (!user) redirect(loginHrefFor(await searchParams));

  const store = getStore();
  const [balance, planId, hasPaid, jobs, params, saved] = await Promise.all([
    store.balance(user.id),
    store.planOf(user.id),
    store.hasPaid(user.id),
    store.listJobs(user.id),
    searchParams,
    // Before migration 0012 the table is missing: Create still works without saved voices.
    getUserVoiceStore()
      .listVoices(user.id)
      .catch(() => []),
  ]);
  const myVoices = saved.map(publicVoice);
  const { limits } = PLANS[planId];
  // Newest first: the last video's settings are the creator's defaults.
  const lastJob = jobs[0] ?? null;
  const { firstRun, ...initial } = initialSelection({ params, lastJob });
  // "Make a video with it" after saving a voice links here with ?voice=<id>.
  const voiceParam = typeof params.voice === 'string' ? params.voice : null;
  const remembered = initialVoice(lastJob, myVoices);
  const startVoice =
    voiceParam && isPickable(voiceParam, myVoices)
      ? { ...remembered, voiceId: voiceParam }
      : remembered;

  return (
    <main className="mx-auto max-w-[1344px] px-4 py-8 sm:px-8 lg:py-10 xl:px-12">
      <CreateForm
        initial={initial}
        initialVoice={startVoice}
        myVoices={myVoices}
        firstRun={firstRun}
        lastThemeId={lastJob?.themeId ?? null}
        balance={balance}
        maxDurationSec={limits.maxVideoDurationSec}
        allowedTiers={[...limits.modelTiers]}
        freeTrial={!hasPaid}
      />
    </main>
  );
}
