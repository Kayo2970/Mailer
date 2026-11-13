'use client';

import { useEffect, useSyncExternalStore } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'mailer.theme.v1';
const THEME_CHANGE_EVENT = 'mailer-theme-change';
const DYNAMIC_FAVICON_ATTR = 'data-mailer-theme-favicon';

function parseThemePreference(raw: string | null): ThemePreference {
  if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  return 'system';
}

function subscribePreference(onChange: () => void): () => void {
  const onCustom = () => onChange();
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === THEME_STORAGE_KEY) onChange();
  };
  window.addEventListener(THEME_CHANGE_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}

function getPreferenceSnapshot(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

function getPreferenceServerSnapshot(): ThemePreference {
  return 'system';
}

function subscribeSystemDark(onChange: () => void): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function getSystemDarkSnapshot(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function getSystemDarkServerSnapshot(): boolean {
  return false;
}

/**
 * Sync the `.dark` class on `<html>` and switch the browser favicon when an
 * explicit light/dark theme is selected (falling back to OS media queries
 * when `preference === 'system'`).
 */
export function applyDocumentTheme(preference: ThemePreference, systemDark: boolean): boolean {
  const isDark = preference === 'dark' || (preference === 'system' && systemDark);
  const root = document.documentElement;
  root.classList.toggle('dark', isDark);
  root.dataset.theme = isDark ? 'dark' : 'light';

  const existing = document.head.querySelector(`link[${DYNAMIC_FAVICON_ATTR}]`) as HTMLLinkElement | null;
  if (preference === 'system') {
    existing?.remove();
  } else {
    const href = isDark ? '/icon-dark.svg' : '/icon-light.svg';
    const link = existing ?? document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    link.setAttribute(DYNAMIC_FAVICON_ATTR, 'true');
    if (link.getAttribute('href') !== href) link.href = href;
    if (!existing) document.head.appendChild(link);
  }

  return isDark;
}

/** Persist a theme preference and notify all mounted listeners immediately. */
export function setThemePreference(next: ThemePreference): void {
  try {
    if (next === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Ignore storage errors (e.g. private browsing restrictions)
  }
  const systemDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (typeof document !== 'undefined') applyDocumentTheme(next, systemDark);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

/** React hook returning the active theme preference, resolved `darkMode` boolean, and setter. */
export function useTheme() {
  const preference = useSyncExternalStore(
    subscribePreference,
    getPreferenceSnapshot,
    getPreferenceServerSnapshot
  );
  const systemDark = useSyncExternalStore(
    subscribeSystemDark,
    getSystemDarkSnapshot,
    getSystemDarkServerSnapshot
  );

  const darkMode = preference === 'dark' || (preference === 'system' && systemDark);

  useEffect(() => {
    applyDocumentTheme(preference, systemDark);
  }, [preference, systemDark]);

  return {
    preference,
    darkMode,
    resolvedTheme: (darkMode ? 'dark' : 'light') as 'light' | 'dark',
    setTheme: setThemePreference,
  };
}

