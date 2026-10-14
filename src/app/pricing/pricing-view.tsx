'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { planTeasers } from '@/components/landing/plan-teaser';
import { SplitLines } from '@/components/motion/split-lines';
import { Badge } from '@/components/ui/badge';
import { buttonClasses } from '@/components/ui/button';
import { Note } from '@/components/ui/note';
import { WITHDRAWAL_WAIVER_TEXT } from '@/config/legal';
import { PLANS, TOPUP_PACKS } from '@/config/plans';

const eur = (cents: number) => `€${(cents / 100).toFixed(2)}`;
const fmt = (n: number) => n.toLocaleString('en-US');

/** 20000 → "20K" for the top-up tiles. */
const short = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}K` : String(n));

/** Plan boxes (B.1 Shape): Starter blush −1°, Pro ember, Ultra blush +1°. */
const TILT = ['-rotate-1', '', 'rotate-1'] as const;

/**
 * Pricing (DesignPlan §4 B.2, board Pricing): the title stagger with a note,
 * the withdrawal waiver, three tilted plan boxes with Fraunces prices (Pro is
 * the ember box), the dark top-up box with League Gothic tiles and the refund
 * line. Checkout calls are unchanged.
 */
export function PricingView({ currentPlan = null }: { currentPlan?: string | null }) {
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
    <main className="flex flex-col gap-8 px-2 pt-4 pb-6 sm:gap-10 sm:px-6">
      <header className="relative flex flex-col gap-3 px-2 sm:px-14 sm:pt-5">
        <p className="text-ember-ink m-0 text-[14px] font-semibold tracking-[3px] uppercase sm:text-[18px]">
          Pricing
        </p>
        <SplitLines
          as="h1"
          className="font-display m-0 max-w-[12ch] text-[64px] leading-[.8] font-normal tracking-[-0.04em] sm:text-[clamp(80px,10vw,144px)] xl:max-w-none"
        >
          Pay for what you post
        </SplitLines>
        <p className="text-ink-muted m-0 mt-5 max-w-[640px] text-[17px] leading-[1.45]">
          Every plan removes the watermark and refills your credits each month. If a video
          doesn&apos;t finish, its credits come back automatically.
        </p>
        <Note rotate={14} className="absolute top-8 right-20 text-[40px] max-lg:hidden">
          most creators pick Pro
        </Note>
      </header>

      <div className="flex flex-col gap-2 sm:px-14">
        <label className="bg-surface text-ink flex cursor-pointer items-start gap-3 rounded-[8px] p-4 text-[15px] leading-6">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => {
              setAccepted(e.target.checked);
              setError(null);
            }}
            className="mt-0.5 size-5 shrink-0 accent-[#212121]"
          />
          <span>
            {WITHDRAWAL_WAIVER_TEXT}{' '}
            <Link href="/terms" className="font-semibold underline">
              Terms
            </Link>{' '}
            ·{' '}
            <Link href="/terms#refunds" className="font-semibold underline">
              Refunds
            </Link>{' '}
            ·{' '}
            <Link href="/privacy" className="font-semibold underline">
              Privacy
            </Link>
          </span>
        </label>
        <p
          role="alert"
          className="bg-blush m-0 rounded-[8px] px-4 py-3 text-[15px] font-semibold text-[#a32435] empty:hidden"
        >
          {error}
        </p>
      </div>

      <section aria-labelledby="plans-h" className="flex flex-col gap-5 sm:px-14">
        <h2 id="plans-h" className="sr-only">
          Monthly plans
        </h2>
        <ul className="m-0 grid list-none gap-6 p-0 md:grid-cols-3">
          {teasers.map((t, i) => {
            const plan = PLANS[t.id as keyof typeof PLANS];
            const key = `${t.id}_monthly`;
            const current = currentPlan === t.id;
            const pro = t.featured;
            return (
              <li
                key={t.id}
                className={`${pro ? 'box-ember shadow-[30px_30px_60px_rgb(0_0_0/.35)]' : 'box-blush'} rounded-box flex flex-col gap-4 p-7 transition-transform hover:translate-x-0.5 hover:translate-y-0.5 hover:rotate-0 sm:p-10 ${TILT[i] ?? ''}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="m-0 text-[19px] font-bold tracking-[3px] uppercase">{t.name}</h3>
                  {current ? (
                    <Badge tone="ink" className="text-[13px]">
                      Your plan
                    </Badge>
                  ) : (
                    pro && (
                      <Badge tone="ink" className="text-[13px]">
                        Best for daily posting
                      </Badge>
                    )
                  )}
                </div>
                <p className="font-display m-0 text-[64px] leading-[.9] font-light tracking-[-0.03em] whitespace-nowrap sm:text-[clamp(56px,6vw,88px)]">
                  {t.price}
                  <span className="text-[20px] tracking-normal"> / month</span>
                </p>
                <ul
                  className={`m-0 flex flex-1 list-disc flex-col gap-1 pl-5 ${
                    pro ? 'text-[19px] font-bold' : 'text-[17px]'
                  } leading-[1.5]`}
                >
                  <li>{t.credits} credits a month</li>
                  <li>Videos up to {plan.limits.maxVideoDurationSec} seconds</li>
                  <li>
                    {plan.limits.modelTiers.includes('premium')
                      ? 'Animated stills and AI video motion'
                      : 'Animated stills'}
                  </li>
                  <li>
                    {plan.limits.savedVoices} saved{' '}
                    {plan.limits.savedVoices === 1 ? 'voice' : 'voices'}
                  </li>
                  <li>No watermark</li>
                </ul>
                <p
                  className={`m-0 ${pro ? 'text-[19px] font-bold' : 'text-ink-muted text-[15px]'}`}
                >
                  {t.videos}
                </p>
                <button
                  type="button"
                  disabled={busy !== null || current}
                  aria-label={
                    current ? `${t.name} is your plan` : `Choose ${t.name}, ${t.price} a month`
                  }
                  onClick={() => purchase(key)}
                  className={
                    pro
                      ? buttonClasses({
                          size: 'lg',
                          className:
                            'mt-auto w-full [--press-line:var(--shadow-red)] disabled:opacity-60',
                        })
                      : `press font-display mt-auto inline-flex min-h-[54px] w-full items-center justify-center rounded-[8px] bg-transparent px-6 text-[30px] font-light [--press-line:#212121] disabled:opacity-60`
                  }
                >
                  {busy === key ? 'Opening checkout…' : current ? 'Your plan' : `Choose ${t.name}`}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section
        aria-labelledby="topups-h"
        className="box-dark rounded-box mt-4 flex flex-col gap-8 px-5 py-10 sm:mx-0 sm:px-14 sm:py-12 lg:flex-row lg:flex-wrap lg:items-center lg:gap-12"
      >
        <div className="lg:flex-[1_1_320px]">
          <h2
            id="topups-h"
            className="font-display m-0 text-[44px] leading-[.85] font-normal tracking-[-0.03em] sm:text-[64px]"
          >
            Need a top-up?
          </h2>
          <p className="font-label m-0 mt-3 text-[16px] uppercase sm:text-[18px]">
            One-time credits, added to your balance
          </p>
        </div>
        <ul className="m-0 grid list-none grid-cols-3 gap-3 p-0 sm:gap-4 lg:flex-[2_1_600px]">
          {TOPUP_PACKS.map((pack) => (
            <li key={pack.id}>
              <button
                type="button"
                disabled={busy !== null}
                aria-label={`Buy ${fmt(pack.credits)} credits for ${eur(pack.priceCents)}`}
                onClick={() => purchase(pack.id)}
                className="press flex w-full flex-col items-start gap-1 rounded-[8px] bg-transparent p-3 text-left disabled:opacity-60 sm:p-5"
              >
                <span className="font-poster text-[48px] leading-[.9] sm:text-[64px]">
                  {short(pack.credits)}
                </span>
                <span className="text-[14px] sm:text-[17px]">
                  {busy === pack.id ? 'Opening…' : `credits · ${eur(pack.priceCents)}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="text-ink-muted m-0 w-full text-[15px]">
          Failed videos refund their credits automatically. Cancel any time from your account.
        </p>
      </section>
    </main>
  );
}
