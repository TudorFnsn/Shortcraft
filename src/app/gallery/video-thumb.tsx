'use client';

import { useEffect, useRef, useState } from 'react';
import { ThemeFrame } from '@/components/theme-frame';

/**
 * A video's 9:16 thumbnail: the real first scene image (re-signed on every load
 * by /api/jobs/:id/thumbnail) over the theme's drawn frame, which shows while
 * it loads and stays when there is no image (mock mode, or not drawn yet).
 */
export function VideoThumb({
  id,
  themeId,
  hasThumb,
  className = '',
}: {
  id: string;
  themeId: string;
  hasThumb: boolean;
  className?: string;
}) {
  // Hidden until it loads, so a missing image never shows a broken-image icon.
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const img = useRef<HTMLImageElement>(null);
  // An image that settled before hydration fires no event: read its state once.
  useEffect(() => {
    const el = img.current;
    if (!el?.complete) return;
    setState(el.naturalWidth > 0 ? 'loaded' : 'failed');
  }, []);
  return (
    <span className={`relative block aspect-[9/16] overflow-hidden ${className}`.trim()}>
      <ThemeFrame themeId={themeId} variant="phone" caption={false} className="absolute inset-0" />
      {hasThumb && state !== 'failed' && (
        // eslint-disable-next-line @next/next/no-img-element -- a redirect to a short-lived signed URL; next/image can't cache it
        <img
          ref={img}
          src={`/api/jobs/${id}/thumbnail`}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setState('loaded')}
          onError={() => setState('failed')}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity ${
            state === 'loaded' ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </span>
  );
}
