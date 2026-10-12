import { RefreshCw } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { PeopleFilter, PersonRel, ReporterCount } from '../domain/filters';
import type { Person } from '../domain/types';
import { PersonChip } from './PersonChip';

const MAX_CHIPS = 6;

interface ListBarProps {
  title: string;
  countText: string;
  reporters: ReporterCount[] | null;
  /** "Làm mới" (absent: no button). */
  onRefresh?: () => Promise<void>;
  /** Extra buttons before "Làm mới" (the columns menu). */
  tools?: ReactNode;
  /** People ticked on the chips (filter of the list). */
  people?: PeopleFilter;
  onPersonRel?: (person: Person, rel: PersonRel, on: boolean) => void;
  onPersonClear?: (person: Person) => void;
}

const NO_PEOPLE: PeopleFilter = {};

export function ListBar({ title, countText, reporters, onRefresh, tools, people = NO_PEOPLE, onPersonRel, onPersonClear }: ListBarProps) {
  const [refreshing, setRefreshing] = useState(false);
  // the first chips, plus anyone further down who is ticked (their chip must stay reachable)
  const isShown = (r: ReporterCount, i: number) => i < MAX_CHIPS || r.id in people;
  const shown = reporters?.filter(isShown) ?? [];
  const rest = reporters ? reporters.filter((r, i) => !isShown(r, i)) : [];
  const restCount = rest.reduce((n, r) => n + r.count, 0);
  return (
    <div className="list-bar">
      <div className="list-heading">
        <h1 id="list-title" data-testid="list-title">
          {title}
        </h1>
        <span className="list-count" data-testid="list-count">
          {countText}
        </span>
      </div>
      <div className="list-bar-side">
        {tools}
        {onRefresh && (
          <button
            type="button"
            className="icon-btn list-tool"
            data-testid="list-refresh"
            aria-label="Làm mới"
            aria-busy={refreshing}
            disabled={refreshing}
            onClick={async () => {
              setRefreshing(true);
              try {
                await onRefresh();
              } finally {
                setRefreshing(false);
              }
            }}
          >
            <RefreshCw size={16} strokeWidth={1.9} aria-hidden="true" />
          </button>
        )}
        {reporters && (
          <div className="people-summary" role="group" aria-label="Số việc theo người giao">
            {reporters.length === 0 ? (
              <span className="muted">Chưa có người giao</span>
            ) : (
              <>
                {shown.map(r => (
                  <PersonChip
                    key={r.id}
                    chip={r}
                    rels={people[r.id]?.rels ?? []}
                    onToggle={(rel, on) => onPersonRel?.(r.person, rel, on)}
                    onClear={() => onPersonClear?.(r.person)}
                  />
                ))}
                {rest.length > 0 && (
                  <span className="pchip pchip-more" title={rest.map(r => `${r.name}: ${r.count}`).join('\n')}>
                    +{rest.length} người · {restCount}
                  </span>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
