import Link from 'next/link';
import { siteConfig } from '@/config/site';

export function Footer() {
  return (
    <footer className="border-line text-ink-muted flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t px-6 py-4 text-xs">
      <span>© {siteConfig.name}</span>
      <Link href="/terms" className="hover:text-ink">
        Terms
      </Link>
      <Link href="/privacy" className="hover:text-ink">
        Privacy
      </Link>
      <Link href="/terms#refunds" className="hover:text-ink">
        Refunds
      </Link>
      <a href={`mailto:${siteConfig.supportEmail}`} className="hover:text-ink">
        {siteConfig.supportEmail}
      </a>
    </footer>
  );
}
