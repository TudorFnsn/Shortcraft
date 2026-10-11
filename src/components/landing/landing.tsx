import Link from 'next/link';
import { siteConfig } from '@/config/site';
import { THEMES } from '@/config/themes';
import { ThemeFrame } from '@/components/theme-frame';
import { buttonClasses } from '@/components/ui/button';
import { planTeasers, topUpLine } from './plan-teaser';

const fmt = (n: number) => n.toLocaleString('en-US');

/** Three 9:16 frames fanned out beside the hero copy. */
const FAN = [
  { themeId: 'comedy-skit', className: 'left-[2%] top-[70px] w-[36%] -rotate-[7deg] z-10' },
  { themeId: 'fun-facts', className: 'left-[30%] top-0 w-[40%] z-30' },
  { themeId: 'horror-story', className: 'left-[62%] top-[70px] w-[36%] rotate-[7deg] z-20' },
] as const;

const FEATURES = [
  ['A script that hooks', 'Written for short attention spans, in the voice of your theme.'],
  [
    'A visual for every scene',
    'AI images with smooth camera motion, or real AI video motion on Pro.',
  ],
  ['A natural voiceover', 'No microphone, no recording booth.'],
  ['Word-by-word captions', 'Timed to the voice, because most people watch on mute.'],
  ['A 9:16 MP4', 'Sized for TikTok, Reels and Shorts. Download it and post.'],
  ['Honest labelling', 'Every video carries an AI-generated label, as the platforms ask.'],
] as const;

function Check() {
  return (
    <span className="bg-ember-soft text-ember-ink flex size-7 shrink-0 items-center justify-center rounded-full">
      <svg
        width="14"
        height="14"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 10.5l3.2 3L15 6.5" />
      </svg>
    </span>
  );
}

const sectionHeading =
  'font-display text-[30px] leading-[1.15] font-bold tracking-[-0.02em] sm:text-[44px]';
const wrap = 'mx-auto max-w-[1344px] px-4 sm:px-8 xl:px-12';

/** The logged-out (and logged-in) home page: Paper & Ember landing (DesignPlan item L). */
export function Landing({ signedIn }: { signedIn: boolean }) {
  const plans = planTeasers();
  const startAction = signedIn ? '/create' : '/login';

  return (
    <>
      <section aria-labelledby="hero-h" className={`${wrap} py-8 sm:py-14 lg:py-20`}>
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16">
          <div className="flex min-w-0 flex-col gap-6">
            <span className="bg-ember-soft text-ember-ink self-start rounded-full px-3 py-1 text-[13px] leading-[18px] font-semibold">
              For faceless channels that post every day
            </span>
            <h1
              id="hero-h"
              className="font-display text-[40px] leading-[44px] font-bold tracking-[-0.03em] sm:text-[56px] sm:leading-[60px] xl:text-[64px] xl:leading-[68px]"
            >
              Post a Short every day without showing your face.
            </h1>
            <p className="text-ink-muted max-w-[540px] text-[17px] leading-[26px] sm:text-[19px] sm:leading-[29px]">
              Type one idea. {siteConfig.name} writes the script, draws every scene, records the
              voice and adds captions, then hands you a vertical video ready for TikTok, Reels and
              Shorts.
            </p>

            {/* A plain GET form: works without JavaScript and carries the idea into Create. */}
            <form action={startAction} method="get" className="flex max-w-[560px] flex-col gap-2.5">
              <label htmlFor="hero-idea" className="text-sm font-semibold">
                What&apos;s your first video about?
              </label>
              <div className="bg-surface border-line-strong flex flex-col gap-2 rounded-[18px] border p-1.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--ember)] sm:flex-row">
                <input
                  id="hero-idea"
                  name="idea"
                  type="text"
                  maxLength={300}
                  placeholder="e.g. three facts about octopuses that sound made up"
                  className="text-ink placeholder:text-ink-muted min-h-12 min-w-0 flex-1 bg-transparent px-3.5 text-[17px] outline-none"
                />
                <button
                  type="submit"
                  className={buttonClasses({ size: 'md', className: 'min-h-12 whitespace-nowrap' })}
                >
                  {signedIn ? 'Make it' : 'Make it free'}
                </button>
              </div>
              {!signedIn && (
                <span className="text-ink-muted text-sm">
                  {fmt(siteConfig.trialCredits)} free credits to start, enough for your first video.
                  No card needed.
                </span>
              )}
            </form>
          </div>

          <div aria-hidden="true" className="relative h-[400px] min-w-0 sm:h-[520px] xl:h-[600px]">
            {FAN.map((f) => (
              <div
                key={f.themeId}
                className={`shadow-sheet absolute overflow-hidden rounded-[26px] border-[6px] border-[#221c17] dark:border-[#0d0b09] ${f.className}`}
              >
                <ThemeFrame
                  themeId={f.themeId}
                  variant="phone"
                  caption={f.themeId === 'fun-facts'}
                />
                <span className="absolute top-3 left-3 rounded-full bg-[rgb(20_16_13/0.55)] px-2 py-0.5 text-[11px] leading-4 font-semibold text-white">
                  {THEMES.find((t) => t.id === f.themeId)?.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how" aria-labelledby="how-h" className="bg-surface border-line border-y">
        <div className={`${wrap} flex flex-col gap-10 py-14 sm:py-24`}>
          <div className="flex max-w-[640px] flex-col gap-2">
            <h2 id="how-h" className={sectionHeading}>
              From idea to upload in three steps
            </h2>
            <p className="text-ink-muted">
              You bring the idea. {siteConfig.name} does the production.
            </p>
          </div>
          <ol className="grid gap-5 md:grid-cols-3">
            <li className="bg-paper rounded-panel flex flex-col gap-4 p-6">
              <StepNumber n={1} />
              <h3 className="text-[19px] leading-6 font-semibold">Describe an idea</h3>
              <p className="text-ink-muted">
                One line is enough: a topic, a twist, a tone. Stuck? Every theme comes with
                ready-made ideas, fresh every day.
              </p>
              <div
                aria-hidden="true"
                className="bg-surface border-line rounded-[14px] border px-4 py-3.5 text-[15px]"
              >
                Why honey never spoils<span className="text-ember">|</span>
              </div>
            </li>
            <li className="bg-paper rounded-panel flex flex-col gap-4 p-6">
              <StepNumber n={2} />
              <h3 className="text-[19px] leading-6 font-semibold">Pick a theme and length</h3>
              <p className="text-ink-muted">
                Eight looks, from Fun Facts to Horror Story. Choose 15 to 120 seconds. You see the
                credit cost before you press Generate.
              </p>
              <div aria-hidden="true" className="flex flex-wrap gap-1.5 text-[13px]">
                <span className="border-ember rounded-full border-2 px-2.5 py-1 font-semibold">
                  Fun Facts
                </span>
                <span className="border-line-strong rounded-full border px-2.5 py-1">
                  Horror Story
                </span>
                <span className="border-line-strong rounded-full border px-2.5 py-1">
                  Life Hack
                </span>
              </div>
            </li>
            <li className="bg-paper rounded-panel flex flex-col gap-4 p-6">
              <StepNumber n={3} />
              <h3 className="text-[19px] leading-6 font-semibold">Download and post</h3>
              <p className="text-ink-muted">
                Watch it come together step by step, then download a 9:16 MP4. Every video stays in
                your Library.
              </p>
              <div
                aria-hidden="true"
                className="bg-surface border-line flex flex-col gap-1.5 rounded-[14px] border px-3.5 py-3"
              >
                <span className="bg-ember-soft text-ember-ink self-start rounded-full px-2 py-0.5 text-xs font-semibold">
                  Step 4 of 6
                </span>
                <span className="text-[15px] font-semibold">Recording voice</span>
                <span className="bg-raised h-1.5 overflow-hidden rounded-full">
                  <span className="bg-ember block h-full w-[58%]" />
                </span>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section aria-labelledby="themes-h" className={`${wrap} flex flex-col gap-8 py-14 sm:py-24`}>
        <div className="flex max-w-[640px] flex-col gap-2">
          <h2 id="themes-h" className={sectionHeading}>
            Eight looks, ready on day one
          </h2>
          <p className="text-ink-muted">
            Each theme sets the script style, the visuals and the voice, so your channel stays
            consistent from one upload to the next.
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {THEMES.map((t) => (
            <li key={t.id} className="flex flex-col gap-2.5">
              <ThemeFrame themeId={t.id} variant="card" className="rounded-card" />
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] leading-5 font-semibold">{t.label}</span>
                <span className="text-ink-muted text-[13px] leading-[18px]">{t.blurb}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="get-h" className="bg-surface border-line border-y">
        <div
          className={`${wrap} grid items-start gap-10 py-14 sm:py-24 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]`}
        >
          <div className="flex flex-col gap-2">
            <h2 id="get-h" className={sectionHeading}>
              Everything a Short needs, in one file
            </h2>
            <p className="text-ink-muted">
              No editing timeline, no stock-footage hunt, no microphone.
            </p>
          </div>
          <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {FEATURES.map(([title, body]) => (
              <li key={title} className="flex items-start gap-3">
                <Check />
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold">{title}</span>
                  <span className="text-ink-muted text-[15px] leading-[22px]">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        id="pricing"
        aria-labelledby="price-h"
        className={`${wrap} flex flex-col gap-8 py-14 sm:py-24`}
      >
        <div className="flex max-w-[640px] flex-col gap-2">
          <h2 id="price-h" className={sectionHeading}>
            Simple monthly credits
          </h2>
          <p className="text-ink-muted">
            Credits refill every month. You see the cost of every video before you make it, and a
            video that fails is refunded.
          </p>
        </div>
        <ul className="grid gap-4 md:grid-cols-3">
          {plans.map((p) => (
            <li
              key={p.id}
              className={`bg-surface rounded-panel flex flex-col gap-4 p-6 ${
                p.featured ? 'border-ember shadow-selected border-2' : 'border-line border'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[19px] leading-6 font-semibold">{p.name}</h3>
                {p.featured && (
                  <span className="bg-ember-soft text-ember-ink rounded-full px-2.5 py-0.5 text-xs font-semibold">
                    Best for daily posting
                  </span>
                )}
              </div>
              <p className="flex items-baseline gap-1.5">
                <span className="font-display text-[40px] leading-[44px] font-bold tracking-[-0.02em]">
                  {p.price}
                </span>
                <span className="text-ink-muted">/ month</span>
              </p>
              <ul className="flex flex-col gap-2 text-[15px] leading-[22px]">
                <li>{p.credits} credits a month</li>
                <li className="text-ink-muted">{p.videos}</li>
                <li className="text-ink-muted">{p.limits}</li>
                <li className="text-ink-muted">No watermark</li>
              </ul>
              <Link
                href="/pricing"
                className={buttonClasses({
                  variant: p.featured ? 'primary' : 'secondary',
                  className: 'mt-auto min-h-12',
                })}
              >
                Choose {p.name}
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-ink-muted text-sm">
          Need a boost? {topUpLine()}{' '}
          <Link href="/pricing" className="text-ember-ink font-semibold underline">
            See full pricing
          </Link>
        </p>
      </section>

      <section aria-labelledby="cta-h" className={`${wrap} pb-14 sm:pb-24`}>
        <div className="bg-ember-soft flex flex-col items-center gap-4 rounded-[28px] px-5 py-10 text-center sm:px-12 sm:py-16">
          <h2 id="cta-h" className={sectionHeading}>
            {signedIn ? 'Your next video is one idea away' : 'Your first video is on us'}
          </h2>
          <p className="max-w-[520px]">
            {signedIn
              ? 'Pick a theme, type an idea and press Generate.'
              : `Sign up, type an idea and press Generate. The ${fmt(siteConfig.trialCredits)} trial credits cover your first 15-second video.`}
          </p>
          <Link href={startAction} className={buttonClasses({ size: 'lg' })}>
            {signedIn ? 'Create a video' : 'Start free'}
          </Link>
        </div>
      </section>
    </>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="bg-ember-soft text-ember-ink flex size-9 items-center justify-center rounded-full font-bold"
    >
      {n}
    </span>
  );
}
