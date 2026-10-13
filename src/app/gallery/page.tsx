import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { siteConfig } from '@/config/site';
import { getCurrentUser } from '@/features/auth/session';
import { getStore } from '@/features/render/store';
import { AutoRefresh } from './auto-refresh';
import { TodayHero } from './today-hero';
import { LibraryGrid } from './library-grid';
import { anyWorking, toCard, versionsOf } from './library';
import { dailyIdeas, dayKey } from '@/components/ideas';

export const metadata: Metadata = { title: `Your videos — ${siteConfig.name}` };

export default async function LibraryPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const store = getStore();
  const [jobs, balance, hasPaid] = await Promise.all([
    store.listJobs(user.id),
    store.balance(user.id),
    store.hasPaid(user.id),
  ]);
  const now = new Date();
  const versions = versionsOf(jobs);
  const cards = jobs.map((j) => toCard(j, now, versions.get(j.id)));
  const empty = jobs.length === 0;

  const ideas = dailyIdeas(dayKey(now), jobs[0]?.themeId ?? null);
  const hero = <TodayHero ideas={ideas} />;

  return (
    <main className="mx-auto flex max-w-[1280px] flex-col gap-12 px-4 py-8 sm:px-8 lg:py-12 xl:px-12">
      {/* Re-render every few seconds while a video is being made. */}
      <AutoRefresh active={anyWorking(jobs)} />
      <h1 className="sr-only">Your videos</h1>

      {empty ? (
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-16">
          {hero}
          <div className="flex flex-col items-center gap-3 text-center">
            <div
              aria-hidden="true"
              className="bg-surface flex aspect-[9/16] w-[200px] items-center justify-center rounded-[24px]"
            >
              <svg width="40" height="40" viewBox="0 0 34 34">
                <circle cx="17" cy="17" r="17" fill="var(--raised)" />
                <path d="M13.5 10.5v13l10.5-6.5z" fill="var(--ink-muted)" />
              </svg>
            </div>
            <p className="text-ink-muted max-w-[260px] text-sm">
              Your videos will live here.
              {hasPaid ? '' : ' Your first one comes with the trial credits.'}
            </p>
          </div>
        </div>
      ) : (
        <LibraryGrid cards={cards} balance={balance} freeTrial={!hasPaid} hero={hero} />
      )}
    </main>
  );
}
