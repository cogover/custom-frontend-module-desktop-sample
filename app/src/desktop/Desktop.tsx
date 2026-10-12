import { Suspense, useCallback, useEffect, useState } from 'react';
import { LoadingState } from '../components/StateBox';
import { STORAGE_KEYS } from '../config';
import { readStorage, writeStorage } from '../domain/storage';
import { useStartWallpaper } from '../settings/useWallpaper';
import { DOCK_APPS, type DockApp } from './apps';
import { Dock } from './Dock';
import { preloadWhenIdle } from './lazyWindow';
import { appFromUrl, appOfHash, clearWindowUrl } from './url';
import { WindowControls, type WindowApi } from './WindowControls';

type WindowState = 'open' | 'minimized' | 'closed';

const loadMaximized = () => readStorage(STORAGE_KEYS.window) === 'max';
const WINDOW_APPS = DOCK_APPS.filter(a => a.window);
const WINDOW_IDS = WINDOW_APPS.map(a => a.id);

/** The app of the URL opens at start (an item link, else `?app=`, else Công việc); the others wait in the dock. */
function initialWindows(): Record<string, WindowState> {
  const first = appFromUrl(WINDOW_IDS);
  return Object.fromEntries(WINDOW_APPS.map(a => [a.id, a.id === first ? 'open' : 'closed']));
}

/**
 * Shown while a lazy window's chunk downloads: the window itself — buttons, the app's name, an empty top bar —
 * with the loading box the app shows next, so nothing jumps when the app takes over.
 */
function WindowLoading({ app, win }: { app: DockApp; win: WindowApi }) {
  const icon = app.icon && typeof app.icon === 'object' && 'src' in app.icon ? <img src={app.icon.src} alt="" /> : app.icon;
  return (
    <div className="page" hidden={win.hidden} data-testid="window-frame">
      <main className="board">
        <aside className="side has-traffic">
          <WindowControls win={win} />
          <h1 className="brand">
            <span className="logo window-logo" style={{ background: app.background }} aria-hidden="true">
              {icon}
            </span>
            {app.name}
          </h1>
        </aside>
        <div className="content">
          <header className="topbar">
            <span className="topbar-spacer" />
          </header>
          <div className="scroller">
            <LoadingState text={app.loading} testId="window-loading" />
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * macOS-like desktop: a dock on the left and one window per app of this SPA (Công việc, Ghi chú, Cài đặt).
 * One window shows at a time: opening an app minimises the one in front (its shortcuts then stop, as for a
 * minimised window). Close unmounts the window (opening it again starts fresh and reloads the data); minimise
 * only hides it (everything kept); the green button fills the whole page and is remembered for every window.
 */
export function Desktop() {
  const [windows, setWindows] = useState(initialWindows);
  const [maximized, setMaximized] = useState(loadMaximized);
  const [runs, setRuns] = useState<Record<string, number>>({}); // new key after a close: a fresh window next time
  useStartWallpaper(); // my wallpaper behind the windows (CONTRACT §10)
  // the other windows' code comes while the page is idle: their first opening after a refresh does not wait
  useEffect(() => preloadWhenIdle(WINDOW_APPS.flatMap(a => (a.preload ? [a.preload] : []))), []);

  const bringToFront = useCallback((id: string) => {
    setWindows(w => {
      const next: Record<string, WindowState> = { ...w };
      for (const k of Object.keys(next)) if (k !== id && next[k] === 'open') next[k] = 'minimized';
      next[id] = 'open';
      return next;
    });
  }, []);
  const close = useCallback((id: string) => {
    clearWindowUrl(id);
    setWindows(w => ({ ...w, [id]: 'closed' }));
    setRuns(r => ({ ...r, [id]: (r[id] ?? 0) + 1 }));
  }, []);
  const minimize = useCallback((id: string) => setWindows(w => ({ ...w, [id]: 'minimized' })), []);
  const onToggleMax = useCallback(() => {
    setMaximized(m => {
      writeStorage(STORAGE_KEYS.window, m ? 'normal' : 'max');
      return !m;
    });
  }, []);

  // an item link (#/note/…, #/task/…) followed while its window is closed or behind
  useEffect(() => {
    const onHash = () => {
      const id = appOfHash(window.location.hash);
      if (id) bringToFront(id);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [bringToFront]);

  const openApp = (app: DockApp) => {
    if (app.window) {
      bringToFront(app.id);
      return;
    }
    if (!app.href) return;
    if (app.newTab) window.open(app.href, '_blank', 'noopener');
    else window.location.assign(app.href);
  };

  const front = WINDOW_APPS.find(a => windows[a.id] === 'open')?.id ?? null;
  const anyMinimized = WINDOW_APPS.some(a => windows[a.id] === 'minimized');
  const state: WindowState = front ? 'open' : anyMinimized ? 'minimized' : 'closed';
  const full = maximized && front !== null;
  const running = WINDOW_APPS.filter(a => windows[a.id] !== 'closed').map(a => a.id);

  const winFor = (id: string): WindowApi => ({
    maximized,
    hidden: windows[id] !== 'open',
    onClose: () => close(id),
    onMinimize: () => minimize(id),
    onToggleMax,
  });

  return (
    <div className="desktop" data-max={full || undefined} data-window={state} data-front={front ?? undefined}>
      {/* the full window covers the whole page, dock included (like a macOS full-screen app) */}
      {!full && <Dock apps={DOCK_APPS} running={running} onOpen={openApp} />}
      {WINDOW_APPS.map(app => {
        if (windows[app.id] === 'closed') return null;
        const Win = app.window!;
        return (
          <Suspense key={`${app.id}-${runs[app.id] ?? 0}`} fallback={<WindowLoading app={app} win={winFor(app.id)} />}>
            <Win win={winFor(app.id)} />
          </Suspense>
        );
      })}
    </div>
  );
}
