import type { Metadata } from 'next';
import { siteConfig } from '@/config/site';
import { readCarried } from '@/features/auth/carry';
import { LoginView } from './login-view';

export const metadata: Metadata = { title: `Log in or sign up — ${siteConfig.name}` };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  // An idea typed on the landing page (or picked on an /ideas page, with its
  // theme) rides through sign-up into Create.
  return <LoginView carried={readCarried(await searchParams)} />;
}
