/** Browser-side helpers for talking to the API routes. */
import type { EmailLog, PublicEmailSettings } from './email-service';

export type { EmailLog, PublicEmailSettings };
export type LogRow = Omit<EmailLog, 'bodyHtml' | 'attachmentKeys'>;

export interface LogCounts { total: number; queued: number; sending: number; sent: number; failed: number; cancelled: number }

/** JSON request; throws an Error carrying the server's message when the response is not OK. */
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined
    ? { cache: 'no-store' }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || data?.message || `Request failed (${res.status})`);
  return data as T;
}

export function formatDateTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** "in 4 min", "in 2 h 5 min", "now" — for a queued message's send time. */
export function formatCountdown(iso: string, now: number): string {
  const ms = new Date(iso).getTime() - now;
  if (!(ms > 0)) return 'next in line';
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `in ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `in ${h} h ${m % 60} min`;
  return `on ${formatDateTime(iso)}`;
}
