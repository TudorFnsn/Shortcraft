'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/utils/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    const supabase = createSupabaseBrowserClient();

    const { data, error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

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
    router.push('/create');
    router.refresh();
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-6 py-16">
      <h1 className="font-display text-2xl font-semibold">
        {mode === 'signin' ? 'Log in' : 'Create your account'}
      </h1>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border-line bg-surface focus:border-ember rounded-md border px-3 py-2 text-sm outline-none"
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="Password (min 6 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border-line bg-surface focus:border-ember rounded-md border px-3 py-2 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-ember text-on-ember rounded-md px-3 py-2 text-sm font-medium hover:brightness-95 disabled:opacity-50"
        >
          {loading ? 'Please wait…' : mode === 'signin' ? 'Log in' : 'Sign up'}
        </button>
      </form>

      {error && <p className="text-danger text-sm">{error}</p>}
      {notice && <p className="text-success text-sm">{notice}</p>}

      <button
        type="button"
        onClick={() => {
          setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
          setError(null);
          setNotice(null);
        }}
        className="text-ink-muted hover:text-ink text-sm"
      >
        {mode === 'signin' ? 'No account? Sign up' : 'Have an account? Log in'}
      </button>
    </main>
  );
}
