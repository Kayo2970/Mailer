import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mailer',
  description: 'Connect a mail account, compose, personalise and send — from your own computer.',
  icons: {
    icon: [
      { url: '/icon-light.svg', media: '(prefers-color-scheme: light)', type: 'image/svg+xml' },
      { url: '/icon-dark.svg', media: '(prefers-color-scheme: dark)', type: 'image/svg+xml' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
  },
};

const THEME_INIT_SCRIPT = `(function(){try{var k='mailer.theme.v1';var p=localStorage.getItem(k);var d=p==='dark'||(p!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.dataset.theme=d?'dark':'light';}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-slate-100 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">{children}</body>
    </html>
  );
}
