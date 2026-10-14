import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { siteConfig } from '@/config/site';
import { getCurrentUser } from '@/features/auth/session';
import { getStore } from '@/features/render/store';
import { AutoRefresh } from './auto-refresh';
import { TodayHero } from './today-hero';
import { LibraryGrid, LibraryTitle } from './library-grid';
import { anyWorking, toCard, versionsOf } from './library';
import Link from 'next/link';
import { createHref, dailyIdeas, dayKey } from '@/components/ideas';
import { ColourIn } from '@/components/motion/colour-in';
import { ThemeFrame } from '@/components/theme-frame';
import { Box } from '@/components/ui/box';
import { publicVoice } from '@/features/voice/my-voices';
import { getUserVoiceStore } from '@/features/voice/store';

export const metadata: Metadata = { title: `Your videos — ${siteConfig.name}` };

export default async function LibraryPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const store = getStore();
  const [jobs, balance, hasPaid, saved] = await Promise.all([
    store.listJobs(user.id),
    store.balance(user.id),
    store.hasPaid(user.id),
    // Before migration 0012 the table is missing: the editor works with catalog voices only.
    getUserVoiceStore()
      .listVoices(user.id)
      .catch(() => []),
  ]);
  const now = new Date();
  const versions = versionsOf(jobs);
  const cards = jobs.map((j) => toCard(j, now, versions.get(j.id)));
  const empty = jobs.length === 0;

  const ideas = dailyIdeas(dayKey(now), jobs[0]?.themeId ?? null);
  const tomorrowDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrow = dailyIdeas(dayKey(tomorrowDay), jobs[0]?.themeId ?? null)[0] ?? null;

  return (
    <main className="flex flex-col gap-3 px-2 pb-28 sm:gap-6 sm:px-6 md:pb-6">
      {/* Re-render every few seconds while a video is being made. */}
      <AutoRefresh active={anyWorking(jobs)} />

      {empty ? (
        <>
          <LibraryTitle />
          <TodayHero ideas={ideas} />
          <Box
            tone="sky"
            pop
            alternate
            aria-labelledby="starters-h"
            className="flex flex-col gap-6 px-4 py-6 sm:gap-7 sm:p-12"
          >
            <div>
              <p className="m-0 text-[12px] font-semibold tracking-[2px] uppercase sm:text-[16px] sm:tracking-[3px]">
                Your first video
              </p>
              <h2
                id="starters-h"
                className="font-display m-0 mt-1 text-[36px] leading-[.85] font-normal tracking-[-0.04em] sm:text-[72px] sm:leading-[.8]"
              >
                Start with one of these
              </h2>
            </div>
            <ul className="m-0 grid list-none grid-cols-2 gap-x-3 gap-y-6 p-0 sm:grid-cols-3 sm:gap-x-5 lg:max-w-[900px]">
              {ideas.slice(0, 3).map((idea) => (
                <li key={idea.topic} className="min-w-0">
                  <Link href={createHref(idea)} className="group flex flex-col gap-2.5">
                    <ColourIn className="overflow-hidden rounded-[8px] shadow-[16px_16px_40px_rgb(4_40_57/.35)]">
                      <ThemeFrame themeId={idea.themeId} variant="card" caption={false} />
                    </ColourIn>
                    <span className="font-display text-[19px] leading-[1.05] group-hover:underline sm:text-[21px]">
                      {idea.topic}
                    </span>
                    <span className="text-[14px]">{idea.themeLabel}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="m-0 text-[15px]">
              {hasPaid
                ? 'Your videos will live here.'
                : 'Your videos will live here. Your first one comes with the trial credits.'}
            </p>
          </Box>
        </>
      ) : (
        <LibraryGrid
          cards={cards}
          balance={balance}
          myVoices={saved.map(publicVoice)}
          freeTrial={!hasPaid}
          ideas={ideas}
          tomorrow={tomorrow}
        />
      )}
    </main>
  );
}
