'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isVoiceId } from '@/config/voices';
import { SAMPLE_LINE } from './voice-choice';

/**
 * Plays the recorded catalog samples (`public/voices/<slug>.mp3`) or another
 * clip (a "Hear this line" preview, a saved voice's sample): one at a time,
 * toggled by the same button, stopped when the picker goes away. Browsing the
 * catalog never calls the voice API.
 */
export function useVoicePreview() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [note, setNote] = useState('');

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

  /**
   * ▶ on any voice: a catalog voice plays its recorded sample; a saved voice
   * speaks a short line through the free, cached preview API.
   */
  const toggleVoice = useCallback(
    async (id: string, themeId: string) => {
      if (isVoiceId(id) || playing === id) {
        toggle(id);
        return;
      }
      setLoading(id);
      setNote('');
      const res = await fetch('/api/voice/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: SAMPLE_LINE, themeId, voiceId: id }),
      }).catch(() => null);
      const data = res ? await res.json().catch(() => ({})) : {};
      setLoading(null);
      if (!res?.ok || typeof data.audioUrl !== 'string') {
        setNote(data.message ?? "Couldn't play this voice. Try again in a moment.");
        return;
      }
      toggle(id, data.audioUrl);
    },
    [playing, toggle],
  );

  useEffect(() => () => audio.current?.pause(), []);

  return { playing, loading, note, toggle, toggleVoice, stop };
}
