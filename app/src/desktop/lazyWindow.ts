import { lazy, type ComponentType } from 'react';

type Module<P> = { default: ComponentType<P> };
type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };

/**
 * A desktop window in its own chunk (React.lazy) that can be fetched beforehand: once `preload` has finished,
 * opening the window renders it at once, without the loading frame. A failed download is retried next time.
 */
export function lazyWindow<P>(load: () => Promise<Module<P>>) {
  let loaded: Module<P> | null = null;
  let pending: Promise<Module<P>> | null = null;
  const preload = () =>
    (pending ??= load().then(
      m => (loaded = m),
      err => {
        pending = null;
        throw err;
      },
    ));
  // a chunk already there is handed over synchronously, so React does not suspend
  const Window = lazy(() => (loaded ? ({ then: (ok: (m: Module<P>) => void) => ok(loaded!) } as unknown as Promise<Module<P>>) : preload()));
  return Object.assign(Window, { preload });
}

/** Fetches the windows' chunks when the browser has nothing better to do after the page load. */
export function preloadWhenIdle(preloads: readonly (() => Promise<unknown>)[], win: IdleWindow = window) {
  if (!preloads.length) return;
  const run = () => preloads.forEach(p => void p().catch(() => {}));
  if (win.requestIdleCallback) win.requestIdleCallback(run, { timeout: 5000 });
  else win.setTimeout(run, 2000);
}
