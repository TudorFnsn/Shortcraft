import { notFound } from 'next/navigation';
import { shareCardImage } from '@/components/share-card-image';
import { THEMES } from '@/config/themes';
import { SHARE_CARD_SIZE, themeShareCard } from '@/features/seo/share-card';

// One static card per theme, built at build time like the page itself.
export const dynamicParams = false;
export const size = SHARE_CARD_SIZE;
export const contentType = 'image/png';
export const alt = 'Video ideas on Shortcraft';

export function generateStaticParams() {
  return THEMES.map((t) => ({ theme: t.id }));
}

export default async function Image({ params }: { params: Promise<{ theme: string }> }) {
  const { theme } = await params;
  const card = themeShareCard(theme);
  if (!card) notFound();
  return shareCardImage(card);
}
