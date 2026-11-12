'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, Inbox, Loader2, Paperclip, RotateCcw, Search, Send, Trash2 } from 'lucide-react';
import { api, formatCountdown, formatDateTime, type EmailLog, type LogCounts, type LogRow } from '@/lib/client';
import { ConfirmModal, HtmlFrame, Modal, type Toast } from './ui';

type StatusFilter = 'ALL' | 'SENT' | 'FAILED' | 'CANCELLED';
type QueueAction = 'send-now' | 'cancel' | 'retry' | 'delete';
type Scope = { id: string } | { all: true };

const PAGE = 50;
const STATUS_STYLE: Record<EmailLog['status'], string> = {
  QUEUED: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  SENDING: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  SENT: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  FAILED: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
  CANCELLED: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
};
const STATUS_LABEL: Record<EmailLog['status'], string> = { QUEUED: 'Queued', SENDING: 'Sending', SENT: 'Sent', FAILED: 'Failed', CANCELLED: 'Cancelled' };

/**
 * The Queue tab (mode="queue": messages waiting to be sent, in send order) and
 * the History tab (mode="history": everything that was sent, failed or cancelled).
 * Polls while visible so progress shows up live.
 */
export function LogList({ mode, onToast, onCounts }: { mode: 'queue' | 'history'; onToast: (t: Toast) => void; onCounts: (c: LogCounts) => void }) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(PAGE);
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState<EmailLog | null>(null);
  const [confirm, setConfirm] = useState<{ action: QueueAction; scope: Scope; title: string; message: string; label: string } | null>(null);
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const params = new URLSearchParams({ limit: String(limit), status: mode === 'queue' ? 'PENDING' : status === 'ALL' ? 'DONE' : status, q: query });
      const data = await api<{ logs: LogRow[]; total: number; counts: LogCounts }>(`/api/logs?${params}`);
      if (seq !== requestSeq.current) return; // a newer request has been made since
      setRows(data.logs);
      setTotal(data.total);
      onCounts(data.counts);
      setError(null);
    } catch (err) {
      if (seq === requestSeq.current) setError((err as Error).message);
    } finally {
      if (seq === requestSeq.current) setLoaded(true);
    }
  }, [limit, mode, status, query, onCounts]);

  useEffect(() => {
    const first = setTimeout(load, query ? 250 : 0);
    const poll = setInterval(load, 3000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearTimeout(first); clearInterval(poll); clearInterval(tick); };
  }, [load, query]);

  const run = async (action: QueueAction, scope: Scope) => {
    const key = `${action}:${'id' in scope ? scope.id : 'all'}`;
    setBusy(key);
    try {
      const { count } = await api<{ count: number }>('/api/queue', { action, ...scope });
      const noun = `message${count === 1 ? '' : 's'}`;
      onToast({
        type: 'success',
        text: action === 'send-now' ? `Sending ${count} ${noun} now.`
          : action === 'cancel' ? `Cancelled ${count} ${noun}.`
          : action === 'retry' ? `${count} ${noun} put back in the queue.`
          : `Removed ${count} ${noun} from the history.`,
      });
      setConfirm(null);
      setOpen(null);
      await load();
    } catch (err) {
      onToast({ type: 'error', text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const openRow = async (row: LogRow) => {
    try {
      setOpen(await api<EmailLog>(`/api/logs/${row.id}`));
    } catch (err) {
      onToast({ type: 'error', text: (err as Error).message });
    }
  };

  const hasFailed = rows.some((r) => r.status === 'FAILED');

  return (
    <section className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold">{mode === 'queue' ? 'Waiting to be sent' : 'History'}</h2>
          <p className="hint !mt-0.5">
            {mode === 'queue'
              ? 'Messages are sent one at a time, in this order. Keep the app running until the list is empty.'
              : '“Sent” means the mail server accepted the message — delivery to the inbox is up to the recipient’s provider.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {mode === 'queue' && rows.length > 0 && (
            <>
              <button className="btn" disabled={busy !== null} onClick={() => run('send-now', { all: true })}><Send className="h-4 w-4" />Send all now</button>
              <button className="btn-danger" disabled={busy !== null} onClick={() => setConfirm({ action: 'cancel', scope: { all: true }, title: 'Cancel everything in the queue?', message: 'Every message still waiting will be cancelled and not sent. A message that is being sent right now cannot be stopped.', label: 'Cancel all' })}><Ban className="h-4 w-4" />Cancel all</button>
            </>
          )}
          {mode === 'history' && (
            <>
              {hasFailed && <button className="btn" disabled={busy !== null} onClick={() => run('retry', { all: true })}><RotateCcw className="h-4 w-4" />Retry all failed</button>}
              {rows.length > 0 && <button className="btn-danger" disabled={busy !== null} onClick={() => setConfirm({ action: 'delete', scope: { all: true }, title: 'Clear the history?', message: 'Every sent, failed and cancelled message will be removed from this list for good. Messages still in the queue are not affected.', label: 'Clear history' })}><Trash2 className="h-4 w-4" />Clear history</button>}
            </>
          )}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input className="input !pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by recipient, subject or batch name" aria-label="Search" />
        </div>
        {mode === 'history' && (
          <select className="input !w-auto" value={status} onChange={(e) => { setStatus(e.target.value as StatusFilter); setLimit(PAGE); }} aria-label="Status">
            <option value="ALL">All</option>
            <option value="SENT">Sent</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        )}
      </div>

      {error && <p className="mb-3 rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-500/40 dark:bg-rose-950 dark:text-rose-200">Could not load the list: {error}</p>}

      {!loaded ? (
        <div className="flex justify-center py-12 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
          <Inbox className="h-8 w-8 opacity-50" />
          {query ? 'Nothing matches that search.' : mode === 'queue' ? 'Nothing is waiting to be sent.' : 'No messages yet.'}
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-white/10">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
              <button onClick={() => openRow(row)} className="min-w-0 flex-1 cursor-pointer text-left">
                <div className="flex items-center gap-2">
                  <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[row.status]}`}>{STATUS_LABEL[row.status]}</span>
                  <span className="truncate text-sm font-semibold">{row.to}</span>
                  {row.attachmentsMeta?.length ? <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-label="Has attachments" /> : null}
                </div>
                <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                  {row.subject}{row.batchLabel ? ` · ${row.batchLabel}` : ''}
                </div>
                {row.status === 'FAILED' && row.errorMessage && <div className="mt-0.5 line-clamp-1 text-xs text-rose-700 dark:text-rose-300">{row.errorMessage}</div>}
              </button>
              <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                {row.status === 'QUEUED' ? formatCountdown(row.sendAfter, now) : row.status === 'SENDING' ? 'now' : formatDateTime(row.sentAt || row.createdAt)}
              </span>
              <div className="flex shrink-0 gap-1.5">
                {row.status === 'QUEUED' && (
                  <>
                    <button className="btn !px-2 !py-1 text-xs" disabled={busy !== null} onClick={() => run('send-now', { id: row.id })}>Send now</button>
                    <button className="btn-danger !px-2 !py-1 text-xs" disabled={busy !== null} onClick={() => run('cancel', { id: row.id })}>Cancel</button>
                  </>
                )}
                {row.status === 'FAILED' && <button className="btn !px-2 !py-1 text-xs" disabled={busy !== null} onClick={() => run('retry', { id: row.id })}>Retry</button>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {loaded && total > rows.length && rows.length >= limit && (
        <div className="mt-3 flex justify-center">
          <button className="btn" onClick={() => setLimit((l) => l + PAGE)}>Show more ({total - rows.length} more)</button>
        </div>
      )}

      {open && (
        <Modal title={open.subject || '(no subject)'} wide onClose={() => setOpen(null)}>
          <dl className="mb-4 grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-slate-500 dark:text-slate-400">Status</dt>
            <dd><span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[open.status]}`}>{STATUS_LABEL[open.status]}</span></dd>
            <dt className="text-slate-500 dark:text-slate-400">To</dt><dd className="break-all">{open.to}</dd>
            {open.batchLabel && <><dt className="text-slate-500 dark:text-slate-400">Batch</dt><dd>{open.batchLabel}</dd></>}
            <dt className="text-slate-500 dark:text-slate-400">Queued</dt><dd>{formatDateTime(open.createdAt)}</dd>
            {open.status === 'QUEUED' && <><dt className="text-slate-500 dark:text-slate-400">Sends</dt><dd>{formatDateTime(open.sendAfter)}</dd></>}
            {open.sentAt && <><dt className="text-slate-500 dark:text-slate-400">{open.status === 'SENT' ? 'Sent' : 'Finished'}</dt><dd>{formatDateTime(open.sentAt)}</dd></>}
            {open.attachmentsMeta?.length ? <><dt className="text-slate-500 dark:text-slate-400">Attached</dt><dd>{open.attachmentsMeta.map((a) => a.filename).join(', ')}</dd></> : null}
            {open.smtpResponse && <><dt className="text-slate-500 dark:text-slate-400">Server said</dt><dd className="break-all font-mono">{open.smtpResponse}</dd></>}
            {open.rejectedRecipients?.length ? <><dt className="text-slate-500 dark:text-slate-400">Rejected</dt><dd className="break-all">{open.rejectedRecipients.join(', ')}</dd></> : null}
          </dl>
          {open.errorMessage && <p className="mb-4 whitespace-pre-wrap rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-500/40 dark:bg-rose-950 dark:text-rose-200">{open.errorMessage}</p>}
          <HtmlFrame html={open.bodyHtml} />
          <div className="mt-4 flex justify-end gap-2">
            {open.status === 'FAILED' && <button className="btn" disabled={busy !== null} onClick={() => run('retry', { id: open.id })}><RotateCcw className="h-4 w-4" />Retry</button>}
            {open.status === 'QUEUED' && <button className="btn-danger" disabled={busy !== null} onClick={() => run('cancel', { id: open.id })}><Ban className="h-4 w-4" />Cancel</button>}
            {open.status !== 'QUEUED' && open.status !== 'SENDING' && <button className="btn-danger" disabled={busy !== null} onClick={() => run('delete', { id: open.id })}><Trash2 className="h-4 w-4" />Remove from history</button>}
          </div>
        </Modal>
      )}

      {confirm && (
        <ConfirmModal title={confirm.title} message={confirm.message} confirmLabel={confirm.label} danger busy={busy !== null} onClose={() => setConfirm(null)} onConfirm={() => run(confirm.action, confirm.scope)} />
      )}
    </section>
  );
}
