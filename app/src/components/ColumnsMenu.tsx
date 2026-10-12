import { Check, ChevronDown, ChevronUp, Columns3 } from 'lucide-react';
import { useState } from 'react';
import { columnDef, DEFAULT_COLUMNS, moveColumn, toggleColumn, type ColumnsState } from '../domain/columns';
import { cn } from '../lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

/** "Cột hiển thị": tick the columns to show, move them up / down; "Mặc định" also resets the widths. */
export function ColumnsMenu({ columns, onChange }: { columns: ColumnsState; onChange: (s: ColumnsState) => void }) {
  const [open, setOpen] = useState(false);
  const last = columns.order.length - 1;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="icon-btn list-tool" data-testid="list-columns" aria-label="Chọn cột hiển thị">
          <Columns3 size={16} strokeWidth={1.9} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end" data-testid="columns-menu">
        <p className="cols-title">Cột hiển thị</p>
        <ul className="cols-list" aria-label="Cột hiển thị và thứ tự">
          {columns.order.map((id, i) => {
            const c = columnDef(id);
            const on = !columns.hidden.includes(id);
            return (
              <li key={id} className="cols-row" data-testid="column-option" data-column={id} data-checked={on ? 'true' : 'false'}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-disabled={!c.hideable}
                  className="cols-toggle"
                  disabled={!c.hideable}
                  onClick={() => onChange(toggleColumn(columns, id, !on))}
                >
                  <span
                    className={cn('flex size-4 shrink-0 items-center justify-center rounded-[4px] border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}
                    aria-hidden="true"
                  >
                    {on && <Check className="size-3" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{c.label}</span>
                </button>
                <button
                  type="button"
                  className="icon-btn cols-move"
                  data-testid={`column-up-${id}`}
                  aria-label={`Đưa cột ${c.label} lên trước`}
                  disabled={i === 0}
                  onClick={() => onChange(moveColumn(columns, id, -1))}
                >
                  <ChevronUp size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="icon-btn cols-move"
                  data-testid={`column-down-${id}`}
                  aria-label={`Đưa cột ${c.label} ra sau`}
                  disabled={i === last}
                  onClick={() => onChange(moveColumn(columns, id, 1))}
                >
                  <ChevronDown size={15} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" className="btn-ghost cols-reset" data-testid="columns-reset" onClick={() => onChange(DEFAULT_COLUMNS)}>
          Mặc định (thứ tự, cột, độ rộng)
        </button>
      </PopoverContent>
    </Popover>
  );
}
