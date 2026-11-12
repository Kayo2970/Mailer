'use client';

import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarClock, ChevronLeft, ChevronRight, FileUp, ImagePlus, Paperclip, Send, Trash2, X } from 'lucide-react';
import { api, formatDateTime, type PublicEmailSettings } from '@/lib/client';
import { applyMailMerge, findUnknownPlaceholders, parseRecipients } from '@/lib/mail-merge';
import { ComposedAttachment, MAX_TOTAL_ATTACHMENT_BYTES, buildAttachmentNoticeLine, filesToAttachments, formatBytes } from '@/lib/email-attachments';
import { imageHtmlSnippet, imageToken } from '@/lib/inline-images';
import { ConfirmModal, EmailPreview, type Toast } from './ui';
import { ImageLibraryModal } from './image-library';

const SAMPLE = 'name, email, company\nAnanya Sharma, ananya@example.com, Acme\nRahul Verma, rahul@example.com, Globex';

export function ComposeTab({ settings, onToast, onQueued, onOpenSettings }: {
  settings: PublicEmailSettings | null;
  onToast: (t: Toast) => void;
  onQueued: () => void;
  onOpenSettings: () => void;
}) {
  const [recipientsText, setRecipientsText] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [bodyIsHtml, setBodyIsHtml] = useState(false);
  const [label, setLabel] = useState('');
  const [attachments, setAttachments] = useState<ComposedAttachment[]>([]);
  const [scheduleOn, setScheduleOn] = useState(false);
  const [sendAt, setSendAt] = useState('');
  const [previewIndex, setPreviewIndex] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => parseRecipients(recipientsText), [recipientsText]);
  const { recipients, columns, skipped } = parsed;
  const unknown = useMemo(
    () => Array.from(new Set([...findUnknownPlaceholders(subject, columns), ...findUnknownPlaceholders(body, columns)])),
    [subject, body, columns]
  );
  const attachmentBytes = attachments.reduce((sum, a) => sum + a.size, 0);

  const sample = recipients[Math.min(previewIndex, Math.max(recipients.length - 1, 0))];
  const previewFields = sample?.fields || {};
  const previewSubject = applyMailMerge(subject, previewFields);
  const previewBody = applyMailMerge(body, previewFields);

  const scheduleDate = scheduleOn && sendAt ? new Date(sendAt) : null;
  const scheduleInvalid = scheduleOn && (!scheduleDate || Number.isNaN(scheduleDate.getTime()));

  const problem =
    !settings?.configured ? 'Connect a mail account in Settings first.'
    : recipients.length === 0 ? 'Add at least one recipient.'
    : !subject.trim() ? 'Add a subject.'
    : !body.trim() ? 'Write a message.'
    : attachmentBytes > MAX_TOTAL_ATTACHMENT_BYTES ? `Attachments are over the ${formatBytes(MAX_TOTAL_ATTACHMENT_BYTES)} limit.`
    : scheduleInvalid ? 'Pick a date and time to send at.'
    : null;

  const insertAtCursor = (text: string) => {
    const el = bodyRef.current;
    if (!el) { setBody((b) => b + text); return; }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + text + body.slice(end));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + text.length, start + text.length); });
  };

  const onCsvPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setRecipientsText(await file.text());
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
      setSubject('');
      setBody('');
      setLabel('');
      setAttachments([]);
      setScheduleOn(false);
      setSendAt('');
      setPreviewIndex(0);
      onQueued();
    } catch (err) {
      setConfirming(false);
      onToast({ type: 'error', text: (err as Error).message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        {settings && !settings.configured && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              No mail account is connected yet, so nothing can be sent.{' '}
              <button onClick={onOpenSettings} className="cursor-pointer font-semibold underline">Open Settings</button>
            </div>
          </div>
        )}

        <section className="card">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold">1. Recipients</h2>
            <div className="flex gap-2">
              <input ref={csvInputRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="hidden" onChange={onCsvPicked} />
              <button className="btn" onClick={() => csvInputRef.current?.click()}><FileUp className="h-4 w-4" />Upload CSV</button>
              {recipientsText && <button className="btn" onClick={() => { setRecipientsText(''); setPreviewIndex(0); }}><Trash2 className="h-4 w-4" />Clear</button>}
            </div>
          </div>
          <textarea
            className="input min-h-[120px] font-mono text-xs"
            value={recipientsText}
            onChange={(e) => { setRecipientsText(e.target.value); setPreviewIndex(0); }}
            placeholder={SAMPLE}
            spellCheck={false}
            aria-label="Recipients"
          />
          <p className="hint">
            One recipient per line, or paste rows straight from a spreadsheet. Give it a header row with an <code>email</code> column
            and every other column becomes a <code>{'{{placeholder}}'}</code> you can use in the subject and message.
          </p>

          {recipients.length > 0 && (
            <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 dark:border-white/10">
              <div className="flex items-center justify-between bg-slate-50 px-3 py-2 text-xs font-semibold dark:bg-slate-800">
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
          {skipped.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-950 dark:text-amber-100">
              <p className="font-semibold">{skipped.length} line{skipped.length === 1 ? '' : 's'} will be skipped:</p>
              <ul className="mt-1 list-inside list-disc">
                {skipped.slice(0, 5).map((s) => <li key={s.line}>Line {s.line}: {s.reason}</li>)}
                {skipped.length > 5 && <li>…and {skipped.length - 5} more</li>}
              </ul>
            </div>
          )}
        </section>

        <section className="card space-y-4">
          <h2 className="text-sm font-bold">2. Message</h2>
          <div>
            <label className="label" htmlFor="subject">Subject</label>
            <input id="subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="You're invited, {{name}}!" />
          </div>
          <div>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <label className="label !mb-0" htmlFor="body">Message</label>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={bodyIsHtml} onChange={(e) => setBodyIsHtml(e.target.checked)} />
                I&apos;m writing HTML
              </label>
            </div>
            <textarea
              id="body"
              ref={bodyRef}
              className={`input min-h-[220px] ${bodyIsHtml ? 'font-mono text-xs' : ''}`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={'Dear {{name}},\n\nYou are cordially invited to…'}
            />
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500 dark:text-slate-400">Insert:</span>
              {columns.map((c) => (
                <button key={c} onClick={() => insertAtCursor(`{{${c}}}`)} className="cursor-pointer rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:bg-slate-800 dark:text-slate-200">
                  {`{{${c}}}`}
                </button>
              ))}
            </div>
            {unknown.length > 0 && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>No column called {unknown.map((u) => `{{${u}}}`).join(', ')} in the recipient list — it will be sent exactly as typed.</span>
              </p>
            )}
          </div>

          <div>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onFilesPicked} />
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn" onClick={() => setPickingImage(true)}><ImagePlus className="h-4 w-4" />Insert image</button>
              <button className="btn" onClick={() => fileInputRef.current?.click()}><Paperclip className="h-4 w-4" />Attach files</button>
              {attachments.length > 0 && (
                <>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{formatBytes(attachmentBytes)} of {formatBytes(MAX_TOTAL_ATTACHMENT_BYTES)}</span>
                  {!bodyIsHtml && (
                    <button className="cursor-pointer text-xs font-semibold text-sky-700 underline dark:text-sky-300" onClick={() => insertAtCursor(`\n${buildAttachmentNoticeLine(attachments.map((a) => a.filename))}\n`)}>
                      Mention them in the message
                    </button>
                  )}
                </>
              )}
            </div>
            <p className="hint">
              <strong>Insert image</strong> places a picture in the message at the cursor{bodyIsHtml ? '' : <> as <code>[[image:…]]</code> (add <code>|300</code> before the <code>]]</code> to set its width in pixels)</>}.
              It is embedded in the e-mail itself, so recipients see it even after this app is closed.
            </p>
            {attachments.length > 0 && (
              <ul className="mt-2 space-y-1">
                {attachments.map((a, i) => (
                  <li key={`${a.filename}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs dark:bg-slate-800">
                    <span className="truncate">{a.filename} <span className="text-slate-500 dark:text-slate-400">· {formatBytes(a.size)}</span></span>
                    <button aria-label={`Remove ${a.filename}`} className="cursor-pointer text-slate-500 hover:text-rose-600" onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}><X className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="card space-y-4">
          <h2 className="text-sm font-bold">3. Send</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="label">Batch name <span className="font-normal text-slate-400">(optional)</span></label>
              <input id="label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. March invitations" />
              <p className="hint">Only for you — it labels this batch in the queue and history.</p>
            </div>
            <div>
              <label className="label flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={scheduleOn} onChange={(e) => setScheduleOn(e.target.checked)} />
                <CalendarClock className="h-3.5 w-3.5" />Send later
              </label>
              <input type="datetime-local" className="input" disabled={!scheduleOn} value={sendAt} onChange={(e) => setSendAt(e.target.value)} aria-label="Send time" />
              <p className="hint">The app must be running at that time; if it isn&apos;t, the batch goes out the next time it starts.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary" disabled={Boolean(problem) || sending} onClick={() => setConfirming(true)}>
              <Send className="h-4 w-4" />
              {recipients.length > 1 ? `Send ${recipients.length} emails` : 'Send email'}
            </button>
            {problem && <span className="text-xs text-slate-500 dark:text-slate-400">{problem}</span>}
          </div>
        </section>
      </div>

      <section className="card self-start lg:sticky lg:top-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold">Preview</h2>
          {recipients.length > 1 && (
            <div className="flex items-center gap-1 text-xs">
              <button className="btn !p-1" aria-label="Previous recipient" disabled={previewIndex === 0} onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}><ChevronLeft className="h-4 w-4" /></button>
              <span className="px-1 tabular-nums">{previewIndex + 1} / {recipients.length}</span>
              <button className="btn !p-1" aria-label="Next recipient" disabled={previewIndex >= recipients.length - 1} onClick={() => setPreviewIndex((i) => Math.min(recipients.length - 1, i + 1))}><ChevronRight className="h-4 w-4" /></button>
            </div>
          )}
        </div>
        <dl className="mb-3 space-y-1 text-xs">
          <div className="flex gap-2"><dt className="w-14 shrink-0 text-slate-500 dark:text-slate-400">From</dt><dd className="truncate">{settings?.fromEmail ? `${settings.fromName ? `${settings.fromName} ` : ''}<${settings.fromEmail}>` : '—'}</dd></div>
          <div className="flex gap-2"><dt className="w-14 shrink-0 text-slate-500 dark:text-slate-400">To</dt><dd className="truncate">{sample?.email || '—'}</dd></div>
          <div className="flex gap-2"><dt className="w-14 shrink-0 text-slate-500 dark:text-slate-400">Subject</dt><dd className="truncate font-semibold">{previewSubject || '—'}</dd></div>
        </dl>
        <EmailPreview subject={previewSubject} body={previewBody} bodyIsHtml={bodyIsHtml} className="h-[520px]" />
        <p className="hint">This is the exact e-mail that will be sent. Change its look (letterhead, logo, footer, colours) in Settings.</p>
      </section>

      {pickingImage && (
        <ImageLibraryModal
          title="Insert image"
          onClose={() => setPickingImage(false)}
          onPick={(img) => {
            setPickingImage(false);
            insertAtCursor(bodyIsHtml ? imageHtmlSnippet(img.id) : `\n${imageToken(img.id)}\n`);
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
