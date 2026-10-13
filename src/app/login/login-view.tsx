'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ThemeFrame } from '@/components/theme-frame';
import { buttonClasses } from '@/components/ui/button';
import { siteConfig } from '@/config/site';
import { createSupabaseBrowserClient } from '@/utils/supabase/client';
import { createHrefAfterLogin, type Carried } from '@/features/auth/carry';
import { oauthRedirectTo } from '@/features/auth/oauth';
import { GoogleButton } from './google-button';

type Mode = 'signin' | 'signup';

const field =
  'border-line-strong bg-surface text-ink placeholder:text-ink-muted focus-visible:border-ember min-h-12 w-full rounded-card border px-4 text-[16px]';

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
  const { idea } = carried;
  const [mode, setMode] = useState<Mode>(idea ? 'signup' : 'signin');
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
      ? await supabase.auth.signUp({ email, password })
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
    <main className="mx-auto grid max-w-[1120px] items-center gap-12 px-4 py-10 sm:px-8 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:gap-20 lg:py-16">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[32px] leading-9 font-bold tracking-[-0.02em]">
            {signup ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="text-ink-muted">
            {signup
              ? `${siteConfig.trialCredits.toLocaleString('en-US')} free credits to start. No card needed.`
              : 'Log in to make today’s video.'}
          </p>
        </div>

        <div
          role="group"
          aria-label="Account"
          className="bg-raised grid grid-cols-2 gap-1 rounded-full p-1"
        >
          {(['signin', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => switchTo(m)}
              className={`min-h-11 rounded-full text-[15px] font-semibold transition-colors ${
                mode === m ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {m === 'signin' ? 'Log in' : 'Sign up'}
            </button>
          ))}
        </div>

        {idea && (
          <p className="bg-ember-soft text-ink rounded-card px-4 py-3 text-[15px] leading-6">
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

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-semibold">
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
              <label htmlFor="password" className="text-sm font-semibold">
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
                className="text-ink-muted hover:text-ink absolute inset-y-0 right-1 my-auto h-10 rounded-full px-3 text-[13px] font-semibold"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || googleLoading}
            className={buttonClasses({ size: 'lg', className: 'w-full disabled:opacity-60' })}
          >
            {loading ? 'One moment…' : signup ? 'Create account' : 'Log in'}
          </button>
        </form>

        <p role="alert" className="text-danger text-sm font-medium empty:hidden">
          {error}
        </p>
        <p role="status" className="text-success text-sm font-medium empty:hidden">
          {notice}
        </p>

        {(signup || googleEnabled) && (
          <p className="text-ink-muted text-[13px] leading-5">
            {signup ? 'By signing up' : 'By continuing with Google'} you agree to the{' '}
            <Link href="/terms" className="text-ember-ink font-medium underline">
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="text-ember-ink font-medium underline">
              Privacy Policy
            </Link>
            . We may send a couple of reminder emails; every one has an unsubscribe link.
          </p>
        )}
      </div>

      <aside
        aria-label={`Why ${siteConfig.name}`}
        className="bg-surface border-line rounded-panel hidden items-center gap-8 border p-8 lg:flex"
      >
        <div className="w-[180px] shrink-0 overflow-hidden rounded-[22px] border-[5px] border-[#221c17] dark:border-[#0d0b09]">
          <ThemeFrame themeId="fun-facts" variant="phone" caption />
        </div>
        <div className="flex flex-col gap-4">
          <h2 className="font-display text-[24px] leading-8 font-bold">
            Your next Short, without showing your face
          </h2>
          <ul className="text-ink-muted flex flex-col gap-2.5 text-[15px] leading-6">
            <li>One line of idea in, a captioned 9:16 video out.</li>
            <li>Eight looks, from Fun Facts to Horror Story.</li>
            <li>Failed videos refund their credits automatically.</li>
          </ul>
        </div>
      </aside>
    </main>
  );
}
