import Link from 'next/link';
import { siteConfig } from '@/config/site';

export function Footer() {
  return (
    <footer className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-neutral-800 px-6 py-4 text-xs text-neutral-500">
      <span>© {siteConfig.name}</span>
      <Link href="/terms" className="hover:text-white">
        Terms
      </Link>
      <Link href="/privacy" className="hover:text-white">
        Privacy
      </Link>
      <Link href="/terms#refunds" className="hover:text-white">
        Refunds
      </Link>
      <a href={`mailto:${siteConfig.supportEmail}`} className="hover:text-white">
        {siteConfig.supportEmail}
      </a>
    </footer>
  );
}
