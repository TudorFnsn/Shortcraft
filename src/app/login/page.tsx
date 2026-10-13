import type { Metadata } from 'next';
import { siteConfig } from '@/config/site';
import { env } from '@/lib/env';
import { readCarried } from '@/features/auth/carry';
import { oauthErrorMessage } from '@/features/auth/oauth';
import { LoginView } from './login-view';

export const metadata: Metadata = { title: `Log in or sign up — ${siteConfig.name}` };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  // An idea typed on the landing page (or picked on an /ideas page, with its
  // theme) rides through sign-up into Create.
  const params = await searchParams;
  const error = typeof params.error === 'string' ? params.error : null;
  return (
    <LoginView
      carried={readCarried(params)}
      googleEnabled={env.GOOGLE_AUTH_ENABLED}
      initialError={oauthErrorMessage(error)}
    />
  );
}
