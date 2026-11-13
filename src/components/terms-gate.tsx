'use client';

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ScrollText } from 'lucide-react';
import { APP_NAME, AUTHOR, CREDIT_LINE, TERMS_INTRO, TERMS_SECTIONS, TERMS_VERSION } from '@/lib/terms';

const STORAGE_KEY = 'mailer.termsAccepted';
const listeners = new Set<() => void>();

/** null = not read yet (server render / first paint), true / false afterwards. */
function readAccepted(): boolean {
  try { return window.localStorage.getItem(STORAGE_KEY) === TERMS_VERSION; } catch { return false; }
}
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => { listeners.delete(onChange); window.removeEventListener('storage', onChange); };
}
function accept() {
  // If storage is blocked the agreement still holds for this page load.
  try { window.localStorage.setItem(STORAGE_KEY, TERMS_VERSION); } catch { sessionAccepted = true; }
  listeners.forEach((l) => l());
}
let sessionAccepted = false;

function useAccepted(): boolean | null {
  return useSyncExternalStore(subscribe, () => readAccepted() || sessionAccepted, () => null);
}

function TermsDialog({ onAgree, onClose }: { onAgree?: () => void; onClose?: () => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [atEnd, setAtEnd] = useState(false);
  const readOnly = !onAgree;

  const check = useCallback(() => {
    const el = scroller.current;
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setAtEnd(true);
  }, []);
  // Short screens aside, the text overflows; if it somehow doesn't, there is nothing left to scroll.
  useEffect(() => { check(); }, [check]);
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="terms-title" className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-4 dark:border-white/10">
          <ScrollText className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <div>
            <h2 id="terms-title" className="text-base font-bold">Terms and Conditions</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{APP_NAME} · created by {AUTHOR}</p>
          </div>
        </div>

        <div ref={scroller} onScroll={check} tabIndex={0} aria-label="Terms and Conditions text" className="min-h-[200px] flex-1 space-y-5 overflow-y-auto px-6 py-5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          <p>{TERMS_INTRO}</p>
          {TERMS_SECTIONS.map((s) => (
            <section key={s.title}>
              <h3 className="mb-1.5 font-bold text-slate-900 dark:text-white">{s.title}</h3>
              <div className="space-y-2">{s.paragraphs.map((p, i) => <p key={i}>{p}</p>)}</div>
            </section>
          ))}
          <p className="border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
            {CREDIT_LINE} Created and developed by {AUTHOR}. Terms version {TERMS_VERSION}.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-6 py-4 dark:border-white/10">
          <p className="max-w-sm text-xs text-slate-500 dark:text-slate-400">
            {readOnly ? 'You have already agreed to these Terms.' : atEnd ? 'By pressing “I Agree” you accept these Terms and Conditions.' : 'Scroll to the end of the Terms to enable “I Agree”.'}
          </p>
          {readOnly ? (
            <button className="btn-primary" onClick={onClose}>Close</button>
          ) : (
            <button className="btn-primary" disabled={!atEnd} onClick={onAgree}>I Agree</button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Blocks the whole app behind the Terms and Conditions pop-up until the user
 * has scrolled to the end and pressed "I Agree". The agreement is remembered
 * in this browser for the current TERMS_VERSION; changing the text asks again.
 * Nothing is rendered behind the pop-up, so the app cannot be used first.
 */
export function TermsGate({ children }: { children: React.ReactNode }) {
  const accepted = useAccepted();
  if (accepted === null) return null;
  if (!accepted) return <TermsDialog onAgree={accept} />;
  return <>{children}</>;
}

/** Footer: the credit line and a link that reopens the Terms. */
export function AppFooter() {
  const [open, setOpen] = useState(false);
  return (
    <footer className="relative z-10 mx-auto max-w-6xl px-4 pb-8 pt-2 text-center text-xs text-slate-500 dark:text-slate-400">
      <p>
        {CREDIT_LINE} Created and developed by <strong className="font-semibold text-slate-700 dark:text-slate-200">{AUTHOR}</strong>.
      </p>
      <p className="mt-1">
        <button className="cursor-pointer font-semibold underline hover:text-amber-600 dark:hover:text-amber-400" onClick={() => setOpen(true)}>Terms and Conditions</button>
      </p>
      {open && <TermsDialog onClose={() => setOpen(false)} />}
    </footer>
  );
}
