'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { WITHDRAWAL_WAIVER_TEXT } from '@/config/legal';
import { PLANS, TOPUP_PACKS } from '@/config/plans';

const eur = (cents: number) => `€${(cents / 100).toFixed(2)}`;

export default function PricingPage() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  async function purchase(key: string) {
    if (!accepted) {
      setError('Please tick the box above the plans to continue.');
      return;
    }
    setBusy(key);
    setError(null);
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, acceptTerms: true }),
    });
    if (res.status === 401) {
      router.push('/login');
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (data.url) {
      window.location.assign(data.url); // to Stripe Checkout
      return;
    }
    setBusy(null);
    setError(`Could not start checkout (${data.error ?? res.status}).`);
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-10 px-6 py-12">
      <label className="border-line bg-surface text-ink flex items-start gap-3 rounded-lg border p-4 text-sm">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => {
            setAccepted(e.target.checked);
            setError(null);
          }}
          className="mt-0.5 h-4 w-4 shrink-0"
        />
        <span>
          {WITHDRAWAL_WAIVER_TEXT}{' '}
          <Link href="/terms" className="hover:text-ink underline">
            Terms
          </Link>{' '}
          ·{' '}
          <Link href="/terms#refunds" className="hover:text-ink underline">
            Refunds
          </Link>{' '}
          ·{' '}
          <Link href="/privacy" className="hover:text-ink underline">
            Privacy
          </Link>
        </span>
      </label>

      <section>
        <h1 className="font-display mb-6 text-2xl font-semibold">Plans</h1>
        <div className="grid gap-4 sm:grid-cols-3">
          {Object.values(PLANS).map((plan) => (
            <div
              key={plan.id}
              className="border-line bg-surface flex flex-col gap-3 rounded-xl border p-5"
            >
              <h2 className="text-lg font-semibold">{plan.name}</h2>
              <p className="text-2xl font-bold">
                {eur(plan.priceCents)}
                <span className="text-ink-muted text-sm font-normal">/mo</span>
              </p>
              <p className="text-ink-muted text-sm">
                {plan.monthlyCredits.toLocaleString()} credits / month
              </p>
              <ul className="text-ink mt-1 flex-1 space-y-1 text-sm">
                <li>Up to {plan.limits.maxVideoDurationSec}s videos</li>
                <li>No watermark</li>
                <li>
                  {plan.limits.modelTiers.includes('premium')
                    ? 'Animated stills + AI video scenes'
                    : 'Animated-still scenes'}
                </li>
                {plan.limits.studio && <li>Studio editor</li>}
                {plan.limits.series && <li>Series</li>}
              </ul>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => purchase(`${plan.id}_monthly`)}
                className="bg-ember text-on-ember mt-2 rounded-md px-4 py-2 text-sm font-medium hover:brightness-95 disabled:opacity-50"
              >
                {busy === `${plan.id}_monthly` ? 'Redirecting…' : `Choose ${plan.name}`}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Credit top-ups</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {TOPUP_PACKS.map((pack) => (
            <div
              key={pack.id}
              className="border-line bg-surface flex items-center justify-between rounded-lg border p-4"
            >
              <div>
                <p className="font-medium">{pack.credits.toLocaleString()} credits</p>
                <p className="text-ink-muted text-sm">{eur(pack.priceCents)}</p>
              </div>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => purchase(pack.id)}
                className="border-line-strong hover:bg-raised rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
              >
                {busy === pack.id ? '…' : 'Buy'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {error && <p className="text-danger text-sm">{error}</p>}
    </main>
  );
}
