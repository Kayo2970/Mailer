'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Clock, History, Loader2, Mail, PenLine, Settings } from 'lucide-react';
import { api, type LogCounts, type PublicEmailSettings } from '@/lib/client';
import { useTheme } from '@/lib/theme';
import { ComposeTab } from '@/components/compose-tab';
import { LogList } from '@/components/log-list';
import { SettingsTab } from '@/components/settings-tab';
import { ToastView, type Toast } from '@/components/ui';
import { GhostFibersBackground } from '@/components/ghost-fibers-bg';
import { ThemeToggle } from '@/components/theme-toggle';
import PillNav, { type PillNavItem } from '@/components/PillNav';
import { AppFooter, TermsGate } from '@/components/terms-gate';

type Tab = 'compose' | 'queue' | 'history' | 'settings';

export default function MailerPage() {
  const [tab, setTab] = useState<Tab>('compose');
  const [settings, setSettings] = useState<PublicEmailSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [counts, setCounts] = useState<LogCounts | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const { darkMode } = useTheme();

  useEffect(() => {
    api<PublicEmailSettings>('/api/settings').then(setSettings, (err) => setLoadError((err as Error).message));
  }, []);

  useEffect(() => {
    const syncHash = () => {
      const hash = window.location.hash.slice(1) as Tab;
      if (hash === 'compose' || hash === 'queue' || hash === 'history' || hash === 'settings') {
        setTab(hash);
      }
    };
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  // Keeps the Queue badge live on every tab (the Queue/History tabs also report counts as they poll).
  useEffect(() => {
    const load = () => api<{ counts: LogCounts }>('/api/logs?limit=1').then((d) => setCounts(d.counts), () => {});
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const waiting = counts ? counts.queued + counts.sending : 0;
  const tabOrder: Tab[] = ['compose', 'queue', 'history', 'settings'];
  const navItems: PillNavItem[] = [
    { label: 'Compose', href: '#compose', icon: <PenLine /> },
    {
      label: waiting ? (
        <span className="inline-flex items-center gap-1.5">
          Queue
          <span className="rounded-full bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-amber-950">
            {waiting}
          </span>
        </span>
      ) : (
        'Queue'
      ),
      href: '#queue',
      icon: <Clock />,
      ariaLabel: waiting ? `Queue (${waiting})` : 'Queue',
    },
    {
      label: counts?.failed ? (
        <span className="inline-flex items-center gap-1.5">
          History
          <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
            {counts.failed}
          </span>
        </span>
      ) : (
        'History'
      ),
      href: '#history',
      icon: <History />,
      ariaLabel: counts?.failed ? `History (${counts.failed} failed)` : 'History',
    },
    { label: 'Settings', href: '#settings', icon: <Settings /> },
  ];

  return (
    <TermsGate>
      <GhostFibersBackground />
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-6">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 text-amber-950 shadow-sm shadow-amber-500/25 dark:border dark:border-amber-400/70 dark:from-slate-900 dark:via-slate-900 dark:to-amber-950/70 dark:text-amber-300">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight text-slate-900 dark:text-white">Mailer</h1>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {settings?.configured ? <>Sending as <strong>{settings.fromEmail}</strong></> : 'Mail merge and dispatch, from your own computer'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <PillNav
              logo={<Mail className="text-amber-600 dark:text-amber-400" />}
              logoAlt="Mailer"
              logoHref="#compose"
              items={navItems}
              activeHref={`#${tab}`}
              onItemClick={(_item, index, event) => {
                event.preventDefault();
                const next = tabOrder[index];
                if (next) setTab(next);
              }}
              theme={darkMode ? 'dark' : 'light'}
              itemStyle="pill"
              hoverEffect="fill"
              indicator="dot"
              highlightColor="linear-gradient(135deg, #fde047 0%, #f59e0b 52%, #d97706 100%)"
              highlightTextColor="#1c1917"
              ariaLabel="Sections"
            />
            <ThemeToggle />
          </div>
        </header>

        {loadError ? (
          <p className="card text-sm text-rose-700 dark:text-rose-300">Could not load the app: {loadError}</p>
        ) : !settings ? (
          <div className="flex justify-center py-24 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <>
            {/* Compose stays mounted so a half-written message survives a visit to another tab. */}
            <div className={tab === 'compose' ? '' : 'hidden'}>
              <ComposeTab settings={settings} onToast={setToast} onQueued={() => setTab('queue')} onOpenSettings={() => setTab('settings')} />
            </div>
            {tab === 'queue' && <LogList key="queue" mode="queue" onToast={setToast} onCounts={setCounts} />}
            {tab === 'history' && <LogList key="history" mode="history" onToast={setToast} onCounts={setCounts} />}
            {tab === 'settings' && <SettingsTab initial={settings} onSaved={setSettings} onToast={setToast} />}
          </>
        )}

        <ToastView toast={toast} onClose={closeToast} />
      </div>
      <AppFooter />
    </TermsGate>
  );
}
