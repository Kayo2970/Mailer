'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';
import { api } from '@/lib/client';
import SpecularButton, { type SpecularButtonProps } from './SpecularButton';

export type Toast = { type: 'success' | 'error'; text: string } | null;

type ActionVariant = 'primary' | 'secondary' | 'danger';

const VARIANT_PROPS: Record<ActionVariant, Pick<SpecularButtonProps, 'tint' | 'tintOpacity' | 'textColor' | 'lineColor' | 'baseColor'>> = {
  primary: {
    tint: '#f59e0b',
    tintOpacity: 0.92,
    textColor: '#1c1917',
    lineColor: '#fef3c7',
    baseColor: '#b45309',
  },
  secondary: {
    tint: '#0f172a',
    tintOpacity: 0.88,
    textColor: '#f5f5f5',
    lineColor: '#fde68a',
    baseColor: '#525252',
  },
  danger: {
    tint: '#be123c',
    tintOpacity: 0.9,
    textColor: '#f5f5f5',
    lineColor: '#ffe4e6',
    baseColor: '#881337',
  },
};

/**
 * App button backed by React Bits <SpecularButton /> with high-contrast tints
 * over light/dark cards and the configured specular rim highlight.
 */
export function ActionButton({
  variant = 'secondary',
  size = 'sm',
  className = '',
  ...rest
}: SpecularButtonProps & { variant?: ActionVariant }) {
  return (
    <SpecularButton
      size={size}
      radius={40}
      intensity={1}
      idleIntensity={0.35}
      shineSize={14}
      shineFade={40}
      thickness={1.5}
      glow={1.4}
      followMouse
      proximity={250}
      {...VARIANT_PROPS[variant]}
      className={className}
      {...rest}
    />
  );
}

export function ToastView({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, toast.type === 'error' ? 8000 : 4000);
    return () => clearTimeout(t);
  }, [toast, onClose]);
  if (!toast) return null;
  const ok = toast.type === 'success';
  return (
    <div role="status" className={`fixed top-5 left-1/2 z-50 flex max-w-[min(92vw,34rem)] -translate-x-1/2 items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg ${ok ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-950 dark:text-emerald-100' : 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/40 dark:bg-rose-950 dark:text-rose-100'}`}>
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
      <span className="whitespace-pre-wrap break-words">{toast.text}</span>
      <button onClick={onClose} aria-label="Dismiss" className="ml-1 cursor-pointer opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`flex max-h-[90vh] w-full flex-col rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900 ${wide ? 'max-w-3xl' : 'max-w-md'}`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-white/10">
          <h2 className="text-sm font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="cursor-pointer text-slate-500 hover:text-slate-900 dark:hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmModal({ title, message, confirmLabel, danger, busy, onConfirm, onClose }: {
  title: string; message: React.ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{message}</div>
      <div className="mt-5 flex justify-end gap-2">
        <ActionButton variant="secondary" onClick={onClose} disabled={busy}>Cancel</ActionButton>
        <ActionButton variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}{confirmLabel}
        </ActionButton>
      </div>
    </Modal>
  );
}

/**
 * The finished e-mail as it will actually be sent, rendered by the server with
 * the same code that sends mail (POST /api/preview) and shown in a sandboxed
 * frame. Re-renders (debounced) whenever the content changes.
 */
export function EmailPreview({ subject, body, bodyIsHtml, settings, className = 'h-[460px]' }: {
  subject: string; body: string; bodyIsHtml?: boolean; settings?: unknown; className?: string;
}) {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const settingsKey = JSON.stringify(settings ?? null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api<{ html: string }>('/api/preview', { subject, body, bodyIsHtml, settings: JSON.parse(settingsKey) ?? undefined });
        if (!cancelled) setHtml(data.html);
      } catch {
        if (!cancelled) setHtml('');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [subject, body, bodyIsHtml, settingsKey]);

  return (
    <div className="relative">
      <iframe title="Email preview" sandbox="" srcDoc={html} className={`w-full rounded-xl border border-slate-200 bg-white dark:border-white/10 ${className}`} />
      {loading && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-slate-400" />}
    </div>
  );
}

export function HtmlFrame({ html, className = 'h-[420px]' }: { html: string; className?: string }) {
  return <iframe title="Email" sandbox="" srcDoc={html} className={`w-full rounded-xl border border-slate-200 bg-white dark:border-white/10 ${className}`} />;
}
