import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: { default: 'RETRY · Mission Control', template: '%s' },
  description: 'The AI QA tester that learns your team’s testing rules from every human rescue. Every call routed through Mubit; every rescue a versioned model update, gated on held-out runs.',
  applicationName: 'RETRY',
  openGraph: { title: 'RETRY — every rescue a model update', description: 'Self-healing tools guess. RETRY learns your rules from every rescue — through Mubit.', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'RETRY — every rescue a model update' },
};

export const viewport: Viewport = { themeColor: '#07080B', colorScheme: 'dark' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
