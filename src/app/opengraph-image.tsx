import { shareCardImage } from '@/components/share-card-image';
import { SHARE_CARD_SIZE, siteShareCard } from '@/features/seo/share-card';

// Site-wide link preview; pages without their own card inherit it.
export const alt = siteShareCard().alt;
export const size = SHARE_CARD_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return shareCardImage(siteShareCard());
}
