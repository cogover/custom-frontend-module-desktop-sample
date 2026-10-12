import { afterEach, describe, expect, it, vi } from 'vitest';
import { readStorage, writeStorage } from './storage';
import {
  DEFAULT_VIEW,
  ROLE_FILTERS,
  activeCount,
  allRoles,
  filtersNarrowed,
  loadView,
  normalizePrios,
  normalizeRoles,
  pickRole,
  resetFilters,
  rolesChanged,
  sameRoles,
  saveView,
  sortChanged,
  sortDirLabel,
  togglePrio,
  toggleRole,
} from './view';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('view persistence', () => {
  it('returns the default view when nothing is saved', () => {
    expect(loadView()).toEqual(DEFAULT_VIEW);
  });

  it('round-trips a saved view', () => {
    const v = { ...DEFAULT_VIEW, quick: 'done' as const, due: 'custom' as const, from: '2026-10-01', to: '2026-10-31', roles: ['reporter' as const, 'cc' as const], sortBy: 'due' as const, sortDir: 'asc' as const };
    saveView(v);
    expect(loadView()).toEqual(v);
  });

  it('defaults to only "Giao cho tôi" and ignores the old single `role`', () => {
    expect(DEFAULT_VIEW.roles).toEqual(['assignee']);
    localStorage.setItem('cong-viec.view.v1', JSON.stringify({ quick: 'all', role: 'cc' }));
    expect(loadView()).toEqual({ ...DEFAULT_VIEW, quick: 'all' });
  });

  it('validates the saved roles', () => {
    const save = (roles: unknown) => localStorage.setItem('cong-viec.view.v1', JSON.stringify({ roles }));
    save(['cc', 'reporter', 'cc']);
    expect(loadView().roles).toEqual(['reporter', 'cc']); // de-duplicated, display order
    save([]);
    expect(loadView().roles).toEqual([]); // "nothing ticked" is a valid, remembered choice
    save(['assignee', 'boss']);
    expect(loadView().roles).toEqual(['assignee']); // anything unknown → default
    save('cc');
    expect(loadView().roles).toEqual(['assignee']);
  });

  it('validates the saved priorities (empty = "Tất cả", all four = "Tất cả")', () => {
    const save = (prios: unknown) => localStorage.setItem('cong-viec.view.v1', JSON.stringify({ prios }));
    expect(DEFAULT_VIEW.prios).toEqual([]);
    save(['low', 'urgent', 'low']);
    expect(loadView().prios).toEqual(['urgent', 'low']); // de-duplicated, highest first
    save(['urgent', 'high', 'medium', 'low']);
    expect(loadView().prios).toEqual([]);
    save(['high', 'boss']);
    expect(loadView().prios).toEqual([]);
    save([3]);
    expect(loadView().prios).toEqual([]);
    save('high');
    expect(loadView().prios).toEqual([]);
  });

  it('ignores malformed or unknown values', () => {
    localStorage.setItem('cong-viec.view.v1', JSON.stringify({ quick: 'x', due: 'soon', from: '01/10/2026', to: 3, roles: 'boss', sortBy: 'nope', sortDir: 'up' }));
    expect(loadView()).toEqual(DEFAULT_VIEW);
    localStorage.setItem('cong-viec.view.v1', '{broken');
    expect(loadView()).toEqual(DEFAULT_VIEW);
    localStorage.setItem('cong-viec.view.v1', 'null');
    expect(loadView()).toEqual(DEFAULT_VIEW);
  });

  it('survives a storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readStorage('k')).toBeNull();
    expect(() => writeStorage('k', 'v')).not.toThrow();
    expect(loadView()).toEqual(DEFAULT_VIEW);
  });
});

describe('view helpers', () => {
  it('counts active filters (roles other than the default count) and resets them', () => {
    const v = { ...DEFAULT_VIEW, due: 'today' as const, roles: ['reporter' as const], sortBy: 'title' as const, sortDir: 'asc' as const };
    expect(filtersNarrowed(v)).toBe(true);
    expect(sortChanged(v)).toBe(true);
    expect(activeCount(v)).toBe(3);
    const r = resetFilters({ ...v, quick: 'done' });
    expect(r).toEqual({ ...DEFAULT_VIEW, quick: 'done' });
    expect(activeCount(DEFAULT_VIEW)).toBe(0);
    expect(filtersNarrowed({ ...DEFAULT_VIEW, roles: [] })).toBe(true);
    expect(rolesChanged({ ...DEFAULT_VIEW, roles: ['assignee'] })).toBe(false);
    expect(filtersNarrowed({ ...DEFAULT_VIEW, roles: ['assignee', 'cc'] })).toBe(true);
  });

  it('toggles roles in display order: Tôi giao, Tôi giao người khác, Giao cho tôi, Tôi theo dõi', () => {
    expect(ROLE_FILTERS.map(r => [r.value, r.label])).toEqual([
      ['reporter', 'Tôi giao'],
      ['delegated', 'Tôi giao người khác'],
      ['assignee', 'Giao cho tôi'],
      ['cc', 'Tôi theo dõi'],
    ]);
    expect(toggleRole(['assignee'], 'cc')).toEqual(['assignee', 'cc']);
    expect(toggleRole(['assignee', 'cc'], 'reporter')).toEqual(['reporter', 'assignee', 'cc']);
    expect(toggleRole(['assignee'], 'assignee')).toEqual([]);
    expect(normalizeRoles(['cc', 'x', 'assignee'])).toEqual(['assignee', 'cc']);
    expect(sameRoles(['cc', 'assignee'], ['assignee', 'cc'])).toBe(true);
    expect(sameRoles(['cc'], ['assignee'])).toBe(false);
    expect(sameRoles([], ['assignee'])).toBe(false);
  });

  it('labels the sort direction', () => {
    expect(sortDirLabel(DEFAULT_VIEW)).toBe('Cao → thấp');
    expect(sortDirLabel({ ...DEFAULT_VIEW, sortBy: 'due', sortDir: 'desc' })).toBe('Xa → gần');
  });
});

describe('role filter helpers', () => {
  it('treats every role ticked as "Tất cả"', () => {
    expect(allRoles(['cc', 'reporter', 'assignee'])).toBe(true);
    expect(allRoles(['reporter', 'assignee'])).toBe(false);
  });

  it('picks roles the way "Mức ưu tiên" does: from "Tất cả" only that role; the last one off → "Tất cả"', () => {
    expect(pickRole(['reporter', 'assignee', 'cc'], 'cc')).toEqual(['cc']);
    expect(pickRole(['assignee'], 'reporter')).toEqual(['reporter', 'assignee']);
    expect(pickRole(['reporter', 'cc'], 'assignee')).toEqual(['reporter', 'assignee', 'cc']);
    expect(pickRole(['assignee'], 'assignee')).toEqual(['reporter', 'assignee', 'cc']);
    expect(pickRole([], 'cc')).toEqual(['cc']); // a view saved with no role
  });
});

describe('priority filter helpers', () => {
  it('keeps known priorities, highest first, and folds all four into "Tất cả"', () => {
    expect(normalizePrios(['low', 'x', 'high'])).toEqual(['high', 'low']);
    expect(normalizePrios(['low', 'medium', 'high', 'urgent'])).toEqual([]);
  });

  it('toggles one priority at a time', () => {
    expect(togglePrio([], 'high')).toEqual(['high']);
    expect(togglePrio(['high'], 'urgent')).toEqual(['urgent', 'high']);
    expect(togglePrio(['urgent', 'high'], 'high')).toEqual(['urgent']);
    expect(togglePrio(['urgent'], 'urgent')).toEqual([]);
    expect(togglePrio(['urgent', 'high', 'medium'], 'low')).toEqual([]); // the 4th one = "Tất cả"
  });

  it('counts as an active filter, narrows the list and is cleared by "Đặt lại bộ lọc"', () => {
    const v = { ...DEFAULT_VIEW, prios: ['urgent' as const] };
    expect(activeCount(v)).toBe(1);
    expect(filtersNarrowed(v)).toBe(true);
    expect(resetFilters(v).prios).toEqual([]);
    expect(activeCount(DEFAULT_VIEW)).toBe(0);
  });
});
