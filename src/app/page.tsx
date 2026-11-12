'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Clock, History, Loader2, Mail, PenLine, Settings } from 'lucide-react';
import { api, type LogCounts, type PublicEmailSettings } from '@/lib/client';
import { ComposeTab } from '@/components/compose-tab';
import { LogList } from '@/components/log-list';
import { SettingsTab } from '@/components/settings-tab';
import { ToastView, type Toast } from '@/components/ui';
import { ShardsHero } from '@/components/shards-hero';

type Tab = 'compose' | 'queue' | 'history' | 'settings';

export default function MailerPage() {
  const [tab, setTab] = useState<Tab>('compose');
  const [settings, setSettings] = useState<PublicEmailSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [counts, setCounts] = useState<LogCounts | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const closeToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    api<PublicEmailSettings>('/api/settings').then(setSettings, (err) => setLoadError((err as Error).message));
  }, []);

  // Keeps the Queue badge live on every tab (the Queue/History tabs also report counts as they poll).
  useEffect(() => {
    const load = () => api<{ counts: LogCounts }>('/api/logs?limit=1').then((d) => setCounts(d.counts), () => {});
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const waiting = counts ? counts.queued + counts.sending : 0;
  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; badge?: number; alert?: boolean }> = [
    { id: 'compose', label: 'Compose', icon: <PenLine className="h-4 w-4" /> },
    { id: 'queue', label: 'Queue', icon: <Clock className="h-4 w-4" />, badge: waiting },
    { id: 'history', label: 'History', icon: <History className="h-4 w-4" />, badge: counts?.failed, alert: true },
    { id: 'settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <ShardsHero>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white"><Mail className="h-5 w-5" /></div>
          <div>
            <h1 className="text-lg font-bold leading-tight text-white">Mailer</h1>
            <p className="text-xs text-slate-300">
              {settings?.configured ? <>Sending as <strong>{settings.fromEmail}</strong></> : 'Mail merge and dispatch, from your own computer'}
            </p>
          </div>
        </div>
        <nav className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-slate-900" aria-label="Sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${tab === t.id ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
            >
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
              {t.badge ? (
                <span className={`rounded-full px-1.5 text-[10px] font-bold leading-4 ${t.alert ? 'bg-rose-600 text-white' : tab === t.id ? 'bg-white text-sky-700' : 'bg-sky-600 text-white'}`}>{t.badge}</span>
              ) : null}
            </button>
          ))}
        </nav>
      </header>
      </ShardsHero>

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
  );
}
