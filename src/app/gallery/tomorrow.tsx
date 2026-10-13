import Link from 'next/link';
import { tomorrowIdea } from '@/components/ideas';
import { buttonClasses } from '@/components/ui/button';
import type { LibraryCard } from './library';

/**
 * "Queue tomorrow's video": right after a video is ready, offer tomorrow's idea
 * in the same theme, length and quality, so the next post is made today and
 * waiting tomorrow. `compact` is the player sheet's version.
 */
export function TomorrowNudge({
  card,
  now,
  compact = false,
}: {
  card: LibraryCard;
  now: Date;
  compact?: boolean;
}) {
  const next = tomorrowIdea(card, now);
  return (
    <section
      aria-label="Tomorrow's video"
      className={`bg-surface border-line rounded-card flex border ${
        compact
          ? 'flex-col gap-3 p-4'
          : 'flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between'
      }`}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-ember-ink text-[13px] font-semibold">Tomorrow&apos;s video</span>
        <span className="text-[15px] leading-5 font-semibold">{next.topic}</span>
        <span className="text-ink-muted text-[13px] leading-[18px]">
          {card.themeLabel} · {card.durationSec}s. Make it now and it&apos;s waiting in your Library
          tomorrow.
        </span>
      </div>
      <Link
        href={next.href}
        className={buttonClasses({
          variant: compact ? 'secondary' : 'primary',
          className: 'shrink-0 whitespace-nowrap',
        })}
      >
        Make tomorrow&apos;s video
      </Link>
    </section>
  );
}
