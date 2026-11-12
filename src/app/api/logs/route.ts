import { NextResponse } from 'next/server';
import { EmailLog, kickWorker } from '@/lib/email-service';
import { readCollection } from '@/lib/store';
import { handle } from '@/lib/api';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * GET ?limit=50&offset=0&status=ALL|QUEUED|SENDING|SENT|FAILED|CANCELLED|PENDING|DONE&q=<text>
 * One page of messages, newest first, filtered server-side so the browser never
 * downloads the whole history. PENDING = queued + sending (the Queue tab), which
 * is ordered by send time instead; DONE = everything else (the History tab). bodyHtml is left out — see /api/logs/[id].
 */
export function GET(request: Request) {
  return handle(request, async () => {
    // The page polls this, which doubles as a heartbeat for the queue worker.
    kickWorker();

    const params = new URL(request.url).searchParams;
    const limit = Math.min(Math.max(parseInt(params.get('limit') || '', 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = Math.max(parseInt(params.get('offset') || '', 10) || 0, 0);
    const status = params.get('status') || 'ALL';
    const q = (params.get('q') || '').trim().toLowerCase();

    const all = await readCollection<EmailLog>('emails');
    const counts = { total: all.length, queued: 0, sending: 0, sent: 0, failed: 0, cancelled: 0 };
    for (const l of all) {
      if (l.status === 'QUEUED') counts.queued++;
      else if (l.status === 'SENDING') counts.sending++;
      else if (l.status === 'SENT') counts.sent++;
      else if (l.status === 'FAILED') counts.failed++;
      else counts.cancelled++;
    }

    const pending = status === 'PENDING';
    const matched = all.filter((l) => {
      const waiting = l.status === 'QUEUED' || l.status === 'SENDING';
      if (pending ? !waiting : status === 'DONE' ? waiting : status !== 'ALL' && l.status !== status) return false;
      return !q
        || l.to.toLowerCase().includes(q)
        || l.subject.toLowerCase().includes(q)
        || (l.batchLabel || '').toLowerCase().includes(q);
    });
    if (pending) {
      matched.sort((a, b) => (a.status === b.status ? a.sendAfter.localeCompare(b.sendAfter) || a.id.localeCompare(b.id) : a.status === 'SENDING' ? -1 : 1));
    } else {
      matched.sort((a, b) => (b.sentAt || b.createdAt).localeCompare(a.sentAt || a.createdAt) || a.id.localeCompare(b.id));
    }

    const logs = matched.slice(offset, offset + limit).map((l) => ({ ...l, bodyHtml: undefined, attachmentKeys: undefined, inlineImages: undefined }));
    return NextResponse.json({ logs, total: matched.length, hasMore: offset + logs.length < matched.length, counts });
  });
}
