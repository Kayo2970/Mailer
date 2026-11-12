import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mailer',
  description: 'Connect a mail account, compose, personalise and send — from your own computer.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-100 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">{children}</body>
    </html>
  );
}
