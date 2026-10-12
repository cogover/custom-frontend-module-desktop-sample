import { useEffect } from 'react';

/** ≤880px: the board stacks and the whole page scrolls (same breakpoint as the CSS). */
export function isNarrowViewport(): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 880px)').matches;
  } catch {
    return false;
  }
}

/**
 * Keeps the page behind a popup still on phones (html.locked, like the design). Desktop never needs
 * it (only the list scrolls) and changing <body>/<html> styles there would repaint the whole page.
 */
export function useMobileScrollLock(active: boolean) {
  useEffect(() => {
    if (!active || !isNarrowViewport()) return;
    const root = document.documentElement;
    root.classList.add('locked');
    return () => root.classList.remove('locked');
  }, [active]);
}
