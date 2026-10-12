import { useLayoutEffect, useRef } from 'react';
import { useMobileScrollLock } from './useScrollLock';

/**
 * Shared behaviour of the small confirmation boxes opened over the task popup (Radix AlertDialog from state):
 *
 * - Esc belongs to the box from the moment it is on screen. Radix (DismissableLayer) moves its document Esc
 *   listener to the newest layer only in a later, lower-priority render, so an Esc pressed right after the box
 *   opened over the task popup used to reach the popup and close *it*. Taking Esc on window in the capture
 *   phase runs before every document listener, independent of that timing.
 * - Radix returns focus to an AlertDialog.Trigger, which these boxes have none of: remember what had focus when
 *   the box opened and go back there (returns the `onCloseAutoFocus` handler for AlertDialog.Content).
 *   Nothing focused then (a button that went disabled while saving, e.g. the form's "Lưu") → `fallback`; a button
 *   still disabled when the box closes gets the focus as soon as it is enabled again.
 */
export function useConfirmLayer(open: boolean, busy: boolean, onCancel: () => void, fallback?: HTMLElement | null) {
  useMobileScrollLock(open);
  const returnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const el = document.activeElement;
    returnFocus.current = el instanceof HTMLElement && el !== document.body ? el : (fallback ?? null);
  }, [open, fallback]);

  const latest = useRef({ busy, onCancel });
  useLayoutEffect(() => {
    latest.current = { busy, onCancel };
  });
  useLayoutEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (!latest.current.busy) latest.current.onCancel();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  return (e: Event) => {
    e.preventDefault();
    const el = returnFocus.current;
    returnFocus.current = null;
    focusWhenReady(el);
  };
}

/** Focuses `el` now, or once it is enabled again (a few timer ticks); gone (e.g. after a delete) → nothing. */
function focusWhenReady(el: HTMLElement | null, tries = 5) {
  if (!el?.isConnected) return;
  if (!(el as HTMLButtonElement).disabled) {
    el.focus();
    return;
  }
  if (tries > 0) window.setTimeout(() => focusWhenReady(el, tries - 1), 0);
}
