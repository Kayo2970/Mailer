'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  FileCode2,
  FileText,
  FileUp,
  ImagePlus,
  Monitor,
  Paperclip,
  PenLine,
  Send,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import { api, formatDateTime, type PublicEmailSettings } from '@/lib/client';
import { applyMailMerge, findUnknownPlaceholders, parseRecipients } from '@/lib/mail-merge';
import { ComposedAttachment, MAX_TOTAL_ATTACHMENT_BYTES, buildAttachmentNoticeLine, filesToAttachments, formatBytes } from '@/lib/email-attachments';
import { imageHtmlSnippet, imageToken, stripImageTokens } from '@/lib/inline-images';
import { htmlToPlainText, normalizeRecipientEntry, plainTextToHtml } from '@/lib/compose-editor';
import { ActionButton, ConfirmModal, EmailPreview, type Toast } from './ui';
import { ImageLibraryModal } from './image-library';
import { RichEmailEditor, type RichEditorHandle } from './rich-editor';

const SAMPLE = 'name, email, company\nAnanya Sharma, ananya@example.com, Acme\nRahul Verma, rahul@example.com, Globex';
const DRAFT_KEY = 'mailer:compose-draft:v1';

type EditorMode = 'rich' | 'plain' | 'html';
type PreviewView = 'rendered' | 'text';
type PreviewDevice = 'desktop' | 'mobile';

interface SavedDraft {
  recipientsText: string;
  subject: string;
  body: string;
  mode: EditorMode;
  label: string;
  scheduleOn: boolean;
  sendAt: string;
}

export function ComposeTab({ settings, onToast, onQueued, onOpenSettings }: {
  settings: PublicEmailSettings | null;
  onToast: (t: Toast) => void;
  onQueued: () => void;
  onOpenSettings: () => void;
}) {
  const [recipientsText, setRecipientsText] = useState('');
  const [quickTo, setQuickTo] = useState('');
  const [showBulkTo, setShowBulkTo] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [mode, setMode] = useState<EditorMode>('rich');
  const [label, setLabel] = useState('');
  const [attachments, setAttachments] = useState<ComposedAttachment[]>([]);
  const [scheduleOn, setScheduleOn] = useState(false);
  const [sendAt, setSendAt] = useState('');
  const [showDelivery, setShowDelivery] = useState(false);

  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewView, setPreviewView] = useState<PreviewView>('rendered');
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop');

  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const [activeField, setActiveField] = useState<'subject' | 'body'>('body');
  const [draftHydrated, setDraftHydrated] = useState(false);

  const subjectRef = useRef<HTMLInputElement>(null);
  const plainBodyRef = useRef<HTMLTextAreaElement>(null);
  const richEditorRef = useRef<RichEditorHandle>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Restore draft from localStorage after mount so SSR and first client render match.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (raw) {
          const d = JSON.parse(raw) as Partial<SavedDraft>;
          if (typeof d.recipientsText === 'string') setRecipientsText(d.recipientsText);
          if (typeof d.subject === 'string') setSubject(d.subject);
          if (typeof d.body === 'string') setBody(d.body);
          if (d.mode === 'rich' || d.mode === 'plain' || d.mode === 'html') setMode(d.mode);
          if (typeof d.label === 'string') setLabel(d.label);
          if (typeof d.scheduleOn === 'boolean') setScheduleOn(d.scheduleOn);
          if (typeof d.sendAt === 'string') setSendAt(d.sendAt);
          if (d.label || d.scheduleOn) setShowDelivery(true);
        }
      } catch {
        // Ignore corrupt localStorage draft
      } finally {
        setDraftHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Persist draft locally whenever fields change.
  useEffect(() => {
    if (!draftHydrated) return;
    try {
      if (!recipientsText && !subject && !body && !label && !scheduleOn && !sendAt) {
        localStorage.removeItem(DRAFT_KEY);
      } else {
        const payload: SavedDraft = { recipientsText, subject, body, mode, label, scheduleOn, sendAt };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      }
    } catch {
      // Ignore storage quota errors
    }
  }, [draftHydrated, recipientsText, subject, body, mode, label, scheduleOn, sendAt]);

  const bodyIsHtml = mode !== 'plain';
  const parsed = useMemo(() => parseRecipients(recipientsText), [recipientsText]);
  const { recipients, columns, skipped } = parsed;
  const unknown = useMemo(
    () => Array.from(new Set([...findUnknownPlaceholders(subject, columns), ...findUnknownPlaceholders(body, columns)])),
    [subject, body, columns]
  );
  const attachmentBytes = attachments.reduce((sum, a) => sum + a.size, 0);

  const clampedPreviewIndex = Math.min(previewIndex, Math.max(recipients.length - 1, 0));
  const sample = recipients[clampedPreviewIndex];
  const previewFields = sample?.fields || {};
  const previewSubject = applyMailMerge(subject, previewFields);
  const previewBody = applyMailMerge(body, previewFields);

  const plainPreviewText = useMemo(
    () => (bodyIsHtml ? htmlToPlainText(previewBody, { preserveImageTokens: false }) : stripImageTokens(previewBody).trim()),
    [bodyIsHtml, previewBody]
  );

  const scheduleDate = scheduleOn && sendAt ? new Date(sendAt) : null;
  const scheduleInvalid = scheduleOn && (!scheduleDate || Number.isNaN(scheduleDate.getTime()));

  const hasDraft = Boolean(recipientsText.trim() || subject.trim() || body.trim() || attachments.length || label.trim() || scheduleOn);

  const problem =
    !settings?.configured ? 'Connect a mail account in Settings first.'
    : recipients.length === 0 ? 'Add at least one recipient.'
    : !subject.trim() ? 'Add a subject.'
    : !body.trim() ? 'Write a message.'
    : attachmentBytes > MAX_TOTAL_ATTACHMENT_BYTES ? `Attachments are over the ${formatBytes(MAX_TOTAL_ATTACHMENT_BYTES)} limit.`
    : scheduleInvalid ? 'Pick a date and time to send at.'
    : null;

  const insertIntoSubject = (text: string) => {
    const el = subjectRef.current;
    if (!el) { setSubject((s) => s + text); return; }
    const start = el.selectionStart ?? subject.length;
    const end = el.selectionEnd ?? subject.length;
    setSubject(subject.slice(0, start) + text + subject.slice(end));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + text.length, start + text.length); });
  };

  const insertIntoPlainBody = (text: string) => {
    const el = plainBodyRef.current;
    if (!el) { setBody((b) => b + text); return; }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + text + body.slice(end));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + text.length, start + text.length); });
  };

  const insertPlaceholder = (col: string) => {
    const token = `{{${col}}}`;
    if (activeField === 'subject') {
      insertIntoSubject(token);
    } else if (mode === 'rich') {
      richEditorRef.current?.insertText(token);
    } else {
      insertIntoPlainBody(token);
    }
  };

  const switchMode = (next: EditorMode) => {
    if (next === mode) return;
    if (next === 'plain' && mode !== 'plain') {
      setBody(htmlToPlainText(body, { preserveImageTokens: true }));
    } else if (next !== 'plain' && mode === 'plain') {
      setBody(plainTextToHtml(body));
    }
    setMode(next);
  };

  const appendRecipientLines = (raw: string) => {
    const normalized = normalizeRecipientEntry(raw).trim();
    if (!normalized) return;
    setRecipientsText((prev) => (prev.trim() ? `${prev.trimEnd()}\n${normalized}` : normalized));
    setPreviewIndex(0);
  };

  const commitQuickTo = () => {
    if (!quickTo.trim()) return;
    appendRecipientLines(quickTo);
    setQuickTo('');
  };

  const removeRecipient = (email: string) => {
    const target = email.trim().toLowerCase();
    const lines = recipientsText.split(/\r?\n/);
    const filtered = lines.filter((line) => !line.toLowerCase().includes(target));
    setRecipientsText(filtered.join('\n').trim());
    setPreviewIndex(0);
  };

  const onCsvPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setRecipientsText(await file.text());
      setShowBulkTo(true);
      setPreviewIndex(0);
    } catch {
      onToast({ type: 'error', text: `Could not read ${file.name}.` });
    }
  };

  const onFilesPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    const total = attachmentBytes + files.reduce((sum, f) => sum + f.size, 0);
    if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
      onToast({ type: 'error', text: `Attachments can total at most ${formatBytes(MAX_TOTAL_ATTACHMENT_BYTES)} — these would come to ${formatBytes(total)}.` });
      return;
    }
    try {
      const added = await filesToAttachments(files);
      setAttachments((prev) => [...prev, ...added]);
    } catch (err) {
      onToast({ type: 'error', text: (err as Error).message });
    }
  };

  const discardDraft = () => {
    setRecipientsText('');
    setQuickTo('');
    setSubject('');
    setBody('');
    setLabel('');
    setAttachments([]);
    setScheduleOn(false);
    setSendAt('');
    setPreviewIndex(0);
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    onToast({ type: 'success', text: 'Draft discarded.' });
  };

  const send = async () => {
    setSending(true);
    try {
      const res = await api<{ count: number; sendAfter: string }>('/api/send', {
        subject,
        body,
        bodyIsHtml,
        label: label.trim() || undefined,
        recipients,
        attachments: attachments.map(({ filename, contentBase64, contentType }) => ({ filename, contentBase64, contentType })),
        sendAt: scheduleDate ? scheduleDate.toISOString() : undefined,
      });
      const later = Boolean(scheduleDate) || (settings?.sendDelayMinutes ?? 0) > 0;
      onToast({
        type: 'success',
        text: `${res.count} message${res.count === 1 ? '' : 's'} queued — ${later ? `sending starts ${formatDateTime(res.sendAfter)}` : 'sending now'}. Keep the app running until the queue is empty.`,
      });
      setConfirming(false);
      setRecipientsText('');
      setQuickTo('');
      setSubject('');
      setBody('');
      setLabel('');
      setAttachments([]);
      setScheduleOn(false);
      setSendAt('');
      setPreviewIndex(0);
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      onQueued();
    } catch (err) {
      setConfirming(false);
      onToast({ type: 'error', text: (err as Error).message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      {/* ── Part 1: Gmail / Outlook-style Drafting Studio ── */}
      <div className="space-y-4">
        {settings && !settings.configured && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              No mail account is connected yet, so nothing can be sent.{' '}
              <button onClick={onOpenSettings} className="cursor-pointer font-semibold underline">Open Settings</button>
            </div>
          </div>
        )}

        <section className="card !p-0 overflow-hidden">
          {/* Compose window header */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/90 px-4 py-2.5 dark:border-white/10 dark:bg-slate-800/70">
            <div className="flex min-w-0 items-center gap-2">
              <PenLine className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <h2 className="truncate text-sm font-bold">{subject.trim() || 'New Message'}</h2>
              {hasDraft && (
                <span className="hidden rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-medium text-slate-600 sm:inline dark:bg-slate-700 dark:text-slate-300">
                  Draft saved
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs dark:border-white/10 dark:bg-slate-900" role="group" aria-label="Editor mode">
                {([
                  { id: 'rich', label: 'Rich', icon: <Sparkles className="h-3 w-3" /> },
                  { id: 'plain', label: 'Plain', icon: <FileText className="h-3 w-3" /> },
                  { id: 'html', label: 'HTML', icon: <FileCode2 className="h-3 w-3" /> },
                ] as const).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => switchMode(m.id)}
                    aria-pressed={mode === m.id}
                    className={`inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 font-semibold transition ${
                      mode === m.id
                        ? 'bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 text-amber-950 shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    {m.icon}
                    {m.label}
                  </button>
                ))}
              </div>
              {hasDraft && (
                <button
                  type="button"
                  title="Discard draft"
                  aria-label="Discard draft"
                  onClick={discardDraft}
                  className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-950/60 dark:hover:text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Envelope rows: From / To / Subject */}
          <div className="divide-y divide-slate-200/80 border-b border-slate-200 text-sm dark:divide-white/10 dark:border-white/10">
            {/* From */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs">
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-14 shrink-0 font-semibold text-slate-500 dark:text-slate-400">From</span>
                {settings?.configured ? (
                  <span className="truncate text-slate-800 dark:text-slate-200">
                    {settings.fromName ? `${settings.fromName} ` : ''}
                    <span className="text-slate-500 dark:text-slate-400">&lt;{settings.fromEmail}&gt;</span>
                  </span>
                ) : (
                  <button type="button" onClick={onOpenSettings} className="cursor-pointer font-semibold text-amber-700 underline dark:text-amber-300">
                    Set up mail account…
                  </button>
                )}
              </div>
              {settings?.replyTo && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Reply-To: {settings.replyTo}</span>
              )}
            </div>

            {/* To */}
            <div className="px-4 py-2">
              <div className="flex items-start gap-3">
                <span className="mt-1.5 w-14 shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">To</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {!showBulkTo && recipients.slice(0, 6).map((r) => (
                      <span
                        key={r.email}
                        className="inline-flex max-w-[14rem] items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs text-slate-800 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                      >
                        <span className="truncate">{r.fields.name ? `${r.fields.name} <${r.email}>` : r.email}</span>
                        <button
                          type="button"
                          aria-label={`Remove ${r.email}`}
                          onClick={() => removeRecipient(r.email)}
                          className="cursor-pointer text-slate-400 hover:text-rose-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    {!showBulkTo && recipients.length > 6 && (
                      <button
                        type="button"
                        onClick={() => setShowBulkTo(true)}
                        className="cursor-pointer rounded-full bg-gradient-to-r from-amber-100 to-yellow-100 px-2 py-0.5 text-xs font-semibold text-amber-900 hover:from-amber-200 hover:to-yellow-200 dark:from-amber-950 dark:to-yellow-950/80 dark:text-amber-200"
                      >
                        +{recipients.length - 6} more
                      </button>
                    )}
                    {!showBulkTo && (
                      <input
                        type="text"
                        value={quickTo}
                        onChange={(e) => setQuickTo(e.target.value)}
                        onBlur={commitQuickTo}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ',' || (e.key === 'Tab' && quickTo.trim())) {
                            e.preventDefault();
                            commitQuickTo();
                          } else if (e.key === 'Backspace' && !quickTo && recipients.length > 0) {
                            removeRecipient(recipients[recipients.length - 1].email);
                          }
                        }}
                        onPaste={(e) => {
                          const pasted = e.clipboardData.getData('text');
                          if (pasted.includes('\n') || pasted.includes('\t') || pasted.includes(',') || pasted.includes(';')) {
                            e.preventDefault();
                            appendRecipientLines(pasted);
                            if (pasted.includes('\n') || pasted.includes('\t')) setShowBulkTo(true);
                          }
                        }}
                        placeholder={recipients.length === 0 ? 'Add recipients (email or Name <email>, press Enter) or paste CSV…' : 'Add another…'}
                        aria-label="Add recipient"
                        className="min-w-[12rem] flex-1 bg-transparent py-1 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
                      />
                    )}
                  </div>

                  {/* Quick To controls */}
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <div className="flex flex-wrap items-center gap-2">
                      <input ref={csvInputRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="hidden" onChange={onCsvPicked} />
                      <button
                        type="button"
                        onClick={() => setShowBulkTo((v) => !v)}
                        className="inline-flex cursor-pointer items-center gap-1 font-semibold text-slate-600 hover:text-amber-600 dark:text-slate-300 dark:hover:text-amber-400"
                      >
                        <Table2 className="h-3 w-3" />
                        {showBulkTo ? 'Hide CSV / table' : `CSV / Bulk list${recipients.length ? ` (${recipients.length})` : ''}`}
                      </button>
                      <span>·</span>
                      <button
                        type="button"
                        onClick={() => csvInputRef.current?.click()}
                        className="inline-flex cursor-pointer items-center gap-1 font-semibold text-slate-600 hover:text-amber-600 dark:text-slate-300 dark:hover:text-amber-400"
                      >
                        <FileUp className="h-3 w-3" />
                        Upload CSV
                      </button>
                      {!recipientsText && (
                        <>
                          <span>·</span>
                          <button
                            type="button"
                            onClick={() => { setRecipientsText(SAMPLE); setShowBulkTo(true); setPreviewIndex(0); }}
                            className="cursor-pointer font-semibold text-amber-700 hover:underline dark:text-amber-300"
                          >
                            Load sample list
                          </button>
                        </>
                      )}
                      {recipientsText && (
                        <>
                          <span>·</span>
                          <button
                            type="button"
                            onClick={() => { setRecipientsText(''); setQuickTo(''); setPreviewIndex(0); }}
                            className="cursor-pointer font-semibold text-rose-600 hover:underline dark:text-rose-400"
                          >
                            Clear list
                          </button>
                        </>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400">Each recipient receives a separate email</span>
                  </div>

                  {/* Expanded CSV / Spreadsheet editor & merge table */}
                  {showBulkTo && (
                    <div className="mt-2.5 space-y-2.5">
                      <textarea
                        className="input min-h-[110px] font-mono text-xs"
                        value={recipientsText}
                        onChange={(e) => { setRecipientsText(e.target.value); setPreviewIndex(0); }}
                        placeholder={SAMPLE}
                        spellCheck={false}
                        aria-label="Bulk recipients CSV or spreadsheet data"
                      />
                      <p className="hint !mt-1">
                        One recipient per line, or paste spreadsheet rows. A header row with an <code>email</code> column turns every other column into a <code>{'{{placeholder}}'}</code>.
                      </p>
                      {recipients.length > 0 && (
                        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-white/10">
                          <div className="flex items-center justify-between bg-slate-50 px-3 py-1.5 text-xs font-semibold dark:bg-slate-800">
                            <span>{recipients.length} recipient{recipients.length === 1 ? '' : 's'}</span>
                            {recipients.length > 5 && <span className="font-normal text-slate-500 dark:text-slate-400">showing the first 5</span>}
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="border-t border-slate-200 text-slate-500 dark:border-white/10 dark:text-slate-400">
                                  {columns.map((c) => <th key={c} className="whitespace-nowrap px-3 py-1.5 font-semibold">{c}</th>)}
                                </tr>
                              </thead>
                              <tbody>
                                {recipients.slice(0, 5).map((r) => (
                                  <tr key={r.email} className="border-t border-slate-200 dark:border-white/10">
                                    {columns.map((c) => <td key={c} className="max-w-[14rem] truncate whitespace-nowrap px-3 py-1.5">{r.fields[c]}</td>)}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {skipped.length > 0 && (
                    <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-950 dark:text-amber-100">
                      <p className="font-semibold">{skipped.length} line{skipped.length === 1 ? '' : 's'} will be skipped:</p>
                      <ul className="mt-1 list-inside list-disc">
                        {skipped.slice(0, 5).map((s) => <li key={s.line}>Line {s.line}: {s.reason}</li>)}
                        {skipped.length > 5 && <li>…and {skipped.length - 5} more</li>}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Subject */}
            <div className="flex items-center gap-3 px-4 py-2">
              <label htmlFor="subject" className="w-14 shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">Subject</label>
              <input
                id="subject"
                ref={subjectRef}
                onFocus={() => setActiveField('subject')}
                className="min-w-0 flex-1 bg-transparent py-1 text-sm font-medium text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400 dark:text-slate-100"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="You're invited, {{name}}!"
              />
            </div>
          </div>

          {/* Merge fields & body drafting surface */}
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Insert into {activeField === 'subject' ? 'subject' : 'message'}:
              </span>
              {columns.map((c) => (
                <button
                  key={c}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertPlaceholder(c)}
                  className="cursor-pointer rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  {`{{${c}}}`}
                </button>
              ))}
            </div>

            {mode === 'rich' ? (
              <RichEmailEditor
                ref={richEditorRef}
                value={body}
                onChange={setBody}
                onFocus={() => setActiveField('body')}
                onInsertImage={() => setPickingImage(true)}
                placeholder="Write your email… Format text, add links, lists, or insert inline images."
              />
            ) : (
              <textarea
                id="body"
                ref={plainBodyRef}
                onFocus={() => setActiveField('body')}
                className={`input min-h-[290px] ${mode === 'html' ? 'font-mono text-xs' : ''}`}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={mode === 'html' ? '<p>Dear {{name}},</p>\n<p>Write raw HTML here…</p>' : 'Dear {{name}},\n\nYou are cordially invited to…'}
              />
            )}

            {unknown.length > 0 && (
              <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>No column called {unknown.map((u) => `{{${u}}}`).join(', ')} in the recipient list — it will be sent exactly as typed.</span>
              </p>
            )}

            {/* Attachments list */}
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onFilesPicked} />
            {attachments.length > 0 && (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-slate-800/50">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">
                    Attachments ({formatBytes(attachmentBytes)} of {formatBytes(MAX_TOTAL_ATTACHMENT_BYTES)})
                  </span>
                  {mode === 'plain' && (
                    <button
                      type="button"
                      className="cursor-pointer font-semibold text-amber-700 underline dark:text-amber-300"
                      onClick={() => insertIntoPlainBody(`\n${buildAttachmentNoticeLine(attachments.map((a) => a.filename))}\n`)}
                    >
                      Mention them in the message
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {attachments.map((a, i) => (
                    <span
                      key={`${a.filename}-${i}`}
                      className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs dark:border-white/10 dark:bg-slate-900"
                    >
                      <Paperclip className="h-3 w-3 shrink-0 text-slate-400" />
                      <span className="truncate">{a.filename}</span>
                      <span className="shrink-0 text-slate-400">· {formatBytes(a.size)}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${a.filename}`}
                        className="cursor-pointer text-slate-400 hover:text-rose-600"
                        onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Delivery / Schedule options */}
            {showDelivery && (
              <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-2 dark:border-white/10 dark:bg-slate-800/50">
                <div>
                  <label className="label" htmlFor="label">Batch name <span className="font-normal text-slate-400">(optional)</span></label>
                  <input id="label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. March invitations" />
                  <p className="hint">Labels this batch in the Queue and History.</p>
                </div>
                <div>
                  <label className="label flex cursor-pointer items-center gap-1.5">
                    <input type="checkbox" checked={scheduleOn} onChange={(e) => setScheduleOn(e.target.checked)} />
                    <CalendarClock className="h-3.5 w-3.5" />Schedule send time
                  </label>
                  <input type="datetime-local" className="input" disabled={!scheduleOn} value={sendAt} onChange={(e) => setSendAt(e.target.value)} aria-label="Send time" />
                  <p className="hint">Keep Mailer running until the scheduled time.</p>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Gmail/Outlook-style action bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-white/10 dark:bg-slate-800/70">
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton variant="primary" size="md" disabled={Boolean(problem) || sending} onClick={() => setConfirming(true)}>
                {scheduleDate ? <CalendarClock className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                {scheduleDate
                  ? recipients.length > 1 ? `Schedule ${recipients.length}` : 'Schedule'
                  : recipients.length > 1 ? `Send ${recipients.length} emails` : 'Send'}
              </ActionButton>
              <ActionButton onClick={() => fileInputRef.current?.click()}>
                <Paperclip className="h-4 w-4" />Attach
              </ActionButton>
              <ActionButton onClick={() => setPickingImage(true)}>
                <ImagePlus className="h-4 w-4" />Image
              </ActionButton>
              <button
                type="button"
                onClick={() => setShowDelivery((v) => !v)}
                aria-expanded={showDelivery}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold transition ${
                  showDelivery || scheduleOn || label
                    ? 'border-amber-400 bg-gradient-to-r from-amber-50 to-yellow-50 text-amber-900 dark:border-amber-500/40 dark:from-amber-950 dark:to-yellow-950/70 dark:text-amber-200'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {scheduleDate ? `Scheduled` : 'Options'}
              </button>
            </div>
            {problem && <span className="text-xs text-slate-500 dark:text-slate-400">{problem}</span>}
          </div>
        </section>
      </div>

      {/* ── Part 2: Live Email Preview Studio ── */}
      <section className="card self-start space-y-3 lg:sticky lg:top-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold">Live Preview</h2>
            {recipients.length > 1 && (
              <div className="flex items-center gap-1 text-xs">
                <button
                  type="button"
                  className="btn !p-1"
                  aria-label="Previous recipient"
                  disabled={clampedPreviewIndex === 0}
                  onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <select
                  aria-label="Preview recipient"
                  value={clampedPreviewIndex}
                  onChange={(e) => setPreviewIndex(Number(e.target.value))}
                  className="input !w-auto max-w-[10rem] !py-0.5 !px-2 text-xs"
                >
                  {recipients.map((r, idx) => (
                    <option key={r.email} value={idx}>
                      {idx + 1}/{recipients.length}: {r.fields.name || r.email}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn !p-1"
                  aria-label="Next recipient"
                  disabled={clampedPreviewIndex >= recipients.length - 1}
                  onClick={() => setPreviewIndex((i) => Math.min(recipients.length - 1, i + 1))}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs dark:border-white/10 dark:bg-slate-800" role="group" aria-label="Preview format">
              <button
                type="button"
                onClick={() => setPreviewView('rendered')}
                className={`cursor-pointer rounded-md px-2 py-1 font-semibold transition ${previewView === 'rendered' ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
              >
                Rendered
              </button>
              <button
                type="button"
                onClick={() => setPreviewView('text')}
                className={`cursor-pointer rounded-md px-2 py-1 font-semibold transition ${previewView === 'text' ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
              >
                Plain text
              </button>
            </div>
            {previewView === 'rendered' && (
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-white/10 dark:bg-slate-800" role="group" aria-label="Viewport size">
                <button
                  type="button"
                  title="Desktop view"
                  aria-label="Desktop view"
                  onClick={() => setPreviewDevice('desktop')}
                  className={`cursor-pointer rounded-md p-1 transition ${previewDevice === 'desktop' ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  <Monitor className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="Mobile view"
                  aria-label="Mobile view"
                  onClick={() => setPreviewDevice('mobile')}
                  className={`cursor-pointer rounded-md p-1 transition ${previewDevice === 'mobile' ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Envelope preview card */}
        <dl className="space-y-1 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs dark:border-white/10 dark:bg-slate-800/60">
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-slate-500 dark:text-slate-400">From</dt>
            <dd className="truncate">{settings?.fromEmail ? `${settings.fromName ? `${settings.fromName} ` : ''}<${settings.fromEmail}>` : '—'}</dd>
          </div>
          {settings?.replyTo && (
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-slate-500 dark:text-slate-400">Reply-To</dt>
              <dd className="truncate">{settings.replyTo}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-slate-500 dark:text-slate-400">To</dt>
            <dd className="truncate">{sample?.email || '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-slate-500 dark:text-slate-400">Subject</dt>
            <dd className="truncate font-semibold">{previewSubject || '—'}</dd>
          </div>
          {(attachments.length > 0 || scheduleDate || (settings && settings.sendDelayMinutes > 0)) && (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {attachments.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 dark:bg-slate-900">
                  <Paperclip className="h-3 w-3" />
                  {attachments.length} file{attachments.length === 1 ? '' : 's'} ({formatBytes(attachmentBytes)})
                </span>
              )}
              {scheduleDate ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-amber-50 to-yellow-50 px-2 py-0.5 text-amber-800 dark:from-amber-950 dark:to-yellow-950/70 dark:text-amber-200">
                  <CalendarClock className="h-3 w-3" />
                  Scheduled: {formatDateTime(scheduleDate.toISOString())}
                </span>
              ) : settings && settings.sendDelayMinutes > 0 ? (
                <span className="rounded-md bg-white px-2 py-0.5 dark:bg-slate-900">
                  Cancel window: {settings.sendDelayMinutes} min
                </span>
              ) : null}
            </div>
          )}
        </dl>

        {previewView === 'rendered' ? (
          <div className={previewDevice === 'mobile' ? 'flex justify-center rounded-xl bg-slate-100 p-3 dark:bg-slate-950' : ''}>
            <div className={previewDevice === 'mobile' ? 'w-[375px] max-w-full overflow-hidden rounded-2xl border-4 border-slate-800 shadow-lg' : 'w-full'}>
              <EmailPreview subject={previewSubject} body={previewBody} bodyIsHtml={bodyIsHtml} className="h-[520px]" />
            </div>
          </div>
        ) : (
          <div className="h-[520px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 font-mono text-xs leading-relaxed text-slate-800 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200">
            <div className="mb-3 border-b border-slate-200 pb-2 text-slate-500 dark:border-white/10 dark:text-slate-400">
              Subject: <span className="font-semibold text-slate-900 dark:text-slate-100">{previewSubject || '(no subject)'}</span>
            </div>
            <pre className="whitespace-pre-wrap break-words font-mono">{plainPreviewText || '(empty message)'}</pre>
          </div>
        )}

        <p className="hint flex flex-wrap items-center justify-between gap-2">
          <span>Rendered with the exact server template that goes out.</span>
          <button type="button" onClick={onOpenSettings} className="cursor-pointer font-semibold text-amber-700 underline dark:text-amber-300">
            Customize letterhead
          </button>
        </p>
      </section>

      {pickingImage && (
        <ImageLibraryModal
          title="Insert image"
          onClose={() => setPickingImage(false)}
          onPick={(img) => {
            setPickingImage(false);
            if (mode === 'rich') {
              richEditorRef.current?.insertImage(img.id);
            } else if (mode === 'html') {
              insertIntoPlainBody(imageHtmlSnippet(img.id));
            } else {
              insertIntoPlainBody(`\n${imageToken(img.id)}\n`);
            }
          }}
        />
      )}

      {confirming && (
        <ConfirmModal
          title={recipients.length > 1 ? `Send ${recipients.length} emails?` : 'Send this email?'}
          confirmLabel={scheduleDate ? 'Schedule' : 'Send'}
          busy={sending}
          onClose={() => !sending && setConfirming(false)}
          onConfirm={send}
          message={
            <>
              <p>
                <strong>{previewSubject || subject}</strong> will go to{' '}
                {recipients.length === 1 ? <strong>{recipients[0].email}</strong> : <><strong>{recipients.length} recipients</strong>, each as their own separate e-mail</>}
                {attachments.length > 0 && <> with {attachments.length} attachment{attachments.length === 1 ? '' : 's'}</>}
                {' '}from <strong>{settings?.fromEmail}</strong>.
              </p>
              <p className="mt-2">
                {scheduleDate
                  ? `Sending starts ${formatDateTime(scheduleDate.toISOString())}.`
                  : settings && settings.sendDelayMinutes > 0
                    ? `Sending starts in ${settings.sendDelayMinutes} minute${settings.sendDelayMinutes === 1 ? '' : 's'} — until then you can cancel it in the Queue.`
                    : 'Sending starts straight away.'}
              </p>
              {unknown.length > 0 && <p className="mt-2 text-amber-700 dark:text-amber-300">{unknown.map((u) => `{{${u}}}`).join(', ')} has no matching column and will appear as typed.</p>}
            </>
          }
        />
      )}
    </div>
  );
}
