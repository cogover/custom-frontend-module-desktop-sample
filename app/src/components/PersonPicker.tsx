import { Check, ChevronsUpDown } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { personName } from '../domain/people';
import { fold } from '../domain/text';
import type { Person } from '../domain/types';
import type { PeopleDirectory } from '../hooks/usePeople';
import { cn } from '../lib/utils';
import { FIELD_H, fieldTriggerClass } from './fields';
import { Avatar } from './Person';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

interface PersonPickerProps {
  label: string;
  /** id of the visible label next to the field (the form lays labels out itself) */
  labelId: string;
  value: Person;
  me: Person;
  directory: PeopleDirectory;
  onChange: (p: Person) => void;
  testId: string;
  invalid?: boolean;
  describedBy?: string;
}

/** Accent-insensitive match for cmdk: "tran minh an" finds "Trần Minh An". */
export function personFilter(_value: string, search: string, keywords?: string[]): number {
  const q = fold(search.trim());
  if (!q) return 1;
  return fold((keywords ?? []).join(' ')).includes(q) ? 1 : 0;
}

/** shadcn Combobox (Popover + Command) to pick a personnel; keyboard: type, ↑/↓, Enter, Esc. */
export function PersonPicker({ label, labelId, value, me, directory, onChange, testId, invalid, describedBy }: PersonPickerProps) {
  const [open, setOpen] = useState(false);
  const uid = useId();
  const valueId = `${uid}-value`;

  const options = useMemo(() => {
    const seen = new Set<string>();
    const out: Person[] = [];
    for (const p of [me, value, ...directory.people]) {
      if (!p || seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
    return out;
  }, [me, value, directory.people]);

  const openChange = (next: boolean) => {
    setOpen(next);
    if (next) directory.ensure();
  };

  const name = personName(value) || value.id;

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(fieldTriggerClass, FIELD_H.compact, 'pl-2')}
          data-testid={testId}
          data-person-id={value.id}
          aria-labelledby={`${labelId} ${valueId}`}
          aria-invalid={invalid ? 'true' : undefined}
          aria-describedby={describedBy}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <Avatar person={value} />
            <span className="truncate" id={valueId}>
              {name}
              {value.id === me.id && <span className="opt"> (tôi)</span>}
            </span>
          </span>
          <ChevronsUpDown className="size-4 opacity-50" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-60 p-0" align="start">
        <Command filter={personFilter} label={label}>
          <CommandInput placeholder="Tìm theo tên…" aria-label={`Tìm ${label.toLowerCase()}`} />
          <CommandList>
            <CommandEmpty>
              {directory.status === 'loading' ? 'Đang tải danh sách nhân sự…' : 'Không tìm thấy người phù hợp'}
            </CommandEmpty>
            <CommandGroup>
              {options.map(p => (
                <CommandItem
                  key={p.id}
                  value={p.id}
                  keywords={[personName(p) || p.id]}
                  data-testid="person-option"
                  data-person-id={p.id}
                  onSelect={() => {
                    onChange(p);
                    setOpen(false);
                  }}
                >
                  <Avatar person={p} />
                  <span className="min-w-0 flex-1 truncate">
                    {personName(p) || p.id}
                    {p.id === me.id && <span className="opt"> (tôi)</span>}
                  </span>
                  <Check className={cn('size-4 text-primary', p.id === value.id ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                </CommandItem>
              ))}
            </CommandGroup>
            {directory.status === 'loading' && options.length > 0 && (
              <p className="px-3 py-2 text-sm text-muted-foreground">Đang tải danh sách nhân sự…</p>
            )}
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
