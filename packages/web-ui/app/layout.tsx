import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'seco',
  description: 'a local professional identity engine',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
