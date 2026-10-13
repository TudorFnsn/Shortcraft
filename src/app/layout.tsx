import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import { siteConfig } from '@/config/site';
import { Header } from '@/components/header';
import { themeInitScript } from '@/components/theme/theme';
import { Footer } from '@/components/footer';
import { MobileNav } from '@/components/mobile-nav';
import { InlineScript } from '@/components/inline-script';
import { resolveSiteUrl } from '@/features/seo/site';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  // Canonical/OG URLs resolve against the production domain, never localhost.
  metadataBase: new URL(resolveSiteUrl(process.env)),
  title: `${siteConfig.name} — ${siteConfig.tagline}`,
  description: siteConfig.description,
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // suppressHydrationWarning: the inline theme script may set data-theme before hydration.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <InlineScript html={themeInitScript} />
      </head>
      <body className="bg-paper text-ink flex min-h-full flex-col">
        <a
          href="#main"
          className="bg-ember text-on-ember rounded-button shadow-sheet sr-only z-50 font-semibold focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:px-4 focus:py-2.5"
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
