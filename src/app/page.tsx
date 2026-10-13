import { getCurrentUser } from '@/features/auth/session';
import { Landing } from '@/components/landing/landing';
import { getShowcaseVideos } from '@/components/landing/showcase';

export default async function Home() {
  const [user, showcase] = await Promise.all([getCurrentUser(), getShowcaseVideos()]);
  return (
    <main>
      <Landing signedIn={Boolean(user)} showcase={showcase} />
    </main>
  );
}
