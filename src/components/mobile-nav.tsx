import { getCurrentUser } from '@/features/auth/session';
import { getStore } from '@/features/render/store';
import { TabBar } from './tab-bar';

/** The phone tab bar for signed-in users (hidden from `md` up, where the header has the nav). */
export async function MobileNav() {
  const user = await getCurrentUser();
  if (!user) return null;
  const balance = await getStore().balance(user.id);
  return <TabBar email={user.email ?? null} balance={balance} />;
}
