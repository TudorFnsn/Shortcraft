'use client';

/**
 * A script that runs once during HTML parsing (server render) and is inert on
 * the client, so React doesn't warn about rendering a <script> tag
 * (Next.js guide: "Preventing flash before hydration").
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
