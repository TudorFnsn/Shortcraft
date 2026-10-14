import { getCurrentUser } from '@/features/auth/session';
import { NewVideoFab } from './new-video-fab';

/**
 * Phone navigation (DesignPlan §4 B.2): one floating "+" for a new video. Home is
 * the logo, and account, theme and plans live in the header's avatar menu.
 */
export async function MobileNav() {
  const user = await getCurrentUser();
  if (!user) return null;
  return <NewVideoFab />;
}
