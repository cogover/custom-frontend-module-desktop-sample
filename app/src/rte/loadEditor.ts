/**
 * The Plate editor lives in its own chunk: it is fetched while the browser is idle after the first
 * page load, so opening "Tạo công việc" / "Sửa" does not wait for it (CONTRACT §5.3).
 */
type EditorModule = typeof import('./RichTextEditor');

let loaded: EditorModule | null = null;
let pending: Promise<EditorModule> | null = null;

export function loadEditor(): Promise<EditorModule> {
  pending ??= import('./RichTextEditor').then(
    m => (loaded = m),
    err => {
      pending = null; // a failed download can be retried on the next open
      throw err;
    },
  );
  return pending;
}

/** The editor module once downloaded (render it straight away, no loading state). */
export const loadedEditor = () => loaded;

type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };

/** Downloads the editor when the browser has nothing better to do. */
export function prefetchEditorWhenIdle(win: IdleWindow = window) {
  if (loaded || pending) return;
  const run = () => void loadEditor().catch(() => {});
  if (win.requestIdleCallback) win.requestIdleCallback(run, { timeout: 4000 });
  else win.setTimeout(run, 1500);
}
