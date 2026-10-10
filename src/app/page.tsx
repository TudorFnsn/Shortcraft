import Link from 'next/link';
import { siteConfig } from '@/config/site';
import { getCurrentUser } from '@/features/auth/session';

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto flex max-w-2xl flex-col items-center gap-8 px-6 py-24 text-center">
      <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
        {siteConfig.tagline}
      </h1>
      <p className="text-ink-muted max-w-md text-lg">{siteConfig.description}</p>
      <Link
        href={user ? '/create' : '/login'}
        className="bg-ember text-on-ember rounded-lg px-6 py-3 font-medium hover:brightness-95"
      >
        {user ? 'Create a video' : 'Get started'}
      </Link>
    </main>
  );
}
