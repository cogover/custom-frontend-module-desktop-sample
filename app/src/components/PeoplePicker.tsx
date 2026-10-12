import { Check, ChevronsUpDown } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { personName } from '../domain/people';
import { samePeople } from '../domain/task';
import type { Person } from '../domain/types';
import type { PeopleDirectory } from '../hooks/usePeople';
import { cn } from '../lib/utils';
import { FIELD_H, fieldTriggerClass } from './fields';
import { PeopleStack } from './Person';
import { personFilter } from './PersonPicker';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

interface PeoplePickerProps {
  label: string;
  labelId: string;
  value: Person[];
  me: Person;
  directory: PeopleDirectory;
  /** Called once, when the list closes, if the selection changed. */
  onChange: (people: Person[]) => void;
  testId: string;
  /** Shown when nobody is picked. */
  emptyLabel?: string;
}

/**
 * Several personnel in one combobox (followers): the list stays open while people are ticked or
 * unticked; closing it hands the new selection over (one save instead of one per click).
 */
export function PeoplePicker({ label, labelId, value, me, directory, onChange, testId, emptyLabel = 'Không có' }: PeoplePickerProps) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Person[]>(value);
  const pickedRef = useRef(picked);
  pickedRef.current = picked;

  const options = useMemo(() => {
    const seen = new Set<string>();
    const out: Person[] = [];
    for (const p of [me, ...value, ...directory.people]) {
      if (!p || seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
    return out;
  }, [me, value, directory.people]);

  const openChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      directory.ensure();
      setPicked(value);
    } else if (!samePeople(pickedRef.current, value)) onChange(pickedRef.current);
  };
  const toggle = (p: Person) => setPicked(list => (list.some(q => q.id === p.id) ? list.filter(q => q.id !== p.id) : [...list, p]));
  const shown = open ? picked : value;

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(fieldTriggerClass, FIELD_H.compact, 'w-auto max-w-full pl-2')}
          data-testid={testId}
          data-count={value.length}
          aria-labelledby={labelId}
        >
          <span className="flex min-w-0 items-center">
            {shown.length ? <PeopleStack people={shown} role={label} /> : <span className="muted px-1">{emptyLabel}</span>}
          </span>
          <ChevronsUpDown className="size-4 opacity-50" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command filter={personFilter} label={label}>
          <CommandInput placeholder="Tìm theo tên…" aria-label={`Tìm ${label.toLowerCase()}`} />
          <CommandList>
            <CommandEmpty>{directory.status === 'loading' ? 'Đang tải danh sách nhân sự…' : 'Không tìm thấy người phù hợp'}</CommandEmpty>
            <CommandGroup>
              {options.map(p => {
                const on = picked.some(q => q.id === p.id);
                return (
                  <CommandItem
                    key={p.id}
                    value={p.id}
                    keywords={[personName(p) || p.id]}
                    data-testid="person-option"
                    data-person-id={p.id}
                    data-checked={on ? 'true' : 'false'}
                    aria-checked={on}
                    onSelect={() => toggle(p)}
                  >
                    <span
                      className={cn('flex size-4 shrink-0 items-center justify-center rounded-[4px] border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}
                      aria-hidden="true"
                    >
                      {on && <Check className="size-3" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {personName(p) || p.id}
                      {p.id === me.id && <span className="opt"> (tôi)</span>}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {directory.status === 'error' && (
              <p className="px-3 py-2 text-sm text-destructive">
                Không tải được danh sách nhân sự.{' '}
                <button type="button" className="link-btn" onClick={() => directory.ensure()}>
                  Thử lại
                </button>
              </p>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
