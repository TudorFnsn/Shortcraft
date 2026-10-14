'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { isMarketingPath } from './shell-paths';

/** Picks the big dark footer on marketing pages and the slim one in the app. */
export function FooterSwitch({ big, slim }: { big: ReactNode; slim: ReactNode }) {
  return <>{isMarketingPath(usePathname()) ? big : slim}</>;
}
