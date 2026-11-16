'use client';

import React, { useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, PlugZap, Plus, RotateCcw, Save, Trash2, XCircle } from 'lucide-react';
import {
  api,
  DEFAULT_SOCIAL_PLATFORM_LABELS,
  SOCIAL_PLATFORMS,
  SocialIcon,
  type PublicEmailSettings,
  type SocialLink,
} from '@/lib/client';
import type { EmailProvider } from '@/lib/email-service';
import { ActionButton, EmailPreview, type Toast } from './ui';
import { ImageField } from './image-library';

function ColorPickerField({
  id,
  label,
  value,
  onChange,
  presets,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (val: string) => void;
  presets?: string[];
}) {
  const [localInput, setLocalInput] = useState<string | null>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);

  const displayValue = localInput !== null ? localInput : value;

  const handleTextChange = (text: string) => {
    setLocalInput(text);
    const cleaned = text.trim();
    if (/^#([0-9a-fA-F]{3}){1,2}$/.test(cleaned)) {
      const normalized = cleaned.length === 4
        ? `#${cleaned[1]}${cleaned[1]}${cleaned[2]}${cleaned[2]}${cleaned[3]}${cleaned[3]}`.toUpperCase()
        : cleaned.toUpperCase();
      onChange(normalized);
    }
  };

  const handleBlur = () => {
    setLocalInput(null);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="label !mb-0 text-xs">{label}</label>
        <span className="font-mono text-[10px] text-slate-400">{value}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => colorInputRef.current?.click()}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-slate-300 shadow-xs transition hover:scale-105 hover:border-amber-500 focus-visible:outline-2 focus-visible:outline-amber-500 dark:border-white/20"
            style={{ backgroundColor: value || '#ffffff' }}
            title={`Pick ${label} colour`}
            aria-label={`Pick ${label} colour`}
          >
            <span className="sr-only">Choose colour</span>
          </button>
          <input
            ref={colorInputRef}
            id={id}
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#0f172a'}
            onChange={(e) => {
              setLocalInput(null);
              onChange(e.target.value.toUpperCase());
            }}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />
        </div>
        <input
          type="text"
          value={displayValue}
          onChange={(e) => handleTextChange(e.target.value)}
          onBlur={handleBlur}
          placeholder="#000000"
          maxLength={7}
          className="input !h-8 !py-1 !px-2 font-mono text-xs uppercase"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>
      {presets && presets.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setLocalInput(null);
                onChange(preset);
              }}
              className={`h-4 w-4 rounded-sm border transition hover:scale-110 ${
                value.toLowerCase() === preset.toLowerCase()
                  ? 'ring-2 ring-amber-500 ring-offset-1 border-white dark:ring-offset-slate-900'
                  : 'border-slate-300 dark:border-white/20'
              }`}
              style={{ backgroundColor: preset }}
              title={preset}
              aria-label={`Set ${label} to ${preset}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

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

const GROUP = 'border-t border-slate-200 pt-4 text-xs font-bold uppercase tracking-wide text-slate-500 dark:border-white/10 dark:text-slate-400';

export function SettingsTab({ initial, onSaved, onToast }: { initial: PublicEmailSettings; onSaved: (s: PublicEmailSettings) => void; onToast: (t: Toast) => void }) {
  const [form, setForm] = useState<Form>(initial);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testRecipient, setTestRecipient] = useState(initial.fromEmail);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showDkim, setShowDkim] = useState(Boolean(initial.dkimDomain));

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setTemplate = <K extends keyof Form['template']>(key: K, value: Form['template'][K]) => setForm((f) => ({ ...f, template: { ...f.template, [key]: value } }));

  const socialLinks = form.template.socialLinks || [];

  const updateSocialLink = (index: number, patch: Partial<SocialLink>) => {
    const next = [...socialLinks];
    next[index] = { ...next[index], ...patch };
    setTemplate('socialLinks', next);
  };

  const removeSocialLink = (index: number) => {
    setTemplate('socialLinks', socialLinks.filter((_, i) => i !== index));
  };

  const addSocialLink = (platform: string, label?: string) => {
    const newLink: SocialLink = {
      platform,
      url: '',
      label: label || DEFAULT_SOCIAL_PLATFORM_LABELS[platform.toLowerCase()] || 'Link',
    };
    setTemplate('socialLinks', [...socialLinks, newLink]);
  };

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
                className={`cursor-pointer rounded-xl border p-3 text-left transition ${form.provider === p.id ? 'border-amber-500 bg-gradient-to-br from-amber-50 via-yellow-50/70 to-amber-100/70 ring-2 ring-amber-500/25 dark:from-amber-950/70 dark:via-slate-900 dark:to-yellow-950/40' : 'border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800'}`}
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
            <ActionButton onClick={test} disabled={testing || !testRecipient.trim()}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}Send test
            </ActionButton>
          </div>
          {testResult && (
            <div className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${testResult.success ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-950 dark:text-emerald-100' : 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/40 dark:bg-rose-950 dark:text-rose-100'}`}>
              {testResult.success ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
              <span className="whitespace-pre-wrap break-words">{testResult.message}</span>
            </div>
          )}
        </section>

        <div className="sticky bottom-4 flex justify-end">
          <ActionButton variant="primary" size="md" className="shadow-lg" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save settings
          </ActionButton>
        </div>
      </div>

      <section className="card self-start space-y-4">
        <div>
          <h2 className="text-sm font-bold">Email look</h2>
          <p className="hint !mt-0.5">Applied to every message you send. Messages already in the queue keep the look they were queued with.</p>
        </div>
        <div className="flex gap-2">
          {(['branded', 'plain'] as const).map((style) => (
            <button key={style} onClick={() => setTemplate('style', style)} aria-pressed={form.template.style === style} className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-sm font-semibold transition ${form.template.style === style ? 'border-amber-500 bg-gradient-to-br from-amber-50 via-yellow-50/70 to-amber-100/70 dark:from-amber-950/70 dark:via-slate-900 dark:to-yellow-950/40' : 'border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800'}`}>
              {style === 'branded' ? 'Letterhead' : 'Plain message'}
            </button>
          ))}
        </div>
        <EmailPreview
          subject="Sample subject"
          body={'Dear Ananya,\n\nThis is how your messages will look. Links like https://example.com become clickable.\n\nKind regards,\n' + (form.fromName || 'You')}
          settings={{ template: form.template, fromName: form.fromName }}
          className="h-[380px]"
        />
        {form.template.style === 'branded' && (
          <>
            <h3 className={GROUP}>Header</h3>
            <ImageField label="Logo" value={form.template.logoImageId} onChange={(id) => setTemplate('logoImageId', id)} hint="Shown in the header band. A PNG with a transparent background works best." />
            {form.template.logoImageId && (
              <div>
                <label className="label" htmlFor="logoWidth">Logo width — {form.template.logoWidth}px</label>
                <input id="logoWidth" type="range" min={24} max={Math.min(600, form.template.contentWidth - 64)} step={4} className="w-full" value={form.template.logoWidth} onChange={(e) => setTemplate('logoWidth', Number(e.target.value))} />
              </div>
            )}
            <ImageField label="Banner image" value={form.template.bannerImageId} onChange={(id) => setTemplate('bannerImageId', id)} hint={`A full-width strip across the top — e.g. your printed letterhead's header, ${form.template.contentWidth * 2}px wide for sharp results.`} />
            <div>
              <label className="label" htmlFor="brandName">Name</label>
              <input id="brandName" className="input" value={form.template.brandName} onChange={(e) => setTemplate('brandName', e.target.value)} placeholder={form.fromName || 'Your organisation'} />
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={form.template.showBrandName} onChange={(e) => setTemplate('showBrandName', e.target.checked)} />
                Show the name as text in the header (turn off if your logo already says it)
              </label>
            </div>
            <div>
              <label className="label" htmlFor="tagline">Tagline <span className="font-normal text-slate-400">(optional)</span></label>
              <input id="tagline" className="input" value={form.template.tagline} onChange={(e) => setTemplate('tagline', e.target.value)} />
            </div>
            <div>
              <span className="label">Alignment</span>
              <div className="flex gap-2">
                {(['left', 'center', 'right'] as const).map((align) => (
                  <button key={align} onClick={() => setTemplate('headerAlign', align)} aria-pressed={form.template.headerAlign === align} className={`flex-1 cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize transition ${form.template.headerAlign === align ? 'border-amber-500 bg-gradient-to-br from-amber-50 via-yellow-50/70 to-amber-100/70 dark:from-amber-950/70 dark:via-slate-900 dark:to-yellow-950/40' : 'border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800'}`}>
                    {align === 'center' ? 'Centre' : align}
                  </button>
                ))}
              </div>
            </div>

            <h3 className={GROUP}>Colours</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ColorPickerField
                id="headerBackground"
                label="Header"
                value={form.template.headerBackground}
                onChange={(v) => setTemplate('headerBackground', v)}
                presets={['#0F172A', '#1E293B', '#1E1B4B', '#064E3B', '#78350F', '#18181B']}
              />
              <ColorPickerField
                id="headerTextColor"
                label="Header text"
                value={form.template.headerTextColor}
                onChange={(v) => setTemplate('headerTextColor', v)}
                presets={['#FFFFFF', '#F8FAFC', '#E2E8F0', '#CBD5E1', '#FDE68A', '#A7F3D0']}
              />
              <ColorPickerField
                id="accentColor"
                label="Accent"
                value={form.template.accentColor}
                onChange={(v) => setTemplate('accentColor', v)}
                presets={['#D97706', '#2563EB', '#059669', '#7C3AED', '#DC2626', '#EA580C']}
              />
              <ColorPickerField
                id="pageBackground"
                label="Page"
                value={form.template.pageBackground}
                onChange={(v) => setTemplate('pageBackground', v)}
                presets={['#F1F5F9', '#F8FAFC', '#FFFFFF', '#F3F4F6', '#E2E8F0', '#0F172A']}
              />
            </div>

            <h3 className={GROUP}>Footer</h3>
            <div>
              <span className="label">Footer style</span>
              <div className="flex gap-2">
                {([
                  { id: 'simple', label: 'Light' },
                  { id: 'match_header', label: 'Match header' },
                ] as const).map(({ id, label }) => {
                  const active = (form.template.footerStyle || 'simple') === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setForm((f) => ({
                          ...f,
                          template: {
                            ...f.template,
                            footerStyle: id,
                            footerBackground: id === 'match_header' ? f.template.headerBackground : '#F8FAFC',
                            footerTextColor: id === 'match_header' ? f.template.headerTextColor : '#64748B',
                          },
                        }));
                      }}
                      aria-pressed={active}
                      className={`flex-1 cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? 'border-amber-500 bg-gradient-to-br from-amber-50 via-yellow-50/70 to-amber-100/70 dark:from-amber-950/70 dark:via-slate-900 dark:to-yellow-950/40'
                          : 'border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-slate-800'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="hint">
                {(form.template.footerStyle || 'simple') === 'match_header'
                  ? 'Footer band adopts the header’s background colour, text colour, accent border, and alignment.'
                  : 'Subtle light grey bar with muted text.'}
              </p>
            </div>

            {/* Dedicated Color Pickers for Footer Background & Text */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ColorPickerField
                id="footerBackground"
                label="Footer background"
                value={form.template.footerBackground || ((form.template.footerStyle || 'simple') === 'match_header' ? form.template.headerBackground : '#F8FAFC')}
                onChange={(v) => setTemplate('footerBackground', v)}
                presets={[
                  form.template.headerBackground,
                  '#F8FAFC',
                  '#FFFFFF',
                  '#0F172A',
                  '#1E293B',
                  form.template.accentColor,
                ]}
              />
              <ColorPickerField
                id="footerTextColor"
                label="Footer text"
                value={form.template.footerTextColor || ((form.template.footerStyle || 'simple') === 'match_header' ? form.template.headerTextColor : '#64748B')}
                onChange={(v) => setTemplate('footerTextColor', v)}
                presets={[
                  form.template.headerTextColor,
                  '#FFFFFF',
                  '#64748B',
                  '#475569',
                  '#E2E8F0',
                  form.template.accentColor,
                ]}
              />
            </div>

            <ImageField label="Footer image" value={form.template.footerImageId} onChange={(id) => setTemplate('footerImageId', id)} hint="A full-width strip under the message — a signature block or your letterhead's footer." />
            <div>
              <label className="label" htmlFor="footer">Footer text <span className="font-normal text-slate-400">(optional)</span></label>
              <textarea id="footer" className="input min-h-[60px]" value={form.template.footerText} onChange={(e) => setTemplate('footerText', e.target.value)} placeholder="Your organisation · address · why they are receiving this" />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="label !mb-0">Social media & links</span>
                  <p className="hint !mt-0">Added to the email footer with official logos and icons.</p>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">
                  {socialLinks.length} {socialLinks.length === 1 ? 'link' : 'links'}
                </span>
              </div>

              {/* Social link buttons color customization */}
              {socialLinks.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-slate-800/50 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Button colours</span>
                    {(form.template.socialButtonBg || form.template.socialButtonText) && (
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, template: { ...f.template, socialButtonBg: '', socialButtonText: '' } }))}
                        className="inline-flex items-center gap-1 text-[11px] text-amber-600 hover:underline dark:text-amber-400 cursor-pointer"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>Reset to theme</span>
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <ColorPickerField
                      id="socialButtonBg"
                      label="Button background"
                      value={form.template.socialButtonBg || (form.template.footerStyle === 'match_header' ? '#1E293B' : '#FFFFFF')}
                      onChange={(v) => setTemplate('socialButtonBg', v)}
                      presets={['#FFFFFF', '#1E293B', '#0F172A', form.template.accentColor, '#F1F5F9', '#2563EB']}
                    />
                    <ColorPickerField
                      id="socialButtonText"
                      label="Button text & icon"
                      value={form.template.socialButtonText || (form.template.footerStyle === 'match_header' ? form.template.headerTextColor : '#475569')}
                      onChange={(v) => setTemplate('socialButtonText', v)}
                      presets={['#FFFFFF', '#475569', '#0F172A', form.template.accentColor, '#2563EB', '#D97706']}
                    />
                  </div>
                </div>
              )}

              {/* Existing links */}
              {socialLinks.length > 0 && (
                <div className="space-y-2">
                  {socialLinks.map((link, idx) => (
                    <div key={idx} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-2.5 shadow-xs dark:border-white/10 dark:bg-slate-800/80 sm:flex-row sm:items-center">
                      <div className="flex items-center gap-2 w-full sm:w-44">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200" title={link.platform}>
                          <SocialIcon platform={link.platform} className="h-4 w-4" />
                        </div>
                        <label htmlFor={`social-platform-${idx}`} className="sr-only">Platform</label>
                        <select
                          id={`social-platform-${idx}`}
                          className="input !h-[34px] !py-1 text-xs flex-1 capitalize"
                          value={link.platform}
                          onChange={(e) => {
                            const newPlatform = e.target.value;
                            const defaultLabel = DEFAULT_SOCIAL_PLATFORM_LABELS[newPlatform] || 'Link';
                            updateSocialLink(idx, {
                              platform: newPlatform,
                              label: link.label && link.label !== DEFAULT_SOCIAL_PLATFORM_LABELS[link.platform] ? link.label : defaultLabel,
                            });
                          }}
                        >
                          {SOCIAL_PLATFORMS.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex-1">
                        <label htmlFor={`social-url-${idx}`} className="sr-only">URL</label>
                        <input
                          id={`social-url-${idx}`}
                          type="url"
                          className="input !h-[34px] !py-1 text-xs"
                          value={link.url}
                          onChange={(e) => updateSocialLink(idx, { url: e.target.value })}
                          placeholder={SOCIAL_PLATFORMS.find((p) => p.id === link.platform)?.placeholder || 'https://example.com'}
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                        />
                      </div>

                      <div className="w-full sm:w-28">
                        <label htmlFor={`social-label-${idx}`} className="sr-only">Label</label>
                        <input
                          id={`social-label-${idx}`}
                          type="text"
                          className="input !h-[34px] !py-1 text-xs"
                          value={link.label || ''}
                          onChange={(e) => updateSocialLink(idx, { label: e.target.value })}
                          placeholder="Label"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => removeSocialLink(idx)}
                        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 dark:border-white/10 dark:hover:border-rose-500/40 dark:hover:bg-rose-950 dark:hover:text-rose-300"
                        title="Remove link"
                        aria-label={`Remove ${link.label || link.platform} link`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Quick Add Shortcuts */}
              <div className="pt-1">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Quick add platform:</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {SOCIAL_PLATFORMS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addSocialLink(p.id, p.defaultLabel)}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-xs hover:border-amber-400 hover:bg-amber-50/50 hover:text-slate-900 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-amber-500/50 dark:hover:bg-amber-950/30 dark:hover:text-white"
                    >
                      <SocialIcon platform={p.id} className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                      <span>{p.defaultLabel}</span>
                      <Plus className="h-3 w-3 text-amber-500" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        <h3 className={GROUP}>Text</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="fontFamily">Font</label>
            <select id="fontFamily" className="input" value={form.template.fontFamily} onChange={(e) => setTemplate('fontFamily', e.target.value as Form['template']['fontFamily'])}>
              <option value="sans">Sans-serif</option>
              <option value="serif">Serif</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="fontSize">Size (px)</label>
            <input id="fontSize" className="input" type="number" min={12} max={20} value={form.template.fontSize} onChange={(e) => setTemplate('fontSize', Number(e.target.value))} />
          </div>
          {form.template.style === 'branded' && (
            <div>
              <label className="label" htmlFor="contentWidth">Width (px)</label>
              <input id="contentWidth" className="input" type="number" min={420} max={800} step={10} value={form.template.contentWidth} onChange={(e) => setTemplate('contentWidth', Number(e.target.value))} />
            </div>
          )}
        </div>
        <p className="hint">Images are embedded in each e-mail, so they keep displaying after you close this app. Remember to press <strong>Save settings</strong>.</p>
      </section>
    </div>
  );
}
