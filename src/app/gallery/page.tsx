import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/features/auth/session';
import { getStore } from '@/features/render/store';
import { buttonClasses } from '@/components/ui/button';
import { AutoRefresh } from './auto-refresh';
import { DailyIdeas } from './daily-ideas';
import { LibraryGrid } from './library-grid';
import { anyWorking, librarySummary, toCard } from './library';

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
  const cards = jobs.map((j) => toCard(j, now));
  const empty = jobs.length === 0;

  return (
    <main className="mx-auto flex max-w-[1344px] flex-col gap-8 px-4 py-8 sm:px-8 lg:py-10 xl:px-12">
      {/* Re-render every few seconds while a video is being made. */}
      <AutoRefresh active={anyWorking(jobs)} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-[36px] leading-10 font-bold tracking-[-0.02em]">
            Your videos
          </h1>
          <p className="text-ink-muted text-[15px]">{librarySummary(jobs, now)}</p>
        </div>
        <Link href="/create" className={buttonClasses({ size: 'lg' })}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M10 4v12M4 10h12" />
          </svg>
          New video
        </Link>
      </div>

      {empty && (
        <section
          aria-labelledby="empty-h"
          className="flex flex-col items-center gap-4 px-6 pt-8 text-center"
        >
          <div aria-hidden="true" className="relative h-[170px] w-[220px]">
            <span className="absolute top-[22px] left-[22px] h-[140px] w-[84px] -rotate-[9deg] rounded-[14px] bg-[#34495c]" />
            <span className="absolute top-[22px] right-[22px] h-[140px] w-[84px] rotate-[9deg] rounded-[14px] bg-[#563258]" />
            <span className="absolute top-1.5 left-[66px] flex h-[156px] w-[88px] items-center justify-center rounded-[14px] bg-[#2c5a4c] shadow-[0_0_0_4px_var(--paper)]">
              <svg width="34" height="34" viewBox="0 0 34 34">
                <circle cx="17" cy="17" r="17" fill="rgb(255 255 255 / 0.9)" />
                <path d="M13.5 10.5v13l10.5-6.5z" fill="#2c5a4c" />
              </svg>
            </span>
          </div>
          <h2
            id="empty-h"
            className="font-display text-[28px] leading-8 font-bold tracking-[-0.015em]"
          >
            Your videos will live here
          </h2>
          <p className="text-ink-muted max-w-[460px]">
            Pick an idea below and press Generate
            {hasPaid ? '.' : '. Your first video comes with the trial credits.'}
          </p>
        </section>
      )}

      <DailyIdeas
        preferThemeId={jobs[0]?.themeId ?? null}
        heading={empty ? 'Start with one of these' : undefined}
      />

      {!empty && <LibraryGrid cards={cards} balance={balance} freeTrial={!hasPaid} />}
    </main>
  );
}
