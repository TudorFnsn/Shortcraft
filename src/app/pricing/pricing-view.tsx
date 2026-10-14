'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { planTeasers } from '@/components/landing/plan-teaser';
import { buttonClasses } from '@/components/ui/button';
import { WITHDRAWAL_WAIVER_TEXT } from '@/config/legal';
import { PLANS, TOPUP_PACKS } from '@/config/plans';

const eur = (cents: number) => `€${(cents / 100).toFixed(2)}`;
const fmt = (n: number) => n.toLocaleString('en-US');

function Check() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-ember-ink mt-0.5 shrink-0"
    >
      <path d="M4.5 10.5l3.5 3.5 7.5-8" />
    </svg>
  );
}

export function PricingView() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const teasers = planTeasers();

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
    <main className="mx-auto flex max-w-[1120px] flex-col gap-12 px-4 py-10 sm:px-8 lg:py-16">
      <header className="flex max-w-[640px] flex-col gap-3">
        <h1 className="font-display text-[36px] leading-10 font-bold tracking-[-0.02em] sm:text-[44px] sm:leading-[48px]">
          A plan for every posting rhythm
        </h1>
        <p className="text-ink-muted text-[17px] leading-7">
          Every plan removes the watermark and refills your credits each month. If a video
          doesn&apos;t finish, its credits come back automatically.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <label className="bg-surface border-line rounded-card text-ink flex cursor-pointer items-start gap-3 border p-4 text-sm leading-6">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => {
              setAccepted(e.target.checked);
              setError(null);
            }}
            className="accent-ember mt-0.5 size-5 shrink-0"
          />
          <span>
            {WITHDRAWAL_WAIVER_TEXT}{' '}
            <Link href="/terms" className="text-ember-ink font-medium underline">
              Terms
            </Link>{' '}
            ·{' '}
            <Link href="/terms#refunds" className="text-ember-ink font-medium underline">
              Refunds
            </Link>{' '}
            ·{' '}
            <Link href="/privacy" className="text-ember-ink font-medium underline">
              Privacy
            </Link>
          </span>
        </label>
        <p role="alert" className="text-danger min-h-5 text-sm font-medium">
          {error}
        </p>
      </div>

      <section aria-labelledby="plans-h" className="flex flex-col gap-5">
        <h2 id="plans-h" className="sr-only">
          Monthly plans
        </h2>
        <ul className="grid gap-5 md:grid-cols-3">
          {teasers.map((t) => {
            const plan = PLANS[t.id as keyof typeof PLANS];
            const key = `${t.id}_monthly`;
            return (
              <li
                key={t.id}
                className={`bg-surface rounded-panel relative flex flex-col gap-5 p-6 ${
                  t.featured ? 'border-ember shadow-sheet border-2' : 'border-line border'
                }`}
              >
                {t.featured && (
                  <span className="bg-ink text-paper absolute -top-3 left-6 rounded-full px-3 py-0.5 text-xs font-semibold">
                    Best for daily posting
                  </span>
                )}
                <div className="flex flex-col gap-1">
                  <h3 className="text-[19px] leading-6 font-semibold">{t.name}</h3>
                  <p className="flex items-baseline gap-1">
                    <span className="font-display text-[40px] leading-[44px] font-bold tracking-[-0.02em]">
                      {t.price}
                    </span>
                    <span className="text-ink-muted text-sm">/ month</span>
                  </p>
                  <p className="text-ink-muted text-sm">
                    {t.credits} credits a month · {t.videos}
                  </p>
                </div>
                <ul className="flex flex-1 flex-col gap-2.5 text-[15px] leading-5">
                  <li className="flex gap-2.5">
                    <Check />
                    Videos up to {plan.limits.maxVideoDurationSec}s
                  </li>
                  <li className="flex gap-2.5">
                    <Check />
                    {plan.limits.modelTiers.includes('premium')
                      ? 'Animated stills and Premium AI video'
                      : 'Animated-still scenes (Standard)'}
                  </li>
                  <li className="flex gap-2.5">
                    <Check />
                    No watermark
                  </li>
                  {plan.limits.studio && (
                    <li className="flex gap-2.5">
                      <Check />
                      Studio editor
                    </li>
                  )}
                  {plan.limits.series && (
                    <li className="flex gap-2.5">
                      <Check />
                      Series
                    </li>
                  )}
                </ul>
                <button
                  type="button"
                  disabled={busy !== null}
                  aria-label={`Choose ${t.name}, ${t.price} a month`}
                  onClick={() => purchase(key)}
                  className={buttonClasses({
                    variant: t.featured ? 'primary' : 'secondary',
                    size: 'lg',
                    className: 'w-full disabled:opacity-50',
                  })}
                >
                  {busy === key ? 'Opening checkout…' : `Choose ${t.name}`}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="topups-h" className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <h2 id="topups-h" className="font-display text-[26px] leading-8 font-bold">
            Need more this month?
          </h2>
          <p className="text-ink-muted">One-time credit top-ups, added to your balance.</p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-3">
          {TOPUP_PACKS.map((pack) => (
            <li
              key={pack.id}
              className="bg-surface border-line rounded-card flex items-center justify-between gap-4 border p-5"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-[17px] font-semibold">{fmt(pack.credits)} credits</span>
                <span className="text-ink-muted text-sm">{eur(pack.priceCents)} once</span>
              </div>
              <button
                type="button"
                disabled={busy !== null}
                aria-label={`Buy ${fmt(pack.credits)} credits for ${eur(pack.priceCents)}`}
                onClick={() => purchase(pack.id)}
                className={buttonClasses({
                  variant: 'secondary',
                  className: 'min-h-11 shrink-0 disabled:opacity-50',
                })}
              >
                {busy === pack.id ? 'Opening…' : 'Buy'}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
