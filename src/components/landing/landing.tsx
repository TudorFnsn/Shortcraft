import Link from 'next/link';
import { siteConfig } from '@/config/site';
import { ColourIn } from '@/components/motion/colour-in';
import { Marquee } from '@/components/motion/marquee';
import { SmoothScroll } from '@/components/motion/smooth-scroll';
import { SplitLines } from '@/components/motion/split-lines';
import { Typed } from '@/components/motion/typed';
import { ThemeFrame } from '@/components/theme-frame';
import { Badge } from '@/components/ui/badge';
import { Box } from '@/components/ui/box';
import { buttonClasses } from '@/components/ui/button';
import { Note } from '@/components/ui/note';
import { HeroIdeaInput } from './hero-idea-input';
import { lookFill, POSTER_LOOKS, WEEK } from './look-fill';
import { LooksBox } from './looks-box';
import { planTeasers, topUpLine } from './plan-teaser';
import type { ShowcaseVideo as ShowcaseClip } from './showcase';
import { ShowcaseVideo } from './showcase-video';

const fmt = (n: number) => n.toLocaleString('en-US');

const FEATURES = [
  'A script that hooks',
  'A visual for every scene',
  'A natural voiceover',
  'Word-by-word captions',
  'A 9:16 MP4',
  'Honest AI labelling',
] as const;

const STEPS = ['Describe an idea', 'Pick a look and a length', 'Download and post'] as const;

const UNPOSTED = ['UNPOSTED', 'ON PAUSE', 'TOO QUIET'] as const;

/** Inter 600, +3px, uppercase (B.1 eyebrow, marketing scale). */
const eyebrow = 'm-0 text-[clamp(1rem,2vw,1.5rem)] font-semibold tracking-[3px] uppercase';
/** Fraunces 400 section heading (B.1 heading, marketing scale). */
const heading =
  'font-display m-0 text-[clamp(3.5rem,8vw,9rem)] leading-[.8] font-normal tracking-[-0.04em]';
/** Inter 300 lead (B.1 lead, marketing scale). */
const lead = 'm-0 text-[clamp(1.5rem,1.75vw,2rem)] leading-[1.2] font-light text-pretty';

/** Plan boxes tilt −1° / 0 / +1° (B.1 Shape); Pro is the dark box here. */
const TILTS = ['-rotate-1', '', 'rotate-1'] as const;

/**
 * The landing page, Boxes look (DesignPlan §4 B.2, boards Main and
 * PhoneLanding): a blush hero box with the three-line headline, the SHORTCRAFT
 * poster filled with the eight looks, an under-line idea form (a plain GET with
 * `?idea=`, unchanged), the ember "Your channel is UNPOSTED" box with a week of
 * posts, the blush "You bring the idea" box with the marquee and three steps,
 * the sky looks box and the pricing teaser. The dark footer comes from the
 * shell. Smooth scroll runs on this page only.
 */
export function Landing({
  signedIn,
  showcase = [],
}: {
  signedIn: boolean;
  /** Real videos for the first frames of the week; empty slots stay drawn. */
  showcase?: readonly ShowcaseClip[];
}) {
  const plans = planTeasers();
  const startAction = signedIn ? '/create' : '/login';

  return (
    <>
      <SmoothScroll />

      <section
        aria-labelledby="hero-h"
        className="flex flex-col items-center px-4 pt-6 sm:px-6 sm:pt-16 lg:px-[100px] lg:pt-[120px]"
      >
        <div className="box-hero rounded-box flex w-full items-center justify-center px-2 py-9 sm:min-h-[300px] sm:px-6">
          <SplitLines
            as="h1"
            id="hero-h"
            className="font-display m-0 max-w-[14ch] text-center text-[clamp(3.375rem,8vw,10rem)] leading-[.8] font-light tracking-[-0.02em] lg:max-w-none"
          >
            Post a Short every day without showing your face
          </SplitLines>
        </div>

        <div className="relative mt-16 flex w-full justify-center sm:mt-[140px]">
          <Note
            className="absolute top-[-30px] left-0 text-[26px] sm:top-[-40px] sm:left-[6%] sm:text-[48px]"
            rotate={-23}
          >
            One idea in
          </Note>
          <Arrow className="absolute top-5 left-[11%] max-lg:hidden" />
          <p
            role="img"
            aria-label={siteConfig.name}
            className="font-poster m-0 flex gap-[0.02em] text-[clamp(4rem,22vw,24rem)] leading-[.75] uppercase"
          >
            {[...siteConfig.name.toUpperCase()].map((ch, i) => (
              <span
                key={i}
                aria-hidden="true"
                className="inline-block bg-clip-text text-transparent transition-transform duration-300 hover:-translate-y-3.5 hover:-rotate-2"
                style={{ backgroundImage: lookFill(POSTER_LOOKS[i % POSTER_LOOKS.length]!) }}
              >
                {ch}
              </span>
            ))}
          </p>
          <Note
            className="absolute right-0 bottom-[-34px] text-[26px] sm:top-[30px] sm:right-[4%] sm:bottom-auto sm:text-[48px]"
            rotate={23}
          >
            A Short out
          </Note>
          <Arrow flip className="absolute top-[90px] right-[8%] max-lg:hidden" />
        </div>

        {/* A plain GET form: works without JavaScript and carries the idea into Create. */}
        <form
          id="start"
          action={startAction}
          method="get"
          className="mt-14 mb-16 flex w-full max-w-[720px] flex-col gap-4 sm:mt-20 sm:mb-[120px] sm:gap-5"
        >
          <label
            htmlFor="hero-idea"
            className="text-ember-ink text-[14px] font-semibold tracking-[3px] uppercase sm:text-[20px]"
          >
            What&apos;s your first video about?
          </label>
          <HeroIdeaInput
            id="hero-idea"
            className="text-[24px] sm:text-[clamp(1.5rem,1.75vw,3rem)]"
          />
          <button
            type="submit"
            className={buttonClasses({ size: 'xl', className: 'w-full sm:text-[40px]' })}
          >
            {signedIn ? 'Make it' : 'Make my first video'}
          </button>
          {!signedIn && (
            <p className="text-ink-muted m-0 text-[14px] sm:text-[16px]">
              {fmt(siteConfig.trialCredits)} free credits to start, enough for your first video. No
              card needed.
            </p>
          )}
        </form>
      </section>

      <div className="flex flex-col gap-3 px-2 sm:gap-6 sm:px-6">
        <Box
          tone="ember"
          pop
          aria-labelledby="unposted-h"
          className="relative flex flex-col gap-12 overflow-hidden px-5 py-16 lg:min-h-[1000px] lg:flex-row lg:gap-[6%] lg:px-20 lg:py-[120px]"
        >
          <div className="flex min-w-0 flex-col items-center gap-3 lg:flex-[1_1_52%]">
            <Badge tone="ink" className="px-4 py-1.5 text-[14px] tracking-[3px] uppercase">
              Your channel is
            </Badge>
            <h2 id="unposted-h" className="m-0 w-full text-center">
              <span className="font-poster block min-h-[1em] pt-2.5 text-[clamp(7rem,14vw,18rem)] leading-[.75] uppercase [text-shadow:6px_6px_0_var(--shadow-red)] sm:[text-shadow:10px_10px_0_var(--shadow-red)]">
                <Typed words={UNPOSTED} label="Unposted." />
              </span>
              <span className="font-display mt-3 block text-[clamp(4rem,9vw,9rem)] leading-[.75] font-normal tracking-[-0.04em] sm:mt-6">
                We can help
              </span>
            </h2>
            <p className={`${lead} mt-6 sm:mt-14 sm:w-[86%]`}>
              You know the rule: post every day. But writing a script, finding visuals, recording a
              voice and timing captions eats an evening per video. {siteConfig.name} does the
              production. You bring one line, and it hands you a vertical video that&apos;s ready
              for TikTok, Reels and Shorts.
            </p>
          </div>
          <div className="relative min-w-0 lg:flex-[1_1_40%]">
            <Note
              colour="cyan"
              rotate={-23}
              className="text-[48px] max-lg:hidden lg:absolute lg:top-10 lg:left-[10%]"
            >
              A week of posts!
            </Note>
            <ColourIn
              aria-hidden="true"
              className="bg-paper shadow-hero mx-auto grid w-full max-w-[340px] [transform:rotate(-3deg)] grid-cols-3 gap-2 rounded-[8px] p-2 sm:max-w-[520px] sm:gap-2.5 sm:p-[18px] lg:absolute lg:top-40 lg:-right-10 lg:w-[520px] lg:max-w-none lg:[transform:perspective(1400px)_rotateY(-22deg)_rotateX(8deg)_rotate(4deg)]"
            >
              {WEEK.map((w, i) => {
                const clip = showcase[i];
                return (
                  <div
                    key={w.day}
                    className="relative aspect-[9/16] overflow-hidden rounded-[8px] max-sm:[&:nth-child(n+4)]:hidden"
                  >
                    {clip ? (
                      <ShowcaseVideo src={clip.url} />
                    ) : (
                      <ThemeFrame themeId={w.themeId} variant="phone" caption={false} />
                    )}
                    <span className="font-label absolute top-1.5 left-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white uppercase">
                      {w.day}
                    </span>
                    {!clip && (
                      <span className="absolute inset-x-2 bottom-[18%] text-center text-[11px] font-semibold text-white [text-shadow:0_1px_2px_#000]">
                        {w.caption}
                      </span>
                    )}
                  </div>
                );
              })}
            </ColourIn>
          </div>
        </Box>

        <Box
          tone="blush"
          pop
          alternate
          aria-labelledby="get-h"
          className="relative flex flex-col gap-12 overflow-hidden px-5 py-16 lg:min-h-[1000px] lg:flex-row lg:gap-32 lg:py-[120px] lg:pl-20"
        >
          <div className="flex min-w-0 flex-col gap-5 sm:gap-7 lg:flex-[1_1_50%]">
            <p className={`${eyebrow} text-ember-ink`}>Our secret sauce</p>
            <SplitLines id="get-h" className={heading}>
              You bring the idea
            </SplitLines>
            <p className={`${lead} sm:pr-[5%] sm:pl-[2%]`}>
              One line is enough: a topic, a twist, a tone. Stuck? Every look comes with ready-made
              ideas, fresh every day. {siteConfig.name} writes the script, draws every scene,
              records the voice and times the captions.
            </p>
            <h3 className="font-display m-0 mt-4 text-[clamp(2rem,4vw,4rem)] leading-none font-normal tracking-[-0.02em]">
              From idea to upload in three steps
            </h3>
            <ol className="m-0 flex rotate-2 list-none flex-col gap-5 rounded-[8px] border border-white/50 bg-[rgb(240_226_221/.4)] p-6 shadow-[0_4px_30px_rgb(0_0_0/.1)] backdrop-blur-[10px] sm:p-16">
              {STEPS.map((s, i) => (
                <li key={s} className="flex items-baseline gap-5">
                  <span
                    aria-hidden="true"
                    className="font-poster text-ember text-[64px] leading-[.8]"
                  >
                    {i + 1}
                  </span>
                  <span className="font-display text-[28px] font-light sm:text-[32px]">{s}</span>
                </li>
              ))}
            </ol>
          </div>
          <section aria-label="What every video includes" className="min-w-0 lg:flex-[1_1_42%]">
            <Marquee
              items={FEATURES.map((f) => (
                <>
                  <span
                    aria-hidden="true"
                    className="mr-4 align-middle font-sans text-[.7em] font-semibold text-[#F095A1]"
                  >
                    *
                  </span>
                  {f}
                </>
              ))}
              className="h-[340px] sm:h-[760px]"
              itemClassName="font-display text-ink-muted text-[36px] leading-[1.15] font-light tracking-[-0.03em] whitespace-nowrap sm:text-[clamp(3rem,5.5vw,6.5rem)]"
            />
          </section>
        </Box>

        <Box
          tone="sky"
          pop
          id="looks"
          aria-labelledby="looks-h"
          className="relative flex flex-col gap-2.5 overflow-hidden px-5 py-16 lg:min-h-[1100px] lg:px-20 lg:py-[120px]"
        >
          <p className={eyebrow}>Eight looks</p>
          <SplitLines id="looks-h" className={`${heading} mb-6 sm:mb-14`}>
            Mind if we show off?
          </SplitLines>
          <LooksBox />
        </Box>
      </div>

      <section
        id="pricing"
        aria-labelledby="price-h"
        className="flex flex-col gap-10 px-4 pt-24 pb-16 sm:gap-12 sm:px-10 sm:pt-40 sm:pb-[120px] lg:px-20"
      >
        <div className="flex flex-col gap-2.5">
          <p className={`${eyebrow} text-ember-ink`}>Pricing</p>
          <SplitLines id="price-h" className={heading}>
            Pay for what you post
          </SplitLines>
        </div>
        <ul className="m-0 grid list-none gap-6 p-0 md:grid-cols-3">
          {plans.map((p, i) => (
            <li
              key={p.id}
              className={`${p.featured ? 'box-dark' : 'box-blush'} rounded-box flex flex-col gap-3.5 p-8 sm:p-10 ${TILTS[i] ?? ''}`}
            >
              <h3 className="m-0 text-[20px] font-semibold tracking-[3px] uppercase">{p.name}</h3>
              <p className="font-display m-0 text-[clamp(3.5rem,5vw,5.5rem)] leading-[.9] font-light tracking-[-0.03em] whitespace-nowrap">
                {p.price}
                <span className="text-[20px] tracking-normal"> / month</span>
              </p>
              <p className="m-0 text-[22px] leading-[1.3] font-light">
                {p.credits} credits a month. {p.limits}.
              </p>
              <p className="text-ink-muted m-0 text-[16px]">{p.videos}</p>
            </li>
          ))}
        </ul>
        <p className="text-ink-muted m-0 text-[16px]">{topUpLine()}</p>
        <Link
          href="/pricing"
          className="font-display self-start text-[28px] font-light underline underline-offset-4 sm:text-[32px]"
        >
          See every plan and top-up
        </Link>
      </section>
    </>
  );
}

/** The hand-drawn arrows beside the poster (decorative). */
function Arrow({ flip = false, className = '' }: { flip?: boolean; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="160"
      height="200"
      viewBox="0 0 160 200"
      className={className}
      fill="none"
      stroke="#F0354D"
      strokeWidth="6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {flip ? (
        <>
          <path d="M120 10 C 120 80, 80 150, 12 176" />
          <path d="M40 150 L10 177 L50 186" />
        </>
      ) : (
        <>
          <path d="M10 10 C 30 90, 70 150, 140 180" />
          <path d="M100 178 L142 182 L122 146" />
        </>
      )}
    </svg>
  );
}
