import { KeywordPageView, keywordPageMetadata } from '@/components/keyword-page';

const SLUG = 'ai-youtube-shorts-generator';

export const metadata = keywordPageMetadata(SLUG);

export default function Page() {
  return <KeywordPageView slug={SLUG} />;
}
