import { getCurrentUser } from '@/features/auth/session';
import { Landing } from '@/components/landing/landing';

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <main>
      <Landing signedIn={Boolean(user)} />
    </main>
  );
}
