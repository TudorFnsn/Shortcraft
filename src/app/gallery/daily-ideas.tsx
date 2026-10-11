import Link from 'next/link';
import { createHref, dailyIdeas, dayKey } from '@/components/ideas';
import { ThemeFrame } from '@/components/theme-frame';

/**
 * "Today's ideas": three fresh, one-tap video ideas that rotate daily and lean on
 * the creator's usual theme. A reason to come back each day, and the empty
 * Library's starter row.
 */
export function DailyIdeas({
  preferThemeId,
  heading = "Today's ideas",
  now = new Date(),
}: {
  preferThemeId: string | null;
  heading?: string;
  now?: Date;
}) {
  const ideas = dailyIdeas(dayKey(now), preferThemeId);
  return (
    <section aria-labelledby="ideas-h" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="ideas-h" className="text-[15px] leading-5 font-semibold">
          {heading}
        </h2>
        <span className="text-ink-muted text-[13px]">New ideas every day</span>
      </div>
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-3 sm:overflow-visible sm:p-0">
        {ideas.map((idea) => (
          <li
            key={`${idea.themeId}:${idea.topic}`}
            className="w-[260px] shrink-0 snap-start sm:w-auto"
          >
            <Link
              href={createHref(idea)}
              className="bg-surface border-line hover:border-line-strong rounded-card flex h-full items-center gap-3 border-2 p-2 pr-4 transition-colors"
            >
              <ThemeFrame
                themeId={idea.themeId}
                variant="card"
                caption={false}
                className="w-14 shrink-0"
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[15px] leading-5 font-semibold">{idea.topic}</span>
                <span className="text-ink-muted text-[13px]">
                  {idea.themeLabel} · <span className="text-ember-ink font-semibold">Make it</span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
