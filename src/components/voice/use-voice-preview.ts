'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Plays the recorded catalog samples (`public/voices/<slug>.mp3`) or another
 * clip (a "Hear this line" preview): one at a time, toggled by the same
 * button, stopped when the picker goes away. Browsing voices never calls the
 * voice API.
 */
export function useVoicePreview() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  const stop = useCallback(() => {
    audio.current?.pause();
    setPlaying(null);
  }, []);

  const toggle = useCallback(
    (id: string, src = `/voices/${id}.mp3`) => {
      if (playing === id) {
        stop();
        return;
      }
      audio.current ??= new Audio();
      const el = audio.current;
      el.onended = () => setPlaying(null);
      el.onerror = () => setPlaying(null);
      el.src = src;
      setPlaying(id);
      el.play().catch(() => setPlaying(null));
    },
    [playing, stop],
  );

  useEffect(() => () => audio.current?.pause(), []);

  return { playing, toggle, stop };
}
