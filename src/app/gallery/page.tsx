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
  done: 'text-emerald-400',
  failed: 'text-red-400',
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
        <h1 className="text-2xl font-semibold">My Creations</h1>
        <span className="text-sm text-neutral-400">{balance.toLocaleString()} credits</span>
      </div>

      {jobs.length === 0 ? (
        <p className="text-neutral-400">
          Nothing yet.{' '}
          <Link href="/create" className="text-white underline">
            Create your first video
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {jobs.map((job) => (
            <li
              key={job.id}
              className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{job.title ?? job.topic}</p>
                <p className="text-xs text-neutral-500">
                  {job.themeId} · {job.targetDurationSec}s ·{' '}
                  {isTerminal(job.status)
                    ? `${job.actualCredits.toLocaleString()} credits`
                    : `up to ${job.estimatedCredits.toLocaleString()} credits (held)`}
                </p>
              </div>
              <div className="ml-4 text-right">
                <span className={`text-sm ${statusColor[job.status] ?? 'text-neutral-300'}`}>
                  {statusLabel[job.status] ?? job.status}
                </span>
                <p className="text-xs text-neutral-600">
                  {Math.round(progress(job.status as RenderStatus) * 100)}%
                </p>
                {/* Live renders only (mock URLs aren't playable). Re-signed on each click. */}
                {job.outputAssetUrl?.startsWith('https://') && (
                  <a
                    href={`/api/jobs/${job.id}/video`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-white underline"
                  >
                    Watch
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Link href="/create" className="text-sm text-neutral-400 hover:text-white">
        + New video
      </Link>
    </main>
  );
}
