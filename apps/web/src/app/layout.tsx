import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AppProviders } from '@/components/app-providers';

import './globals.css';

export const metadata: Metadata = {
  description: 'Evidence-based research for uploaded Japanese IR documents.',
  title: 'StockLens AI',
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
