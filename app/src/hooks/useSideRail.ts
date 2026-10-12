import { useCallback, useEffect, useRef, useState } from 'react';
import { SIDE_WIDTH, STORAGE_KEYS } from '../config';
import { readStorage, writeStorage } from '../domain/storage';

export interface SideState {
  width: number;
  hidden: boolean;
}

const DESKTOP = '(min-width: 881px)';

export const clampSideWidth = (w: number) => Math.min(SIDE_WIDTH.max, Math.max(SIDE_WIDTH.min, Math.round(w)));

export interface SideOptions {
  /** localStorage key of `{ width, hidden }` (each app of the desktop keeps its own). */
  storageKey?: string;
  /** Width before any drag, and after a double-click on the handle. */
  defaultWidth?: number;
}

/** The saved rail; anything odd → defaults (`Number(null)` is 0, which would clamp to the minimum). */
export function loadSide(storageKey: string = STORAGE_KEYS.side, defaultWidth: number = SIDE_WIDTH.def): SideState {
  try {
    const v = JSON.parse(readStorage(storageKey) ?? 'null') as Partial<SideState> | null;
    const width = v && typeof v.width === 'number' && Number.isFinite(v.width) ? clampSideWidth(v.width) : defaultWidth;
    return { width, hidden: !!v && v.hidden === true };
  } catch {
    return { width: defaultWidth, hidden: false };
  }
}

const desktopNow = () => (typeof window.matchMedia === 'function' ? window.matchMedia(DESKTOP).matches : true);

/**
 * The left rail on desktop (CONTRACT §5 1d): its width (drag / keys on the handle) and whether it is hidden
 * (button or ⌘/Ctrl+\). Phones and tablets (≤ 880px) ignore both: the rail folds to the top there as before.
 */
export function useSideRail(shortcutEnabled = true, { storageKey = STORAGE_KEYS.side, defaultWidth = SIDE_WIDTH.def }: SideOptions = {}) {
  const [side, setSide] = useState<SideState>(() => loadSide(storageKey, defaultWidth));
  const saveSide = useCallback((s: SideState) => writeStorage(storageKey, JSON.stringify(s)), [storageKey]);
  const [desktop, setDesktop] = useState(desktopNow);
  const refocus = useRef(false);
  const latest = useRef({ side, desktop, shortcutEnabled });
  latest.current = { side, desktop, shortcutEnabled };

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(DESKTOP);
    const onChange = () => setDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  /** Width in px; `save` once the drag ends (not on every move) or after each key. */
  const setWidth = useCallback((w: number, save = true) => {
    const next = { ...latest.current.side, width: clampSideWidth(w) };
    setSide(next);
    if (save) saveSide(next);
  }, [saveSide]);

  const toggle = useCallback(() => {
    // the button moves between the rail and the top bar: keep the focus on it when it (or the rail) had it
    const el = document.activeElement;
    refocus.current = !!el && (!!el.closest('[data-testid="side-toggle"]') || !!el.closest('.side'));
    const next = { ...latest.current.side, hidden: !latest.current.side.hidden };
    setSide(next);
    saveSide(next);
  }, [saveSide]);

  const hidden = side.hidden && desktop;
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    // several windows can be mounted (one shown): the toggle of the visible one
    const toggles = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="side-toggle"]'));
    (toggles.find(el => !el.closest('[hidden]')) ?? toggles[0])?.focus();
  }, [hidden]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key !== '\\') return;
      if (!latest.current.desktop || !latest.current.shortcutEnabled) return;
      e.preventDefault();
      toggle();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggle]);

  return { width: side.width, hidden, desktop, setWidth, toggle, defaultWidth };
}
