import { notFound } from 'next/navigation';
import { shareCardImage } from '@/components/share-card-image';
import { SHARE_CARD_SIZE, keywordShareCard } from '@/features/seo/share-card';

// This keyword page's own link preview (static at build).
const card = keywordShareCard('ai-tiktok-video-generator');

export const size = SHARE_CARD_SIZE;
export const contentType = 'image/png';
export const alt = card?.alt ?? 'Shortcraft';

export default function Image() {
  if (!card) notFound();
  return shareCardImage(card);
}
