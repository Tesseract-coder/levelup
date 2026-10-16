import { useEffect } from 'react';
import type { Settings } from '@/db/types';

/** Applies the theme setting to <html data-theme>. "system" removes the attribute so the media query decides. */
export function useApplyTheme(theme: Settings['theme']) {
  useEffect(() => {
    const el = document.documentElement;
    if (theme === 'system') delete el.dataset.theme;
    else el.dataset.theme = theme;
    try {
      localStorage.setItem('levelup-theme', theme);
    } catch {
      /* storage blocked */
    }
    const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#0f1016' : '#f7f7fb'));
  }, [theme]);
}
