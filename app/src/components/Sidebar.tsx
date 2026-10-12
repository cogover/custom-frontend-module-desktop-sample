import { Check, ChevronDown, CircleCheck, CircleDashed, ListChecks } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { DatePicker } from './DatePicker';
import { PRIORITY, PRIORITY_ORDER } from '../domain/status';
import { FIELD_H } from './fields';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import type { Counts } from '../domain/filters';
import {
  DUE_FILTERS,
  QUICK,
  QUICK_ORDER,
  EVERY_ROLE,
  ROLE_FILTERS,
  SORTS,
  activeCount,
  allRoles,
  pickRole,
  togglePrio,
  type DueFilter,
  type QuickFilter,
  type SortKey,
  type ViewState,
} from '../domain/view';

const QUICK_ICON: Record<QuickFilter, ReactNode> = {
  open: <CircleDashed size={20} strokeWidth={1.7} aria-hidden="true" />,
  all: <ListChecks size={20} strokeWidth={1.7} aria-hidden="true" />,
  done: <CircleCheck size={20} strokeWidth={1.7} aria-hidden="true" />,
};

/** The small tick box of a multi-select chip: shows at a glance that several can be ticked. */
const ChipBox = () => (
  <i className="chip-box" aria-hidden="true">
    <Check size={10} strokeWidth={3} />
  </i>
);

const isNarrow = () => {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 880px)').matches;
  } catch {
    return false;
  }
};

interface SidebarProps {
  view: ViewState;
  counts: Counts;
  onChange: (patch: Partial<ViewState>) => void;
  onReset: () => void;
  /** macOS window buttons (close / minimise / full window), top-left of the rail when the app runs on the desktop. */
  windowControls?: ReactNode;
  /** id of the rail (the hide button and the resize handle point to it). */
  id?: string;
}

export function Sidebar({ view, counts, onChange, onReset, windowControls, id }: SidebarProps) {
  // the filter panel starts folded on tablets and phones
  const [panelOpen, setPanelOpen] = useState(() => !isNarrow());
  const [focusFrom, setFocusFrom] = useState(false);
  const n = activeCount(view);
  const everyRole = allRoles(view.roles);

  // picking "Tuỳ chọn" with no range yet moves the focus to the "Từ" date button
  useEffect(() => {
    if (!focusFrom || view.due !== 'custom') return;
    setFocusFrom(false);
    document.querySelector<HTMLElement>('[data-testid="due-from"]')?.focus();
  }, [focusFrom, view.due]);

  const pickDue = (due: DueFilter) => {
    if (due === 'custom' && !view.from && !view.to) setFocusFrom(true);
    onChange({ due });
  };

  const changeRange = (which: 'from' | 'to', value: string) => {
    let from = which === 'from' ? value : view.from;
    let to = which === 'to' ? value : view.to;
    if (from && to && from > to) [from, to] = [to, from];
    onChange({ due: 'custom', from, to });
  };

  const pickSort = (sortBy: SortKey) => onChange({ sortBy, sortDir: SORTS[sortBy].dirs[0][0] });

  return (
    <aside className={windowControls ? 'side has-traffic' : 'side'} id={id}>
      {windowControls}
      <h1 className="brand">
        <span className="logo">
          <Check size={18} strokeWidth={2.6} aria-hidden="true" />
        </span>
        Công việc
      </h1>

      <nav className="quick" aria-label="Bộ lọc nhanh">
        <p className="side-label">Bộ lọc nhanh</p>
        {QUICK_ORDER.map(q => (
          <button
            key={q}
            className="qf"
            type="button"
            aria-pressed={view.quick === q}
            data-testid={`quick-${q}`}
            onClick={() => onChange({ quick: q })}
          >
            {QUICK_ICON[q]}
            {QUICK[q].label}
            <span className="count" data-testid={`count-${q}`}>
              {counts[q]}
            </span>
          </button>
        ))}
      </nav>

      <details className="panel" open={panelOpen} onToggle={e => setPanelOpen(e.currentTarget.open)}>
        <summary className="panel-sum">
          Bộ lọc &amp; sắp xếp{' '}
          {n > 0 && (
            <span className="badge" aria-label={`${n} tuỳ chọn đang bật`}>
              {n}
            </span>
          )}
          <ChevronDown className="chev" size={16} strokeWidth={2} aria-hidden="true" />
        </summary>
        <div className="panel-body">
          <section className="fgroup" aria-labelledby="fg-due">
            <h3 className="fg-title" id="fg-due">
              Hạn chót
            </h3>
            <div className="chips" role="radiogroup" aria-labelledby="fg-due">
              {DUE_FILTERS.map(d => (
                <label className="chip" key={d.value}>
                  <input
                    type="radio"
                    name="due-filter"
                    value={d.value}
                    checked={view.due === d.value}
                    onChange={() => pickDue(d.value)}
                    data-testid={`due-filter-${d.value}`}
                  />
                  <span>{d.label}</span>
                </label>
              ))}
            </div>
            {view.due === 'custom' && (
              <div className="range">
                <div className="range-row">
                  <span aria-hidden="true">Từ</span>
                  <DatePicker
                    size="sm"
                    clearable
                    label="Từ ngày"
                    placeholder="Chọn ngày"
                    testId="due-from"
                    value={view.from}
                    onChange={v => changeRange('from', v)}
                  />
                </div>
                <div className="range-row">
                  <span aria-hidden="true">Đến</span>
                  <DatePicker
                    size="sm"
                    clearable
                    label="Đến ngày"
                    placeholder="Chọn ngày"
                    testId="due-to"
                    value={view.to}
                    onChange={v => changeRange('to', v)}
                  />
                </div>
              </div>
            )}
          </section>

          <section className="fgroup" aria-labelledby="fg-role">
            <h3 className="fg-title" id="fg-role">
              Vai trò
            </h3>
            {/* "Tất cả" (every role) or any number of roles (OR), the same way as "Mức ưu tiên" */}
            <div className="chips" role="group" aria-labelledby="fg-role">
              <label className="chip multi">
                <input
                  type="checkbox"
                  name="role-filter"
                  value="all"
                  checked={everyRole}
                  onChange={() => onChange({ roles: [...EVERY_ROLE] })}
                  data-testid="role-filter-all"
                />
                <span>
                  <ChipBox />
                  Tất cả
                </span>
              </label>
              {ROLE_FILTERS.map(r => (
                <label className="chip multi" key={r.value}>
                  <input
                    type="checkbox"
                    name="role-filter"
                    value={r.value}
                    checked={!everyRole && view.roles.includes(r.value)}
                    onChange={() => onChange({ roles: pickRole(view.roles, r.value) })}
                    data-testid={`role-filter-${r.value}`}
                  />
                  <span>
                    <ChipBox />
                    {r.label}
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="fgroup" aria-labelledby="fg-prio">
            <h3 className="fg-title" id="fg-prio">
              Mức ưu tiên
            </h3>
            {/* "Tất cả" or any number of priorities (OR); ticking all four goes back to "Tất cả" */}
            <div className="chips" role="group" aria-labelledby="fg-prio">
              <label className="chip multi">
                <input
                  type="checkbox"
                  name="prio-filter"
                  value="all"
                  checked={view.prios.length === 0}
                  onChange={() => onChange({ prios: [] })}
                  data-testid="prio-filter-all"
                />
                <span>
                  <ChipBox />
                  Tất cả
                </span>
              </label>
              {PRIORITY_ORDER.map(p => (
                <label className="chip multi" key={p}>
                  <input
                    type="checkbox"
                    name="prio-filter"
                    value={p}
                    checked={view.prios.includes(p)}
                    onChange={() => onChange({ prios: togglePrio(view.prios, p) })}
                    data-testid={`prio-filter-${p}`}
                  />
                  <span>
                    <ChipBox />
                    {PRIORITY[p].label}
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="fgroup" aria-labelledby="fg-sort">
            <h3 className="fg-title" id="fg-sort">
              Sắp xếp theo
            </h3>
            <div className="sort">
              <Select value={view.sortBy} onValueChange={v => pickSort(v as SortKey)}>
                <SelectTrigger aria-labelledby="fg-sort" data-testid="sort-by" className={`w-full ${FIELD_H.sm}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SORTS) as SortKey[]).map(k => (
                    <SelectItem key={k} value={k}>
                      {SORTS[k].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="dir" role="group" aria-label="Thứ tự sắp xếp">
                {SORTS[view.sortBy].dirs.map(([dir, label]) => (
                  <button
                    key={dir}
                    type="button"
                    aria-pressed={view.sortDir === dir}
                    data-testid={`sort-dir-${dir}`}
                    onClick={() => onChange({ sortDir: dir })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {n > 0 && (
            <button className="reset" type="button" onClick={onReset}>
              Đặt lại bộ lọc
            </button>
          )}
        </div>
      </details>

    </aside>
  );
}
