import { Check } from 'lucide-react';
import { useState } from 'react';
import { PERSON_RELS, type PersonRel, type ReporterCount } from '../domain/filters';
import { cn } from '../lib/utils';
import { Avatar } from './Person';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

const REL_LABEL: Record<PersonRel, (short: string) => string> = {
  reporter: s => `Việc ${s} giao`,
  assignee: s => `Việc giao cho ${s}`,
  cc: s => `Việc ${s} theo dõi`,
};

interface PersonChipProps {
  chip: ReporterCount;
  /** Relations ticked for this person (empty: not filtering by them). */
  rels: readonly PersonRel[];
  onToggle: (rel: PersonRel, on: boolean) => void;
  onClear: () => void;
}

/** A reporter chip of the list bar: click to filter the list by that person (as reporter / assignee / follower). */
export function PersonChip({ chip, rels, onToggle, onClear }: PersonChipProps) {
  const [open, setOpen] = useState(false);
  const on = rels.length > 0;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="pchip"
          data-testid="person-chip"
          data-person-id={chip.id}
          data-on={on ? 'true' : undefined}
          data-rels={rels.join(' ')}
          aria-label={`${chip.name}: giao ${chip.count} việc. Lọc theo người này`}
        >
          <Avatar person={chip.person} />
          {chip.short} · {chip.count}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-2" align="end" data-testid="person-filter">
        <p className="cols-title">{chip.name}</p>
        <ul className="cols-list" aria-label={`Lọc theo ${chip.name}`}>
          {PERSON_RELS.map(rel => {
            const ticked = rels.includes(rel);
            return (
              <li key={rel}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={ticked}
                  className="cols-toggle w-full"
                  data-testid={`person-rel-${rel}`}
                  data-checked={ticked ? 'true' : 'false'}
                  onClick={() => onToggle(rel, !ticked)}
                >
                  <span
                    className={cn('flex size-4 shrink-0 items-center justify-center rounded-[4px] border', ticked ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}
                    aria-hidden="true"
                  >
                    {ticked && <Check className="size-3" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{REL_LABEL[rel](chip.short)}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {on && (
          <button
            type="button"
            className="btn-ghost cols-reset"
            data-testid="person-filter-clear"
            onClick={() => {
              onClear();
              setOpen(false);
            }}
          >
            Bỏ lọc người này
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
