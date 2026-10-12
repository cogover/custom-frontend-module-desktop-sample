import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { FIELD_H } from './fields';
import { cn } from '../lib/utils';

/** 00:00, 00:30 … 23:30 */
export const HALF_HOURS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

/** Half-hour slots, plus the current value when it is not on a slot (e.g. 14:28 set elsewhere). */
export function timeOptions(current: string): string[] {
  return current && !HALF_HOURS.includes(current) ? [...HALF_HOURS, current].sort() : HALF_HOURS;
}

interface TimeSelectProps {
  value: string;
  onChange: (v: string) => void;
  testId: string;
  id?: string;
  invalid?: boolean;
  describedBy?: string;
}

export function TimeSelect({ value, onChange, testId, id, invalid, describedBy }: TimeSelectProps) {
  // the 48 slots are only rendered while the list is open (a closed Radix Select renders every item)
  const [open, setOpen] = useState(false);
  return (
    <Select value={value || undefined} onValueChange={onChange} open={open} onOpenChange={setOpen}>
      <SelectTrigger
        id={id}
        data-testid={testId}
        aria-label="Giờ hạn chót"
        aria-invalid={invalid ? 'true' : undefined}
        aria-describedby={describedBy}
        className={cn('w-[92px]', FIELD_H.compact)}
      >
        <SelectValue placeholder="Giờ">{value}</SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {open &&
          timeOptions(value).map(t => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}
