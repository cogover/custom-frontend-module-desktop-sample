import { STORAGE_KEYS } from '../config';
import { PRIORITY_ORDER, isKnownPriority } from './status';
import { readStorage, writeStorage } from './storage';
import type { PrioritySlug, RoleFilter } from './types';

export type QuickFilter = 'open' | 'all' | 'done';
export type DueFilter = 'all' | 'overdue' | 'today' | 'tomorrow' | 'month' | 'custom';
export type SortKey = 'prio' | 'due' | 'created' | 'status' | 'title';
export type SortDir = 'asc' | 'desc';

export interface ViewState {
  quick: QuickFilter;
  due: DueFilter;
  from: string;
  to: string;
  /** Roles ticked in the "Vai trò" group (multi-select, OR). Canonical order, may be empty. */
  roles: RoleFilter[];
  /** Priorities ticked in the "Mức ưu tiên" group (multi-select, OR). Empty = "Tất cả". */
  prios: PrioritySlug[];
  sortBy: SortKey;
  sortDir: SortDir;
}

export const QUICK: Record<QuickFilter, { label: string; empty: [string, string] }> = {
  open: { label: 'Chưa xong', empty: ['Không còn việc nào chưa xong', 'Mọi việc đều đã xong. Tạo việc mới khi cần.'] },
  all: { label: 'Tất cả', empty: ['Danh sách đang trống', 'Bấm “Tạo công việc” để thêm việc đầu tiên.'] },
  done: { label: 'Đã xong', empty: ['Chưa có việc nào xong', 'Tick vào ô trước tên việc để đánh dấu đã xong.'] },
};
export const QUICK_ORDER: QuickFilter[] = ['open', 'all', 'done'];

export const DUE_FILTERS: { value: DueFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'overdue', label: 'Quá hạn' },
  { value: 'today', label: 'Hôm nay' },
  { value: 'tomorrow', label: 'Ngày mai' },
  { value: 'month', label: 'Tháng này' },
  { value: 'custom', label: 'Tuỳ chọn' },
];

/** "Vai trò" checkboxes, in display order. */
export const ROLE_FILTERS: { value: RoleFilter; label: string }[] = [
  { value: 'reporter', label: 'Tôi giao' },
  { value: 'delegated', label: 'Tôi giao người khác' },
  { value: 'assignee', label: 'Giao cho tôi' },
  { value: 'cc', label: 'Tôi theo dõi' },
];
export const ROLE_ORDER: RoleFilter[] = ROLE_FILTERS.map(r => r.value);
/** Only "Giao cho tôi" is ticked on first use and after "Đặt lại bộ lọc". */
export const DEFAULT_ROLES: RoleFilter[] = ['assignee'];

const isRole = (v: unknown): v is RoleFilter => ROLE_ORDER.includes(v as RoleFilter);

/** Known roles only, no duplicates, in display order. */
export function normalizeRoles(roles: readonly unknown[]): RoleFilter[] {
  return ROLE_ORDER.filter(r => roles.some(x => x === r));
}

export function toggleRole(roles: readonly RoleFilter[], role: RoleFilter): RoleFilter[] {
  return normalizeRoles(roles.includes(role) ? roles.filter(r => r !== role) : [...roles, role]);
}

/** "Tất cả" = my three roles ("Tôi giao người khác" is part of "Tôi giao", so it is not needed for it). */
export const EVERY_ROLE: RoleFilter[] = ['reporter', 'assignee', 'cc'];

/** My three roles ticked = "Tất cả" in the "Vai trò" group. */
export const allRoles = (roles: readonly RoleFilter[]) => EVERY_ROLE.every(r => roles.includes(r));

/**
 * A role chip clicked, the same way as "Mức ưu tiên": from "Tất cả" only that role stays; unticking the last
 * ticked role goes back to "Tất cả" (every role).
 */
export function pickRole(roles: readonly RoleFilter[], role: RoleFilter): RoleFilter[] {
  if (allRoles(roles)) return [role];
  const next = toggleRole(roles, role);
  return next.length ? next : [...EVERY_ROLE];
}

export function sameRoles(a: readonly RoleFilter[], b: readonly RoleFilter[]): boolean {
  const x = normalizeRoles(a);
  const y = normalizeRoles(b);
  return x.length === y.length && x.every((r, i) => r === y[i]);
}

/** Known priorities only, no duplicates, highest first; ticking all four is the same as "Tất cả" (empty). */
export function normalizePrios(prios: readonly unknown[]): PrioritySlug[] {
  const list = PRIORITY_ORDER.filter(p => prios.some(x => x === p));
  return list.length === PRIORITY_ORDER.length ? [] : list;
}

export function togglePrio(prios: readonly PrioritySlug[], prio: PrioritySlug): PrioritySlug[] {
  return normalizePrios(prios.includes(prio) ? prios.filter(p => p !== prio) : [...prios, prio]);
}

/** The first direction listed is the one picked when the field is chosen. */
export const SORTS: Record<SortKey, { label: string; dirs: [SortDir, string][] }> = {
  prio: { label: 'Ưu tiên', dirs: [['desc', 'Cao → thấp'], ['asc', 'Thấp → cao']] },
  due: { label: 'Hạn chót', dirs: [['asc', 'Gần → xa'], ['desc', 'Xa → gần']] },
  created: { label: 'Ngày tạo', dirs: [['desc', 'Mới → cũ'], ['asc', 'Cũ → mới']] },
  status: { label: 'Trạng thái', dirs: [['asc', 'Theo quy trình'], ['desc', 'Ngược lại']] },
  title: { label: 'Tên công việc', dirs: [['asc', 'A → Z'], ['desc', 'Z → A']] },
};

export const DEFAULT_VIEW: ViewState = {
  quick: 'open',
  due: 'all',
  from: '',
  to: '',
  roles: DEFAULT_ROLES,
  prios: [],
  sortBy: 'prio',
  sortDir: 'desc',
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Restores the saved view, ignoring anything unknown or malformed (the old single `role` is dropped). */
export function loadView(): ViewState {
  const v: ViewState = { ...DEFAULT_VIEW };
  const raw = readStorage(STORAGE_KEYS.view);
  if (!raw) return v;
  let s: Partial<Record<keyof ViewState, unknown>> | null = null;
  try {
    s = JSON.parse(raw);
  } catch {
    return v;
  }
  if (!s || typeof s !== 'object') return v;
  if (typeof s.quick === 'string' && s.quick in QUICK) v.quick = s.quick as QuickFilter;
  if (DUE_FILTERS.some(d => d.value === s.due)) v.due = s.due as DueFilter;
  if (typeof s.from === 'string' && (s.from === '' || ISO.test(s.from))) v.from = s.from;
  if (typeof s.to === 'string' && (s.to === '' || ISO.test(s.to))) v.to = s.to;
  if (Array.isArray(s.roles) && s.roles.every(isRole)) v.roles = normalizeRoles(s.roles);
  if (Array.isArray(s.prios) && s.prios.every(p => typeof p === 'string' && isKnownPriority(p))) v.prios = normalizePrios(s.prios);
  if (typeof s.sortBy === 'string' && s.sortBy in SORTS) v.sortBy = s.sortBy as SortKey;
  if (s.sortDir === 'asc' || s.sortDir === 'desc') v.sortDir = s.sortDir;
  return v;
}

export function saveView(v: ViewState): void {
  writeStorage(STORAGE_KEYS.view, JSON.stringify(v));
}

export const rolesChanged = (v: ViewState) => !sameRoles(v.roles, DEFAULT_ROLES);
export const filtersNarrowed = (v: ViewState) => v.due !== 'all' || rolesChanged(v) || v.prios.length > 0;
export const sortChanged = (v: ViewState) => v.sortBy !== DEFAULT_VIEW.sortBy || v.sortDir !== DEFAULT_VIEW.sortDir;
/** Number shown on the "Bộ lọc & sắp xếp" badge. */
export const activeCount = (v: ViewState) =>
  Number(v.due !== 'all') + Number(rolesChanged(v)) + Number(v.prios.length > 0) + Number(sortChanged(v));

export function resetFilters(v: ViewState): ViewState {
  return { ...v, due: 'all', from: '', to: '', roles: DEFAULT_ROLES, prios: [], sortBy: DEFAULT_VIEW.sortBy, sortDir: DEFAULT_VIEW.sortDir };
}

export function sortDirLabel(v: ViewState): string {
  const sort = SORTS[v.sortBy];
  return (sort.dirs.find(d => d[0] === v.sortDir) ?? sort.dirs[0])[1];
}
