import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/features/auth/session';
import { getStore } from '@/features/render/store';
import { isTerminal, progress, type RenderStatus } from '@/features/render/machine';
import { AutoRefresh } from './auto-refresh';

/** What each pipeline step means to the person waiting. */
const statusLabel: Record<RenderStatus, string> = {
  draft: 'Queued',
  scripting: 'Writing script',
  images: 'Drawing scenes',
  clips: 'Animating scenes',
  voiceover: 'Recording voice',
  subtitles: 'Adding captions',
  stitching: 'Rendering video',
  done: 'Done',
  failed: 'Failed',
};

const statusColor: Record<string, string> = {
  done: 'text-success',
  failed: 'text-danger',
};

export default async function GalleryPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const store = getStore();
  const [jobs, balance] = await Promise.all([store.listJobs(user.id), store.balance(user.id)]);
  const working = jobs.some((j) => !isTerminal(j.status));

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <AutoRefresh active={working} />
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-semibold">My Creations</h1>
        <span className="text-ink-muted text-sm">{balance.toLocaleString()} credits</span>
      </div>

      {jobs.length === 0 ? (
        <p className="text-ink-muted">
          Nothing yet.{' '}
          <Link href="/create" className="text-ink underline">
            Create your first video
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {jobs.map((job) => {
            // Live renders only (mock URLs aren't playable). Re-signed on each request.
            const playable = job.outputAssetUrl?.startsWith('https://');
            const videoUrl = `/api/jobs/${job.id}/video`;
            return (
              <li
                key={job.id}
                className="border-line bg-surface flex flex-col gap-3 rounded-lg border px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{job.title ?? job.topic}</p>
                    <p className="text-ink-muted text-xs">
                      {job.themeId} · {job.targetDurationSec}s ·{' '}
                      {isTerminal(job.status)
                        ? `${job.actualCredits.toLocaleString()} credits`
                        : `up to ${job.estimatedCredits.toLocaleString()} credits (held)`}
                    </p>
                  </div>
                  <div className="ml-4 text-right">
                    <span className={`text-sm ${statusColor[job.status] ?? 'text-ink'}`}>
                      {statusLabel[job.status] ?? job.status}
                    </span>
                    <p className="text-ink-muted text-xs">
                      {Math.round(progress(job.status as RenderStatus) * 100)}%
                    </p>
                  </div>
                </div>
                {playable && (
                  <div className="flex flex-col items-center gap-2">
                    {/* Renders use +faststart, so metadata alone is a cheap first fetch. */}
                    <video
                      controls
                      playsInline
                      preload="metadata"
                      src={videoUrl}
                      className="aspect-[9/16] w-full max-w-[240px] rounded-md bg-black"
                    />
                    <div className="flex gap-4 text-xs">
                      <a
                        href={videoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-ink underline"
                      >
                        Open
                      </a>
                      <a href={`${videoUrl}?download=1`} className="text-ink underline">
                        Download
                      </a>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Link href="/create" className="text-ink-muted hover:text-ink text-sm">
        + New video
      </Link>
    </main>
  );
}
