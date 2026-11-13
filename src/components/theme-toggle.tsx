'use client';

import React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { type ThemePreference, useTheme } from '@/lib/theme';

const OPTIONS: { id: ThemePreference; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'light', label: 'Light mode', Icon: Sun },
  { id: 'dark', label: 'Dark mode', Icon: Moon },
  { id: 'system', label: 'Match system theme', Icon: Monitor },
];

/** Compact Light / Dark / System theme switcher styled to sit alongside PillNav. */
export function ThemeToggle() {
  const { preference, setTheme } = useTheme();

  return (
    <div
      role="group"
      aria-label="Color theme"
      className="inline-flex h-[42px] items-center gap-0.5 rounded-full border border-slate-200/80 bg-white/95 p-[3px] shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/90"
    >
      {OPTIONS.map(({ id, label, Icon }) => {
        const active = preference === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setTheme(id)}
            aria-label={label}
            aria-pressed={active}
            title={label}
            className={`inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition ${
              active
                ? 'bg-gradient-to-br from-amber-300 via-amber-400 to-amber-500 text-amber-950 shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
            }`}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}

