'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/create', label: 'Create' },
  { href: '/gallery', label: 'Library' },
] as const;

/** Main app navigation; highlights the section you're in. */
export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1">
      {LINKS.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-full px-3.5 py-2 text-[15px] transition-colors ${
              active
                ? 'bg-raised text-ink font-semibold'
                : 'text-ink-muted hover:text-ink font-medium'
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
