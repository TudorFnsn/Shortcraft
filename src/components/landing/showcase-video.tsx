'use client';

import { useEffect, useRef } from 'react';

/**
 * A muted, looping 9:16 video for the landing hero. Plays only when the visitor
 * hasn't asked for reduced motion; otherwise it rests on its first frame.
 */
export function ShowcaseVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      if (reduce.matches) video.pause();
      else void video.play().catch(() => {});
    };
    sync();
    reduce.addEventListener('change', sync);
    return () => reduce.removeEventListener('change', sync);
  }, []);

  return (
    <video
      ref={ref}
      src={src}
      muted
      loop
      playsInline
      preload="metadata"
      tabIndex={-1}
      className="block aspect-[9/16] w-full bg-[#14100d] object-cover"
    />
  );
}
