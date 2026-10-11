import type { Metadata } from 'next';
import { Bricolage_Grotesque, Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { siteConfig } from '@/config/site';
import { Header } from '@/components/header';
import { themeInitScript } from '@/components/theme/theme';
import { Footer } from '@/components/footer';
import { InlineScript } from '@/components/inline-script';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// Display face for headings and the wordmark (Paper & Ember).
const bricolage = Bricolage_Grotesque({
  variable: '--font-bricolage',
  subsets: ['latin'],
  weight: ['700'],
});

export const metadata: Metadata = {
  title: `${siteConfig.name} — ${siteConfig.tagline}`,
  description: siteConfig.description,
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // suppressHydrationWarning: the inline theme script may set data-theme before hydration.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} h-full antialiased`}
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
      </body>
    </html>
  );
}
