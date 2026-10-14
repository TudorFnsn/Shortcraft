import type { Metadata } from 'next';
import { Fraunces, Inter, League_Gothic, Shadows_Into_Light_Two, Urbanist } from 'next/font/google';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import { siteConfig } from '@/config/site';
import { Header } from '@/components/header';
import { themeInitScript } from '@/components/theme/theme';
import { Footer } from '@/components/footer';
import { MobileNav } from '@/components/mobile-nav';
import { InlineScript } from '@/components/inline-script';
import { resolveSiteUrl } from '@/features/seo/site';

// Boxes type (DesignPlan §4 B.1). Variable faces load their weight axis only.
const inter = Inter({ variable: '--font-inter', subsets: ['latin'], display: 'swap' });
const fraunces = Fraunces({ variable: '--font-fraunces', subsets: ['latin'], display: 'swap' });
const leagueGothic = League_Gothic({
  variable: '--font-league-gothic',
  subsets: ['latin'],
  display: 'swap',
});
const urbanist = Urbanist({ variable: '--font-urbanist', subsets: ['latin'], display: 'swap' });
// Decorative notes only: not preloaded, so they never hold up first paint.
const shadows = Shadows_Into_Light_Two({
  variable: '--font-shadows',
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  preload: false,
});

const fontVariables = [inter, fraunces, leagueGothic, urbanist, shadows]
  .map((f) => f.variable)
  .join(' ');

export const metadata: Metadata = {
  // Canonical/OG URLs resolve against the production domain, never localhost.
  metadataBase: new URL(resolveSiteUrl(process.env)),
  title: `${siteConfig.name} — ${siteConfig.tagline}`,
  description: siteConfig.description,
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // suppressHydrationWarning: the inline theme script may set data-theme before hydration.
    <html lang="en" suppressHydrationWarning className={`${fontVariables} h-full antialiased`}>
      <head>
        <InlineScript html={themeInitScript} />
      </head>
      <body className="bg-paper text-ink flex min-h-full flex-col">
        <a
          href="#main"
          className="bg-ink text-paper rounded-button shadow-sheet sr-only z-50 font-semibold focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:px-4 focus:py-2.5"
        >
          Skip to content
        </a>
        <Header />
        <div id="main" className="flex-1">
          {children}
        </div>
        <Footer />
        <MobileNav />
        <SpeedInsights />
      </body>
    </html>
  );
}
