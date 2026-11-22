'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Note } from '@/components/ui/note';
import { buttonClasses } from '@/components/ui/button';
import { siteConfig } from '@/config/site';
import { createSupabaseBrowserClient } from '@/utils/supabase/client';
import { createHrefAfterLogin, type Carried } from '@/features/auth/carry';
import { oauthRedirectTo } from '@/features/auth/oauth';
import { GoogleButton } from './google-button';

type Mode = 'signin' | 'signup';

/** Under-line field in Fraunces 300 (B.1), on the dark box. */
const field = 'field-line text-ink min-h-12 w-full px-0.5 py-2 text-[24px] sm:text-[30px]';

export function LoginView({
  carried,
  googleEnabled = false,
  initialError = null,
}: {
  carried: Carried;
  googleEnabled?: boolean;
  initialError?: string | null;
}) {
  const router = useRouter();
  const { idea, ref } = carried;
  // An idea or a friend's invite link means a new visitor: open on sign-up.
  const [mode, setMode] = useState<Mode>(idea || ref ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const signup = mode === 'signup';

  function switchTo(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function onGoogle() {
    setGoogleLoading(true);
    setError(null);
    setNotice(null);
    try {
      const supabase = createSupabaseBrowserClient();
      // Redirects the browser to Google; we come back through /auth/callback.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: oauthRedirectTo(window.location.origin, carried) },
      });
      if (error) throw error;
    } catch {
      setGoogleLoading(false);
      setError('Google sign-in didn’t start. Try again, or use email.');
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    const supabase = createSupabaseBrowserClient();

    const { data, error } = signup
      ? await supabase.auth.signUp({
          email,
          password,
          // The invite code is claimed server-side at checkout (referral.ts).
          ...(ref ? { options: { data: { ref } } } : {}),
        })
      : await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (!data.session) {
      // Email confirmation is enabled on the project.
      setNotice('Check your email to confirm your account, then log in.');
      setMode('signin');
      return;
    }
    router.push(createHrefAfterLogin(carried));
    router.refresh();
  }

  return (
    <main className="flex flex-col gap-3 overflow-x-clip px-2 pt-2 pb-2 sm:px-6 sm:pb-6 lg:flex-row lg:gap-6">
      <section
        aria-labelledby="hello-h"
        className="box-hero rounded-box relative flex min-w-0 flex-col justify-end gap-4 overflow-hidden px-5 py-8 sm:p-12 lg:flex-[1_1_560px]"
      >
        <p
          aria-hidden="true"
          className="font-poster m-0 bg-clip-text text-[140px] leading-[.72] text-transparent uppercase sm:text-[220px] xl:text-[300px]"
          style={{ backgroundImage: 'linear-gradient(90deg, #f07142, #f0354d 40%, #4a0f19)' }}
        >
          Hello
        </p>
        <h1
          id="hello-h"
          className="font-display m-0 max-w-[14ch] text-[40px] leading-[.85] font-light tracking-[-0.03em] sm:text-[72px]"
        >
          Your next Short is one idea away
        </h1>
        <Note
          rotate={16}
          className="absolute top-6 right-5 text-[26px] sm:top-20 sm:right-14 sm:text-[40px]"
        >
          {siteConfig.trialCredits.toLocaleString('en-US')} free credits!
        </Note>
      </section>

      <section
        aria-labelledby="form-h"
        className="box-dark rounded-box animate-sweep-in flex min-w-0 flex-col justify-center gap-6 px-5 py-10 sm:px-14 sm:py-16 lg:flex-[1_1_520px]"
      >
        <div role="group" aria-label="Account" className="flex gap-2">
          {(['signin', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => switchTo(m)}
              className={`min-h-11 rounded-full px-4 text-[15px] font-semibold transition-colors ${
                mode === m ? 'bg-blush text-on-blush' : 'text-ink hover:bg-ink/10'
              }`}
            >
              {m === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <h2
            id="form-h"
            className="font-display m-0 text-[44px] leading-[.85] font-normal tracking-[-0.03em] sm:text-[64px]"
          >
            {signup ? 'Create your account' : 'Welcome back'}
          </h2>
          <p className="text-ink-muted m-0 text-[16px]">
            {signup
              ? `${siteConfig.trialCredits.toLocaleString('en-US')} free credits to start. No card needed.`
              : 'Sign in to make today’s video.'}
          </p>
        </div>

        {idea && (
          <p className="bg-blush text-on-blush m-0 rounded-[8px] px-4 py-3 text-[15px] leading-6">
            After this, Create opens with your idea:{' '}
            <span className="font-semibold">&ldquo;{idea}&rdquo;</span>
          </p>
        )}

        {googleEnabled && (
          <>
            <GoogleButton onClick={onGoogle} loading={googleLoading} disabled={loading} />
            <div className="text-ink-muted flex items-center gap-3 text-[13px]" aria-hidden="true">
              <span className="bg-line h-px flex-1" />
              or with email
              <span className="bg-line h-px flex-1" />
            </div>
          </>
        )}

        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-[15px]">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={field}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="password" className="text-[15px]">
                Password
              </label>
              {signup && (
                <span id="password-hint" className="text-ink-muted text-[13px]">
                  At least 6 characters
                </span>
              )}
            </div>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                autoComplete={signup ? 'new-password' : 'current-password'}
                aria-describedby={signup ? 'password-hint' : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${field} pr-20`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-pressed={showPassword}
                aria-controls="password"
                className="text-ink absolute inset-y-0 right-0 my-auto h-11 rounded-[8px] px-3 text-[14px] font-semibold"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || googleLoading}
            className={buttonClasses({
              size: 'xl',
              className: 'mt-2 w-full disabled:opacity-60 sm:text-[40px]',
            })}
          >
            {loading ? 'One moment…' : signup ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p
          role="alert"
          className="bg-blush m-0 rounded-[8px] px-4 py-3 text-[15px] font-medium text-[#a32435] empty:hidden"
        >
          {error}
        </p>
        <p
          role="status"
          className="bg-blush text-on-blush m-0 rounded-[8px] px-4 py-3 text-[15px] font-medium empty:hidden"
        >
          {notice}
        </p>

        {(signup || googleEnabled) && (
          <p className="text-ink-muted m-0 text-[13px] leading-5">
            {signup ? 'By signing up' : 'By continuing with Google'} you agree to the{' '}
            <Link href="/terms" className="text-ink font-medium underline">
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="text-ink font-medium underline">
              Privacy Policy
            </Link>
            . We may send a couple of reminder emails; every one has an unsubscribe link.
          </p>
        )}
      </section>
    </main>
  );
}
