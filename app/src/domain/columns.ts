/**
 * Columns of the task list (user review 2026-10-08): which are shown, their order and the width of each fixed
 * column, kept per browser in localStorage. "Công việc" is always shown and takes the remaining width.
 */
import type { CSSProperties } from 'react';

export type ColumnId = 'code' | 'main' | 'status' | 'reporter' | 'assignee' | 'priority' | 'due';

export interface ColumnDef {
  id: ColumnId;
  label: string;
  /** Default width (px); null = the flexible "Công việc" column. */
  width: number | null;
  min: number;
  max: number;
  /** "Công việc" cannot be hidden. */
  hideable: boolean;
}

export const COLUMNS: readonly ColumnDef[] = [
  { id: 'code', label: 'Mã', width: 76, min: 56, max: 200, hideable: true },
  { id: 'main', label: 'Công việc', width: null, min: 0, max: 0, hideable: false },
  { id: 'status', label: 'Trạng thái', width: 120, min: 96, max: 260, hideable: true },
  { id: 'reporter', label: 'Người giao', width: 88, min: 48, max: 240, hideable: true },
  { id: 'assignee', label: 'Giao cho', width: 88, min: 48, max: 240, hideable: true },
  { id: 'priority', label: 'Ưu tiên', width: 64, min: 44, max: 200, hideable: true },
  { id: 'due', label: 'Hạn chót', width: 84, min: 64, max: 240, hideable: true },
];

const BY_ID = new Map(COLUMNS.map(c => [c.id, c]));
export const columnDef = (id: ColumnId) => BY_ID.get(id)!;

export interface ColumnsState {
  order: ColumnId[];
  hidden: ColumnId[];
  widths: Partial<Record<ColumnId, number>>;
}

export const DEFAULT_COLUMNS: ColumnsState = { order: COLUMNS.map(c => c.id), hidden: [], widths: {} };

export const clampWidth = (id: ColumnId, w: number) => {
  const c = columnDef(id);
  return Math.min(c.max, Math.max(c.min, Math.round(w)));
};

/** Whatever was saved (another version, hand edits) → a complete, valid state. */
export function normalizeColumns(v: unknown): ColumnsState {
  if (!v || typeof v !== 'object') return DEFAULT_COLUMNS;
  const o = v as Record<string, unknown>;
  const known = (x: unknown): x is ColumnId => typeof x === 'string' && BY_ID.has(x as ColumnId);
  const order = Array.isArray(o.order) ? [...new Set(o.order.filter(known))] : [];
  // a column missing from what was saved goes right after the one before it by default (first: at the start)
  COLUMNS.forEach((c, i) => {
    if (order.includes(c.id)) return;
    const prev = i > 0 ? order.indexOf(COLUMNS[i - 1]!.id) : -1;
    order.splice(prev + 1, 0, c.id);
  });
  const hidden = Array.isArray(o.hidden) ? [...new Set(o.hidden.filter(known))].filter(id => columnDef(id).hideable) : [];
  const widths: ColumnsState['widths'] = {};
  if (o.widths && typeof o.widths === 'object')
    for (const [k, w] of Object.entries(o.widths as Record<string, unknown>))
      if (known(k) && columnDef(k).width !== null && typeof w === 'number' && Number.isFinite(w)) widths[k] = clampWidth(k, w);
  return { order, hidden, widths };
}

export const widthOf = (s: ColumnsState, id: ColumnId) => s.widths[id] ?? columnDef(id).width ?? 0;

export const visibleColumns = (s: ColumnsState) => s.order.filter(id => !s.hidden.includes(id));

/** Grid columns of the header and the cards: tick + the shown columns in order. */
export function gridTemplate(s: ColumnsState): string {
  return ['22px', ...visibleColumns(s).map(id => (id === 'main' ? 'minmax(0,1fr)' : `${widthOf(s, id)}px`))].join(' ');
}

/** CSS custom properties + `data-hide` shared by the header and the list (cards keep their DOM; CSS orders them). */
export function columnsStyle(s: ColumnsState): { style: CSSProperties; hide: string } {
  const style: Record<string, string> = { '--task-cols': gridTemplate(s) };
  s.order.forEach((id, i) => {
    style[`--o-${id}`] = String(i + 1);
  });
  return { style: style as CSSProperties, hide: s.hidden.join(' ') };
}

export function moveColumn(s: ColumnsState, id: ColumnId, by: -1 | 1): ColumnsState {
  const i = s.order.indexOf(id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= s.order.length) return s;
  const order = [...s.order];
  [order[i], order[j]] = [order[j]!, order[i]!];
  return { ...s, order };
}

export function toggleColumn(s: ColumnsState, id: ColumnId, shown: boolean): ColumnsState {
  if (!columnDef(id).hideable) return s;
  const hidden = shown ? s.hidden.filter(x => x !== id) : [...new Set([...s.hidden, id])];
  return { ...s, hidden };
}

export function setWidth(s: ColumnsState, id: ColumnId, w: number | null): ColumnsState {
  if (columnDef(id).width === null) return s;
  const widths = { ...s.widths };
  if (w === null) delete widths[id];
  else widths[id] = clampWidth(id, w);
  return { ...s, widths };
}
