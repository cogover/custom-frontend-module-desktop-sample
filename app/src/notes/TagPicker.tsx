import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '../api/client';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '../components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { fold } from '../domain/text';
import type { Ref } from './types';

interface TagPickerProps {
  value: Ref[];
  all: Ref[];
  onChange: (tags: Ref[]) => void;
  /** Creates a tag (`notes_tag`) for a name nobody used yet. */
  onCreate: (name: string) => Promise<Ref>;
}

/** Tags of a note: chips (× removes), "Thêm thẻ" opens a searchable list where a new name can be created. */
export function TagPicker({ value, all, onChange, onCreate }: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const q = query.trim();
  const options = all.filter(t => !value.some(v => v.id === t.id) && fold(t.name).includes(fold(q)));
  const exact = all.some(t => t.name.toLowerCase() === q.toLowerCase());

  const add = (tag: Ref) => {
    onChange([...value, tag]);
    setQuery('');
    setOpen(false);
  };
  const create = async () => {
    setError('');
    try {
      add(await onCreate(q));
    } catch (e) {
      setError(`Không tạo được thẻ: ${errorMessage(e)}`);
    }
  };

  return (
    <div className="tag-picker" data-testid="tag-picker">
      {value.map(t => (
        <span className="tag tag-chip" key={t.id} data-testid="tag-chip">
          #{t.name || t.id}
          <button type="button" aria-label={`Bỏ thẻ ${t.name}`} onClick={() => onChange(value.filter(v => v.id !== t.id))}>
            <X size={12} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </span>
      ))}
      <Popover
        open={open}
        onOpenChange={o => {
          setOpen(o);
          if (!o) setQuery('');
        }}
      >
        <PopoverTrigger asChild>
          <button type="button" className="tag-add" data-testid="tag-add">
            <Plus size={13} strokeWidth={2.2} aria-hidden="true" />
            Thêm thẻ
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Tìm hoặc tạo thẻ…" value={query} onValueChange={setQuery} data-testid="tag-search" />
            <CommandList>
              <CommandEmpty>{q ? 'Chưa có thẻ này' : 'Chưa có thẻ nào'}</CommandEmpty>
              {options.map(t => (
                <CommandItem key={t.id} value={t.id} onSelect={() => add(t)} data-testid="tag-option">
                  #{t.name}
                </CommandItem>
              ))}
              {q && !exact && (
                <CommandItem value={`__create__${q}`} onSelect={() => void create()} data-testid="tag-create">
                  Tạo thẻ “{q}”
                </CommandItem>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
