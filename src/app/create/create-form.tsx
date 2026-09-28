'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { THEMES } from '@/config/themes';

const DURATIONS = [15, 30, 60, 90, 120];

export function CreateForm() {
  const router = useRouter();
  const [topic, setTopic] = useState('');
  const [themeId, setThemeId] = useState<string>(THEMES[0]?.id ?? 'office-drama');
  const [duration, setDuration] = useState(30);
  const [tier, setTier] = useState<'standard' | 'premium'>('standard');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, themeId, targetDurationSec: duration, modelTier: tier }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(
        data.error === 'insufficient_credits'
          ? "You're out of credits."
          : `Could not generate: ${data.error ?? res.status}`,
      );
      return;
    }
    router.push('/gallery');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-neutral-300">What&apos;s your video about?</span>
        <textarea
          required
          minLength={3}
          rows={3}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. a cat who secretly runs a coffee shop"
          className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 outline-none focus:border-neutral-400"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-neutral-300">Theme</span>
        <select
          value={themeId}
          onChange={(e) => setThemeId(e.target.value)}
          className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 outline-none focus:border-neutral-400"
        >
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label} — {t.blurb}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-4">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="text-neutral-300">Length</span>
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 outline-none focus:border-neutral-400"
          >
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d}s
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="text-neutral-300">Quality</span>
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value as 'standard' | 'premium')}
            className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 outline-none focus:border-neutral-400"
          >
            <option value="standard">Standard</option>
            <option value="premium">Premium</option>
          </select>
        </label>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-white px-4 py-2.5 font-medium text-neutral-900 hover:bg-neutral-200 disabled:opacity-50"
      >
        {loading ? 'Generating…' : 'Generate video'}
      </button>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
