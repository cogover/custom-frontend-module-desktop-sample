import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

export interface DragItem {
  kind: 'folder' | 'note';
  id: string;
  label: string;
}

/** The "Thư mục" header: dropping there puts the item at the top level. */
export const ROOT_DROP = '';

export interface DragState {
  item: DragItem;
  x: number;
  y: number;
  /** Folder id, ROOT_DROP, or undefined when nothing that takes a drop is under the pointer. */
  target: string | undefined;
  ok: boolean;
}

export interface TreeDragOptions {
  canDrop: (item: DragItem, folderId: string | null) => boolean;
  onDrop: (item: DragItem, folderId: string | null) => void;
  /** A folder hovered for a moment while dragging: unfold it, so the drop can go deeper. */
  onHoverFolder: (id: string) => void;
  /** The rail, scrolled while the pointer stays near its top or bottom edge. */
  scroller: () => HTMLElement | null;
}

const START_DISTANCE = 5;
export const HOVER_UNFOLD_MS = 700;
const EDGE = 40;
const SCROLL_STEP = 12;

/** The element under the pointer that takes drops (`data-drop`: a folder row's id, '' for the header). */
function dropAt(x: number, y: number): string | undefined {
  const el = document.elementFromPoint?.(x, y)?.closest<HTMLElement>('[data-drop]');
  return el?.dataset.drop;
}

/**
 * Drag and drop of the notes tree with pointer events (the rows keep their mousedown default prevented, so the
 * native HTML drag cannot start): a press moved 5px drags the row; the folder row (or the header) under the
 * pointer is the target; release drops, Esc cancels. The click that ends a drag does not open the row.
 */
export function useTreeDrag(options: TreeDragOptions) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const latest = useRef(options);
  latest.current = options;
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  const start = (e: ReactPointerEvent, item: DragItem) => {
    if (e.button !== 0 || e.pointerType === 'touch' || (e.target as HTMLElement).closest('input, button')) return;
    stop.current?.();
    const x0 = e.clientX;
    const y0 = e.clientY;
    let started = false;
    let state: DragState | null = null;
    let hovered: string | undefined;
    let hoverTimer = 0;

    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key, true);
      clearTimeout(hoverTimer);
      stop.current = null;
    };
    const move = (ev: PointerEvent) => {
      if (!started) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < START_DISTANCE) return;
        started = true;
      }
      const target = dropAt(ev.clientX, ev.clientY);
      const ok = target !== undefined && latest.current.canDrop(item, target === ROOT_DROP ? null : target);
      if (target !== hovered) {
        clearTimeout(hoverTimer);
        hovered = target;
        if (target) hoverTimer = window.setTimeout(() => latest.current.onHoverFolder(target), HOVER_UNFOLD_MS);
      }
      const rail = latest.current.scroller();
      if (rail) {
        const r = rail.getBoundingClientRect();
        if (ev.clientY < r.top + EDGE) rail.scrollTop -= SCROLL_STEP;
        else if (ev.clientY > r.bottom - EDGE) rail.scrollTop += SCROLL_STEP;
      }
      state = { item, x: ev.clientX, y: ev.clientY, target, ok };
      setDrag(state);
    };
    const up = () => {
      end();
      if (!started) return;
      const swallow = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener('click', swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      setDrag(null);
      if (state?.ok && state.target !== undefined) latest.current.onDrop(item, state.target === ROOT_DROP ? null : state.target);
    };
    const cancel = () => {
      end();
      setDrag(null);
    };
    const key = (ev: KeyboardEvent) => {
      if (!started || ev.key !== 'Escape') return;
      ev.preventDefault();
      ev.stopPropagation();
      cancel();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key, true);
    stop.current = end;
  };

  return { drag, start };
}
