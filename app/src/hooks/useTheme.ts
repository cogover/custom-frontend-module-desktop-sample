import { useCallback, useEffect, useState } from 'react';
import { STORAGE_KEYS } from '../config';
import { readStorage, writeStorage } from '../domain/storage';

export type Theme = 'light' | 'dark';

/** Fired on window when a window of the desktop switches the theme (the other windows update their button). */
const THEME_EVENT = 'cong-viec-theme';

export function storedTheme(): Theme | null {
  const t = readStorage(STORAGE_KEYS.theme);
  return t === 'dark' || t === 'light' ? t : null;
}

/** Applies the saved theme before React renders, so the page does not flash the other one. */
export function applyStoredTheme(root: HTMLElement = document.documentElement): void {
  const t = storedTheme();
  if (t) root.dataset.theme = t;
}

function systemQuery(): MediaQueryList | null {
  try {
    return typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  } catch {
    return null;
  }
}

export function currentTheme(root: HTMLElement = document.documentElement): Theme {
  const t = root.dataset.theme;
  if (t === 'dark' || t === 'light') return t;
  return systemQuery()?.matches ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => currentTheme());

  useEffect(() => {
    const mq = systemQuery();
    const sync = () => setTheme(currentTheme());
    mq?.addEventListener?.('change', sync);
    window.addEventListener(THEME_EVENT, sync);
    return () => {
      mq?.removeEventListener?.('change', sync);
      window.removeEventListener(THEME_EVENT, sync);
    };
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    writeStorage(STORAGE_KEYS.theme, next);
    setTheme(next);
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  return { theme, toggle };
}
