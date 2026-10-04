'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { THEMES } from '@/config/themes';
import type { ModelTier } from '@/config/models';
import { cheapestPlanAllowing } from '@/features/billing/entitlements';
import { estimateJobCredits } from '@/features/render/pricing';

const DURATIONS = [15, 30, 60, 90, 120];

const TIERS: { id: ModelTier; label: string }[] = [
  { id: 'standard', label: 'Standard — animated stills' },
  { id: 'premium', label: 'Premium — AI video' },
];

/** " (Pro)" suffix naming the plan that unlocks an option. */
const lockLabel = (req: { targetDurationSec: number; modelTier: ModelTier }) => {
  const plan = cheapestPlanAllowing(req);
  return plan ? ` (${plan.name})` : ' (locked)';
};

export function CreateForm({
  balance,
  maxDurationSec,
  allowedTiers,
}: {
  balance: number;
  maxDurationSec: number;
  allowedTiers: ModelTier[];
}) {
  const router = useRouter();
  const [topic, setTopic] = useState('');
  const [themeId, setThemeId] = useState<string>(THEMES[0]?.id ?? 'office-drama');
  const [duration, setDuration] = useState(15);
  const [tier, setTier] = useState<ModelTier>('standard');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Live estimate so the cost is visible before generating (no surprise paywall).
  const estimate = useMemo(
    () => estimateJobCredits({ targetDurationSec: duration, modelTier: tier }),
    [duration, tier],
  );
  const affordable = estimate <= balance;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!affordable) return;
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
          : data.error === 'plan_limit'
            ? (data.message ?? 'Your plan does not include this option.')
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
            {DURATIONS.map((d) => {
              const locked = d > maxDurationSec;
              return (
                <option key={d} value={d} disabled={locked}>
                  {d}s{locked && lockLabel({ targetDurationSec: d, modelTier: 'standard' })}
                </option>
              );
            })}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="text-neutral-300">Quality</span>
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value as ModelTier)}
            className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 outline-none focus:border-neutral-400"
          >
            {TIERS.map((t) => {
              const locked = !allowedTiers.includes(t.id);
              return (
                <option key={t.id} value={t.id} disabled={locked}>
                  {t.label}
                  {locked && lockLabel({ targetDurationSec: duration, modelTier: t.id })}
                </option>
              );
            })}
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-neutral-400">
          Est. <span className="text-neutral-200">~{estimate.toLocaleString()}</span> credits
        </span>
        <span className={affordable ? 'text-neutral-500' : 'text-red-400'}>
          you have {balance.toLocaleString()}
        </span>
      </div>

      <button
        type="submit"
        disabled={loading || !affordable}
        className="rounded-md bg-white px-4 py-2.5 font-medium text-neutral-900 hover:bg-neutral-200 disabled:opacity-50"
      >
        {loading ? 'Generating…' : 'Generate video'}
      </button>

      {!affordable && (
        <p className="text-sm text-red-400">
          Not enough credits — pick a shorter length, or{' '}
          <Link href="/pricing" className="underline">
            get more credits
          </Link>
          .
        </p>
      )}
      {(maxDurationSec < Math.max(...DURATIONS) || allowedTiers.length < TIERS.length) && (
        <p className="text-sm text-neutral-500">
          Longer videos and premium quality unlock on higher plans —{' '}
          <Link href="/pricing" className="underline">
            see plans
          </Link>
          .
        </p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
