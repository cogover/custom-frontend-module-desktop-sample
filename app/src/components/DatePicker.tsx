import { CalendarDays, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { vnIsoDate } from '../domain/dates';
import { cn } from '../lib/utils';
import { FIELD_H, fieldTriggerClass } from './fields';
import { Calendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "YYYY-MM-DD" (a Vietnamese calendar day) → local Date of that day, for the calendar grid. */
export function isoToLocalDate(iso: string): Date | undefined {
  const m = ISO.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
}

/** Local Date picked in the calendar → "YYYY-MM-DD". */
export function localDateToIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "YYYY-MM-DD" → "dd/MM/yyyy" shown on the button. */
export function isoToDisplay(iso: string): string {
  const m = ISO.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

interface DatePickerProps {
  value: string;
  onChange: (iso: string) => void;
  testId: string;
  /** Accessible name prefix, e.g. "Ngày hạn chót" → "Ngày hạn chót: 02/10/2026". */
  label: string;
  id?: string;
  size?: 'default' | 'sm' | 'compact';
  /** Offer "Xoá ngày" (filters); the task deadline is required. */
  clearable?: boolean;
  invalid?: boolean;
  describedBy?: string;
  placeholder?: string;
  className?: string;
}

/** shadcn Date Picker: Popover + Calendar. Days are Vietnamese calendar days (UTC+7, CONTRACT §5). */
export function DatePicker({
  value,
  onChange,
  testId,
  label,
  id,
  size = 'default',
  clearable = false,
  invalid,
  describedBy,
  placeholder = 'Chọn ngày',
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = isoToLocalDate(value);
  const today = isoToLocalDate(vnIsoDate(Date.now()));
  const display = isoToDisplay(value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          data-testid={testId}
          data-value={value}
          aria-label={display ? `${label}: ${display}` : label}
          aria-invalid={invalid ? 'true' : undefined}
          aria-describedby={describedBy}
          className={cn(fieldTriggerClass, FIELD_H[size], size === 'compact' && 'w-auto gap-3', !display && 'text-muted-foreground', className)}
        >
          <span className="flex items-center gap-2">
            <CalendarDays className={size === 'sm' ? 'size-3.5 text-muted-foreground' : 'size-4 text-muted-foreground'} aria-hidden="true" />
            {display || placeholder}
          </span>
          <ChevronDown className="size-4 opacity-50" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align="start"
        data-testid="calendar"
        onOpenAutoFocus={e => {
          // focus the selected day (else today) so ←/→/↑/↓ and Enter work at once; done here, once the
          // popover's focus scope is active (a DayPicker autoFocus would be pulled back by the dialog's trap)
          e.preventDefault();
          const root = e.currentTarget as HTMLElement;
          const day =
            root.querySelector<HTMLElement>('button[data-selected-single="true"]') ??
            root.querySelector<HTMLElement>('.rdp-today button') ??
            root.querySelector<HTMLElement>('button[data-day]');
          day?.focus();
        }}
      >
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? today}
          today={today}
          onSelect={d => {
            if (d) onChange(localDateToIso(d));
            setOpen(false);
          }}
        />
        {clearable && value && (
          <div className="border-t px-3 py-2 text-right">
            <button
              type="button"
              className="link-btn text-sm"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
            >
              Xoá ngày
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
