import { useCallback, useEffect, useRef, useState } from 'react';
import { TOAST_ACTION_MS, TOAST_MS } from '../config';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface ToastState {
  id: number;
  message: string;
  action?: ToastAction;
}

let seq = 0;

/** One toast at a time (a new one replaces the current one), like the design mock. */
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setToast(null);
  }, []);

  const show = useCallback((message: string, action?: ToastAction, duration?: number) => {
    clearTimeout(timer.current);
    const id = ++seq;
    setToast({ id, message, action });
    timer.current = setTimeout(
      () => setToast(cur => (cur?.id === id ? null : cur)),
      duration ?? (action ? TOAST_ACTION_MS : TOAST_MS),
    );
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { toast, show, hide };
}
