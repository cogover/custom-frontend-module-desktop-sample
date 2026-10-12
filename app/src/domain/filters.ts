import { daysFromToday, inCurrentMonth, longDate, shortDate, vnIsoDate, vnTime } from './dates';
import { personName } from './people';
import { priorityRank, statusMeta, statusRank } from './status';
import { delegatedBy, isDone, rolesOf } from './task';
import { fold } from './text';
import type { Person, PrioritySlug, RoleFilter, Task } from './types';
import type { DueFilter, QuickFilter, SortDir, SortKey, ViewState } from './view';

export function matchesQuick(t: Task, quick: QuickFilter): boolean {
  if (quick === 'open') return !isDone(t);
  if (quick === 'done') return isDone(t);
  return true;
}

/** "Quá hạn" = due before now and still open. */
export const isOverdue = (t: Task, now: number) => t.dueDate != null && t.dueDate < now && !isDone(t);

export function matchesDue(t: Task, due: DueFilter, from: string, to: string, now: number): boolean {
  if (due === 'all') return true;
  if (t.dueDate == null) return false;
  switch (due) {
    case 'overdue':
      return isOverdue(t, now);
    case 'today':
      return daysFromToday(t.dueDate, now) === 0;
    case 'tomorrow':
      return daysFromToday(t.dueDate, now) === 1;
    case 'month':
      return inCurrentMonth(t.dueDate, now);
    case 'custom': {
      const d = vnIsoDate(t.dueDate);
      return (!from || d >= from) && (!to || d <= to);
    }
  }
}

/** Multi-select roles: the task matches when I hold ANY ticked role; nothing ticked matches nothing. */
export function matchesRoles(t: Task, roles: readonly RoleFilter[], meId: string | null): boolean {
  if (roles.length === 0) return false;
  const mine = rolesOf(t, meId);
  return roles.some(r => (r === 'delegated' ? delegatedBy(t, meId) : mine.includes(r)));
}

/** Multi-select priorities: nothing ticked = "Tất cả" (tasks without a priority only show then). */
export const matchesPrios = (t: Task, prios: readonly PrioritySlug[]) => prios.length === 0 || (t.priority !== '' && prios.includes(t.priority));

/** Search text: title, description text, reporter name and status label, without diacritics. */
export function searchText(t: Task): string {
  return fold(`${t.subject} ${t.descText} ${personName(t.reporter)} ${statusMeta(t.status).label}`);
}

export const matchesQuery = (t: Task, foldedQuery: string) => !foldedQuery || searchText(t).includes(foldedQuery);

export interface MatchContext {
  view: ViewState;
  query: string; // already folded
  meId: string | null;
  now: number;
}

export function matchesView(t: Task, ctx: MatchContext): boolean {
  const { view } = ctx;
  return (
    matchesQuick(t, view.quick) &&
    matchesDue(t, view.due, view.from, view.to, ctx.now) &&
    matchesRoles(t, view.roles, ctx.meId) &&
    matchesPrios(t, view.prios) &&
    matchesQuery(t, ctx.query)
  );
}

const collator = new Intl.Collator('vi');

export function compareTasks(a: Task, b: Task, sortBy: SortKey, sortDir: SortDir): number {
  const newestFirst = (b.created ?? 0) - (a.created ?? 0);
  let r = 0;
  switch (sortBy) {
    case 'due':
      if (a.dueDate == null || b.dueDate == null) {
        // tasks without a deadline always go last
        return Number(a.dueDate == null) - Number(b.dueDate == null) || newestFirst;
      }
      r = a.dueDate - b.dueDate;
      break;
    case 'prio':
      r = priorityRank(a.priority) - priorityRank(b.priority);
      break;
    case 'status':
      r = statusRank(a.status) - statusRank(b.status);
      break;
    case 'title':
      r = collator.compare(a.subject, b.subject);
      break;
    case 'created':
      r = (a.created ?? 0) - (b.created ?? 0);
      break;
  }
  return (sortDir === 'asc' ? r : -r) || newestFirst || a.id.localeCompare(b.id);
}

/**
 * Tasks to show, sorted. `frozen` holds snapshots of tasks whose status just changed:
 * for ~600ms they are filtered and sorted as they were before the change.
 */
export function selectVisible(tasks: Task[], ctx: MatchContext, frozen?: ReadonlyMap<string, Task>): Task[] {
  const as = (t: Task) => frozen?.get(t.id) ?? t;
  return tasks
    .filter(t => matchesView(as(t), ctx))
    .sort((a, b) => compareTasks(as(a), as(b), ctx.view.sortBy, ctx.view.sortDir));
}

export interface Counts {
  open: number;
  done: number;
  all: number;
}

/**
 * Quick-filter counts for the ticked roles (not affected by deadline filter or search).
 * Open tasks are all loaded (every role) and counted here; done tasks are counted on the
 * server with the ticked roles (`doneTotal`), never less than what is loaded.
 */
export function countTasks(tasks: Task[], doneTotal: number, roles: readonly RoleFilter[], meId: string | null): Counts {
  let open = 0;
  let loadedDone = 0;
  for (const t of tasks) {
    if (!matchesRoles(t, roles, meId)) continue;
    if (isDone(t)) loadedDone++;
    else open++;
  }
  const done = roles.length === 0 ? 0 : Math.max(doneTotal, loadedDone);
  return { open, done, all: open + done };
}

/** Done tasks loaded locally for the ticked roles ("Đã tải X/Y"). */
export const loadedDoneCount = (tasks: Task[], roles: readonly RoleFilter[], meId: string | null) =>
  tasks.filter(t => isDone(t) && matchesRoles(t, roles, meId)).length;

export interface ReporterCount {
  id: string;
  name: string;
  short: string;
  person: NonNullable<Task['reporter']>;
  count: number;
}

/** One entry per reporter ("Người giao"), busiest first. */
export function reporterSummary(tasks: Task[]): ReporterCount[] {
  const map = new Map<string, ReporterCount>();
  for (const t of tasks) {
    if (!t.reporter) continue;
    const name = personName(t.reporter) || t.reporter.id;
    const entry = map.get(t.reporter.id);
    if (entry) entry.count += 1;
    else map.set(t.reporter.id, { id: t.reporter.id, name, short: t.reporter.firstName || name.split(/\s+/).pop() || name, person: t.reporter, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count || collator.compare(a.name, b.name));
}

/** How a person relates to a task in the people filter of the list bar. */
export type PersonRel = 'reporter' | 'assignee' | 'cc';
export const PERSON_RELS: readonly PersonRel[] = ['reporter', 'assignee', 'cc'];

/** People ticked on the chips of the list bar: per person, the relations to match (OR across everything ticked). */
export type PeopleFilter = Readonly<Record<string, { person: Person; rels: readonly PersonRel[] }>>;

export const peopleFilterActive = (f: PeopleFilter) => Object.values(f).some(e => e.rels.length > 0);

export function matchesPeople(t: Task, f: PeopleFilter): boolean {
  let any = false;
  for (const [id, { rels }] of Object.entries(f)) {
    for (const rel of rels) {
      any = true;
      if (rel === 'reporter' ? t.reporter?.id === id : rel === 'assignee' ? t.assignee?.id === id : t.ccs.some(p => p.id === id)) return true;
    }
  }
  return !any;
}

/** Ticks or unticks one relation of a person; a person with nothing ticked leaves the filter. */
export function togglePersonRel(f: PeopleFilter, person: Person, rel: PersonRel, on: boolean): PeopleFilter {
  const rels = (f[person.id]?.rels ?? []).filter(r => r !== rel);
  if (on) rels.push(rel);
  const next = { ...f };
  if (rels.length) next[person.id] = { person, rels: PERSON_RELS.filter(r => rels.includes(r)) };
  else delete next[person.id];
  return next;
}

/** The chips: one per reporter of `tasks`, plus the people of the filter who report none of them (count 0). */
export function peopleChips(tasks: Task[], f: PeopleFilter): ReporterCount[] {
  const chips = reporterSummary(tasks);
  for (const { person } of Object.values(f)) {
    if (chips.some(c => c.id === person.id)) continue;
    const name = personName(person) || person.id;
    chips.push({ id: person.id, name, short: person.firstName || name.split(/\s+/).pop() || name, person, count: 0 });
  }
  return chips;
}

export interface DueInfo {
  text: string;
  cls: '' | 'late' | 'soon' | 'none';
  title: string;
}

/** Deadline label on a card. */
export function dueInfo(t: Task, now: number): DueInfo {
  if (t.dueDate == null) return { text: 'Không có hạn', cls: 'none', title: 'Không có hạn chót' };
  const due = t.dueDate;
  const n = daysFromToday(due, now);
  const title = `Hạn chót: ${longDate(due)}, ${vnTime(due)}`;
  if (!isDone(t)) {
    if (n < 0) return { text: `Quá hạn ${-n} ngày`, cls: 'late', title };
    if (n === 0 && due < now) return { text: 'Quá hạn hôm nay', cls: 'late', title };
    if (n === 0) return { text: 'Hôm nay', cls: 'soon', title };
    if (n === 1) return { text: 'Ngày mai', cls: 'soon', title };
  }
  return { text: shortDate(due, now), cls: '', title };
}

/** Relative part of the deadline in the detail popup ("Còn 3 ngày", …); empty for done tasks. */
export function dueRelative(t: Task, now: number): { text: string; cls: '' | 'late' | 'soon' } {
  if (t.dueDate == null || isDone(t)) return { text: '', cls: '' };
  const n = daysFromToday(t.dueDate, now);
  if (n < 0) return { text: `Quá hạn ${-n} ngày`, cls: 'late' };
  if (n === 0 && t.dueDate < now) return { text: 'Quá hạn hôm nay', cls: 'late' };
  if (n === 0) return { text: 'Hôm nay', cls: 'soon' };
  if (n === 1) return { text: 'Ngày mai', cls: 'soon' };
  return { text: `Còn ${n} ngày`, cls: '' };
}

