import { useRef } from 'react';
import { columnDef, columnsStyle, setWidth, visibleColumns, widthOf, type ColumnId, type ColumnsState } from '../domain/columns';

/**
 * Column headings of the list. Drag the line between two headings to change a width (double-click: default
 * width): the line after a fixed column sizes that column; the line after "Công việc" sizes the column after it.
 */
export function ListHead({ columns, onChange }: { columns: ColumnsState; onChange: (s: ColumnsState) => void }) {
  const shown = visibleColumns(columns);
  const { style, hide } = columnsStyle(columns);
  const drag = useRef<{ id: ColumnId; sign: 1 | -1; x: number; w: number } | null>(null);
  const latest = useRef(columns);
  latest.current = columns;

  // the column a boundary sizes: the one before it, or the one after when the one before is "Công việc"
  const target = (i: number): { id: ColumnId; sign: 1 | -1 } | null => {
    const before = shown[i]!;
    if (columnDef(before).width !== null) return { id: before, sign: 1 };
    const after = shown[i + 1];
    return after ? { id: after, sign: -1 } : null;
  };

  return (
    <div className="list-head" aria-hidden="true" style={style} data-hide={hide} data-testid="list-head">
      <span />
      {shown.map((id, i) => {
        const c = columnDef(id);
        const t = i < shown.length - 1 ? target(i) : null;
        return (
          <span key={id} className={`col-${id}`} data-col={id}>
            <span className="col-label">{c.label}</span>
            {t && (
              <span
                className="col-resize"
                data-testid={`col-resize-${id}`}
                onPointerDown={e => {
                  e.preventDefault();
                  try {
                    e.currentTarget.setPointerCapture(e.pointerId);
                  } catch {
                    // no active pointer (synthetic events): the drag still follows the moves over the handle
                  }
                  drag.current = { ...t, x: e.clientX, w: widthOf(latest.current, t.id) };
                }}
                onPointerMove={e => {
                  const d = drag.current;
                  if (!d) return;
                  onChange(setWidth(latest.current, d.id, d.w + d.sign * (e.clientX - d.x)));
                }}
                onPointerUp={() => {
                  drag.current = null;
                }}
                onPointerCancel={() => {
                  drag.current = null;
                }}
                onDoubleClick={() => onChange(setWidth(latest.current, t.id, null))}
              />
            )}
          </span>
        );
      })}
    </div>
  );
}
