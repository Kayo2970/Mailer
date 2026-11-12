'use client';

import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, PlugZap, Save, XCircle } from 'lucide-react';
import { api, type PublicEmailSettings } from '@/lib/client';
import type { EmailProvider } from '@/lib/email-service';
import { EmailPreview, type Toast } from './ui';

type Form = Omit<PublicEmailSettings, 'authPass' | 'dkimPrivateKey'> & { authPass: string; dkimPrivateKey: string };

const PROVIDERS: Array<{ id: EmailProvider; name: string; blurb: string }> = [
  { id: 'gmail', name: 'Gmail', blurb: 'Gmail or Google Workspace, with an app password' },
  { id: 'outlook', name: 'Outlook / Microsoft 365', blurb: 'smtp.office365.com' },
  { id: 'custom', name: 'Other SMTP', blurb: 'Any provider: Zoho, SES, Mailgun, your host…' },
  { id: 'local_relay', name: 'Local relay', blurb: 'A mail server on this machine or network, no sign-in' },
  { id: 'direct_send', name: 'Direct send', blurb: 'No account — deliver straight to recipients (advanced)' },
];

const PROVIDER_HELP: Record<EmailProvider, React.ReactNode> = {
  gmail: <>Gmail won&apos;t accept your normal password here. Turn on 2-Step Verification, then create an <strong>App Password</strong> (Google Account → Security → App passwords) and paste that 16-character code below.</>,
  outlook: <>The mailbox needs <strong>Authenticated SMTP</strong> enabled (Microsoft 365 admin center → Users → the mailbox → Mail → Manage email apps). With multi-factor sign-in on, use an app password instead of your normal one.</>,
  custom: <>Use the SMTP host, port and sign-in your provider gives you. Port 587 uses STARTTLS; port 465 uses SSL/TLS from the start.</>,
  local_relay: <>Hands mail to an SMTP server that accepts it without a sign-in — for example Postfix on this machine (<code>localhost</code>, port 25).</>,
  direct_send: <>Mailer looks up each recipient&apos;s mail server and delivers to it itself. This only works from a machine with a static public IP, outbound port 25 open, and SPF, DKIM and reverse-DNS (PTR) records for your domain — <strong>not from a home or office connection</strong>, where it will time out or land in spam. If in doubt, use an SMTP account.</>,
};

export function SettingsTab({ initial, onSaved, onToast }: { initial: PublicEmailSettings; onSaved: (s: PublicEmailSettings) => void; onToast: (t: Toast) => void }) {
  const [form, setForm] = useState<Form>(initial);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testRecipient, setTestRecipient] = useState(initial.fromEmail);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showDkim, setShowDkim] = useState(Boolean(initial.dkimDomain));

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setTemplate = <K extends keyof Form['template']>(key: K, value: Form['template'][K]) => setForm((f) => ({ ...f, template: { ...f.template, [key]: value } }));

  const needsAccount = form.provider === 'gmail' || form.provider === 'outlook' || form.provider === 'custom';
  const needsHost = form.provider === 'custom' || form.provider === 'local_relay';

  const selectProvider = (provider: EmailProvider) => {
    setTestResult(null);
    setForm((f) => ({
      ...f,
      provider,
      smtpPort: provider === 'local_relay' ? 25 : f.provider === 'local_relay' ? 587 : f.smtpPort,
      smtpHost: provider === 'local_relay' ? 'localhost' : provider === 'custom' && ['smtp.gmail.com', 'localhost'].includes(f.smtpHost) ? '' : f.smtpHost,
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await api<PublicEmailSettings>('/api/settings', { settings: form });
      setForm(saved); // clears the typed password; the server keeps it
      onSaved(saved);
      onToast({ type: 'success', text: 'Settings saved.' });
    } catch (err) {
      onToast({ type: 'error', text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await api<{ success: boolean; message: string }>('/api/test', { testRecipient, settings: form }));
    } catch (err) {
      setTestResult({ success: false, message: (err as Error).message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        <section className="card space-y-4">
          <div>
            <h2 className="text-sm font-bold">Mail account</h2>
            <p className="hint !mt-0.5">How Mailer hands your messages to the internet. Everything here is stored only on this computer.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => selectProvider(p.id)}
                aria-pressed={form.provider === p.id}
                className={`cursor-pointer rounded-xl border p-3 text-left transition ${form.provider === p.id ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-500/20 dark:bg-sky-950' : 'border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800'}`}
              >
                <div className="text-sm font-semibold">{p.name}</div>
                <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{p.blurb}</div>
              </button>
            ))}
          </div>
          <p className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 dark:bg-slate-800 dark:text-slate-300">{PROVIDER_HELP[form.provider]}</p>

          {needsHost && (
            <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
              <div>
                <label className="label" htmlFor="smtpHost">SMTP host</label>
                <input id="smtpHost" className="input" value={form.smtpHost} onChange={(e) => set('smtpHost', e.target.value)} placeholder="smtp.example.com" />
              </div>
              <div>
                <label className="label" htmlFor="smtpPort">Port</label>
                <input id="smtpPort" className="input" type="number" min={1} max={65535} value={form.smtpPort} onChange={(e) => set('smtpPort', Number(e.target.value))} />
              </div>
            </div>
          )}
          {form.provider === 'custom' && form.smtpPort !== 465 && form.smtpPort !== 587 && (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={form.secure} onChange={(e) => set('secure', e.target.checked)} />
              Connect with SSL/TLS from the start (otherwise STARTTLS is used when the server offers it)
            </label>
          )}

          {needsAccount && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="authUser">Username</label>
                <input id="authUser" className="input" autoComplete="off" value={form.authUser} onChange={(e) => set('authUser', e.target.value)} placeholder="you@example.com" />
              </div>
              <div>
                <label className="label" htmlFor="authPass">{form.provider === 'gmail' ? 'App password' : 'Password'}</label>
                <input id="authPass" className="input" type="password" autoComplete="new-password" value={form.authPass} onChange={(e) => set('authPass', e.target.value)} placeholder={form.hasPassword ? '•••••••• (saved — leave empty to keep)' : ''} />
              </div>
            </div>
          )}

          {form.provider === 'direct_send' && (
            <div>
              <label className="label" htmlFor="helo">HELO hostname</label>
              <input id="helo" className="input" value={form.heloHostname} onChange={(e) => set('heloHostname', e.target.value)} placeholder="mail.example.com" />
              <p className="hint">Must match the reverse-DNS (PTR) record of this machine&apos;s public IP address.</p>
            </div>
          )}
        </section>

        <section className="card space-y-4">
          <h2 className="text-sm font-bold">Sender</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="fromName">From name</label>
              <input id="fromName" className="input" value={form.fromName} onChange={(e) => set('fromName', e.target.value)} placeholder="Jane from Acme" />
            </div>
            <div>
              <label className="label" htmlFor="fromEmail">From address</label>
              <input id="fromEmail" className="input" type="email" value={form.fromEmail} onChange={(e) => set('fromEmail', e.target.value)} placeholder="you@example.com" />
            </div>
          </div>
          {needsAccount && form.fromEmail && form.authUser.includes('@') && form.fromEmail.trim().toLowerCase() !== form.authUser.trim().toLowerCase() && (
            <p className="text-xs text-amber-700 dark:text-amber-300">The From address differs from the account you sign in with. Most providers only allow that for an alias set up on the account — otherwise they rewrite or reject the message.</p>
          )}
          <div>
            <label className="label" htmlFor="replyTo">Reply-To <span className="font-normal text-slate-400">(optional)</span></label>
            <input id="replyTo" className="input" type="email" value={form.replyTo} onChange={(e) => set('replyTo', e.target.value)} placeholder="Replies go to the From address unless set" />
          </div>
        </section>

        <section className="card space-y-4">
          <h2 className="text-sm font-bold">Sending</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="delay">Wait before sending (minutes)</label>
              <input id="delay" className="input" type="number" min={0} max={1440} value={form.sendDelayMinutes} onChange={(e) => set('sendDelayMinutes', Number(e.target.value))} />
              <p className="hint">A window to cancel a mistake from the Queue. 0 sends straight away.</p>
            </div>
            <div>
              <label className="label" htmlFor="throttle">Pause between messages (seconds)</label>
              <input id="throttle" className="input" type="number" min={0} max={600} step={0.5} value={form.throttleSeconds} onChange={(e) => set('throttleSeconds', Number(e.target.value))} />
              <p className="hint">Keeps a large batch under your provider&apos;s sending limits.</p>
            </div>
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
            <input type="checkbox" className="mt-0.5" checked={form.unsubscribeFooter} onChange={(e) => set('unsubscribeFooter', e.target.checked)} />
            <span>Add an “Unsubscribe” line to batches with more than one recipient. It opens a pre-addressed e-mail to your Reply-To / From address, and helps bulk mail stay out of spam.</span>
          </label>

          <div className="border-t border-slate-200 pt-3 dark:border-white/10">
            <button onClick={() => setShowDkim((v) => !v)} className="flex cursor-pointer items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300" aria-expanded={showDkim}>
              DKIM signing (advanced) {showDkim ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {showDkim && (
              <div className="mt-3 space-y-3">
                <p className="hint !mt-0">Optional. Signs each message with your domain&apos;s key. Needs the matching public key published as a DNS TXT record at <code>&lt;selector&gt;._domainkey.&lt;domain&gt;</code>. Gmail, Outlook and most providers already sign for you — leave this empty unless you use direct send or your own relay.</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="dkimDomain">Domain</label>
                    <input id="dkimDomain" className="input" value={form.dkimDomain} onChange={(e) => set('dkimDomain', e.target.value)} placeholder="example.com" />
                  </div>
                  <div>
                    <label className="label" htmlFor="dkimSelector">Selector</label>
                    <input id="dkimSelector" className="input" value={form.dkimSelector} onChange={(e) => set('dkimSelector', e.target.value)} placeholder="default" />
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="dkimKey">Private key (PEM)</label>
                  <textarea id="dkimKey" className="input min-h-[90px] font-mono text-xs" value={form.dkimPrivateKey} onChange={(e) => set('dkimPrivateKey', e.target.value)} placeholder={form.hasDkimKey ? 'A key is saved — leave empty to keep it' : '-----BEGIN PRIVATE KEY-----'} spellCheck={false} />
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="card space-y-3">
          <h2 className="text-sm font-bold">Test the connection</h2>
          <p className="hint !mt-0">Signs in and sends one test message using what is in the form right now — you don&apos;t need to save first.</p>
          <div className="flex flex-wrap gap-2">
            <input className="input min-w-[12rem] flex-1" type="email" value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)} placeholder="Send the test to…" aria-label="Test recipient" />
            <button className="btn" onClick={test} disabled={testing || !testRecipient.trim()}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}Send test
            </button>
          </div>
          {testResult && (
            <div className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${testResult.success ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-950 dark:text-emerald-100' : 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/40 dark:bg-rose-950 dark:text-rose-100'}`}>
              {testResult.success ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
              <span className="whitespace-pre-wrap break-words">{testResult.message}</span>
            </div>
          )}
        </section>

        <div className="sticky bottom-4 flex justify-end">
          <button className="btn-primary shadow-lg" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save settings
          </button>
        </div>
      </div>

      <section className="card self-start space-y-4 lg:sticky lg:top-5">
        <div>
          <h2 className="text-sm font-bold">Email look</h2>
          <p className="hint !mt-0.5">Applied to every message you send. Messages already in the queue keep the look they were queued with.</p>
        </div>
        <div className="flex gap-2">
          {(['branded', 'plain'] as const).map((style) => (
            <button key={style} onClick={() => setTemplate('style', style)} aria-pressed={form.template.style === style} className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-sm font-semibold transition ${form.template.style === style ? 'border-sky-500 bg-sky-50 dark:bg-sky-950' : 'border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800'}`}>
              {style === 'branded' ? 'Branded card' : 'Plain message'}
            </button>
          ))}
        </div>
        {form.template.style === 'branded' && (
          <>
            <div className="grid gap-4 sm:grid-cols-[1fr_6rem]">
              <div>
                <label className="label" htmlFor="brandName">Banner name</label>
                <input id="brandName" className="input" value={form.template.brandName} onChange={(e) => setTemplate('brandName', e.target.value)} placeholder={form.fromName || 'Your organisation'} />
              </div>
              <div>
                <label className="label" htmlFor="accent">Accent</label>
                <input id="accent" type="color" className="input !h-[38px] !p-1" value={form.template.accentColor} onChange={(e) => setTemplate('accentColor', e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="tagline">Banner tagline <span className="font-normal text-slate-400">(optional)</span></label>
              <input id="tagline" className="input" value={form.template.tagline} onChange={(e) => setTemplate('tagline', e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="footer">Footer <span className="font-normal text-slate-400">(optional)</span></label>
              <textarea id="footer" className="input min-h-[60px]" value={form.template.footerText} onChange={(e) => setTemplate('footerText', e.target.value)} placeholder="Your organisation · address · why they are receiving this" />
            </div>
          </>
        )}
        <EmailPreview
          subject="Sample subject"
          body={'Dear Ananya,\n\nThis is how your messages will look. Links like https://example.com become clickable.\n\nKind regards,\n' + (form.fromName || 'You')}
          settings={{ template: form.template, fromName: form.fromName }}
          className="h-[380px]"
        />
      </section>
    </div>
  );
}
