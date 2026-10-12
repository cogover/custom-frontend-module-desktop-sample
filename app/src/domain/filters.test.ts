import { describe, expect, it } from 'vitest';
import { FIXED_NOW, ME, person, task } from '../test/fixtures';
import {
  compareTasks,
  countTasks,
  dueInfo,
  dueRelative,
  isOverdue,
  loadedDoneCount,
  matchesDue,
  matchesPrios,
  matchesQuery,
  matchesQuick,
  matchesRoles,
  matchesPeople,
  matchesView,
  peopleChips,
  peopleFilterActive,
  reporterSummary,
  searchText,
  selectVisible,
  togglePersonRel,
  type MatchContext,
  type PeopleFilter,
} from './filters';
import { fold } from './text';
import { DEFAULT_VIEW, type SortDir, type SortKey } from './view';

const NOW = FIXED_NOW; // 2026-10-01 10:00 Vietnam
const vn = (m: number, d: number, h = 17, mi = 0, y = 2026) => Date.UTC(y, m - 1, d, h - 7, mi);
const other = person('P2', 'Lan', 'Nguyễn Thị');

describe('quick filter', () => {
  it('splits open and done groups', () => {
    expect(matchesQuick(task({ status: 'on_hold' }), 'open')).toBe(true);
    expect(matchesQuick(task({ status: 'cancelled' }), 'open')).toBe(false);
    expect(matchesQuick(task({ status: 'closed' }), 'done')).toBe(true);
    expect(matchesQuick(task({ status: 'new' }), 'all')).toBe(true);
  });
});

describe('due filter (UTC+7)', () => {
  const at = (ms: number | null, status = 'new') => task({ dueDate: ms, status });

  it('overdue = before now and still open', () => {
    expect(isOverdue(at(vn(10, 1, 9, 59)), NOW)).toBe(true);
    expect(isOverdue(at(vn(10, 1, 10, 1)), NOW)).toBe(false);
    expect(isOverdue(at(vn(9, 1), 'resolved'), NOW)).toBe(false);
    expect(matchesDue(at(vn(9, 30)), 'overdue', '', '', NOW)).toBe(true);
    expect(matchesDue(at(null), 'overdue', '', '', NOW)).toBe(false);
  });

  it('today / tomorrow follow the Vietnamese midnight', () => {
    expect(matchesDue(at(vn(10, 1, 0, 0)), 'today', '', '', NOW)).toBe(true);
    expect(matchesDue(at(vn(10, 1, 23, 59)), 'today', '', '', NOW)).toBe(true);
    expect(matchesDue(at(vn(10, 2, 0, 0)), 'today', '', '', NOW)).toBe(false);
    expect(matchesDue(at(vn(10, 2, 0, 0)), 'tomorrow', '', '', NOW)).toBe(true);
    expect(matchesDue(at(vn(10, 2, 23, 59)), 'tomorrow', '', '', NOW)).toBe(true);
    expect(matchesDue(at(vn(10, 3, 0, 0)), 'tomorrow', '', '', NOW)).toBe(false);
  });

  it('month and custom range (inclusive) use Vietnamese dates', () => {
    expect(matchesDue(at(vn(10, 31, 23, 59)), 'month', '', '', NOW)).toBe(true);
    expect(matchesDue(at(vn(11, 1, 0, 0)), 'month', '', '', NOW)).toBe(false);
    expect(matchesDue(at(vn(10, 5, 23, 30)), 'custom', '2026-10-05', '2026-10-05', NOW)).toBe(true);
    expect(matchesDue(at(vn(10, 6, 0, 30)), 'custom', '2026-10-05', '2026-10-05', NOW)).toBe(false);
    expect(matchesDue(at(vn(10, 4)), 'custom', '2026-10-05', '', NOW)).toBe(false);
    expect(matchesDue(at(vn(12, 4)), 'custom', '2026-10-05', '', NOW)).toBe(true);
    expect(matchesDue(at(vn(9, 4)), 'custom', '', '2026-10-05', NOW)).toBe(true);
    expect(matchesDue(at(vn(9, 4)), 'all', '', '', NOW)).toBe(true);
  });
});

describe('role filter (multi-select, OR)', () => {
  const mine = task({ assignee: person(ME), reporter: other });
  const given = task({ assignee: other, reporter: person(ME) });
  const watching = task({ assignee: other, reporter: other, ccs: [person(ME)] });
  const both = task({ assignee: person(ME), reporter: person(ME) });

  it('matches when I hold any ticked role', () => {
    expect(matchesRoles(mine, ['assignee'], ME)).toBe(true);
    expect(matchesRoles(given, ['assignee'], ME)).toBe(false);
    expect(matchesRoles(given, ['reporter'], ME)).toBe(true);
    expect(matchesRoles(watching, ['cc'], ME)).toBe(true);
    expect(matchesRoles(mine, ['cc'], ME)).toBe(false);
    expect(matchesRoles(watching, ['reporter', 'cc'], ME)).toBe(true);
    expect(matchesRoles(given, ['reporter', 'cc'], ME)).toBe(true);
    expect(matchesRoles(mine, ['reporter', 'cc'], ME)).toBe(false);
    expect(matchesRoles(both, ['reporter'], ME)).toBe(true);
    expect(matchesRoles(watching, ['reporter', 'assignee', 'cc'], ME)).toBe(true);
  });

  it('"Tôi giao người khác": I am the reporter and someone else (or nobody) the assignee', () => {
    expect(matchesRoles(given, ['delegated'], ME)).toBe(true);
    expect(matchesRoles(both, ['delegated'], ME)).toBe(false); // I gave it to myself
    expect(matchesRoles(mine, ['delegated'], ME)).toBe(false);
    expect(matchesRoles(watching, ['delegated'], ME)).toBe(false);
    expect(matchesRoles(task({ assignee: null, reporter: person(ME) }), ['delegated'], ME)).toBe(true);
    expect(matchesRoles(both, ['delegated', 'assignee'], ME)).toBe(true);
    expect(matchesRoles(given, ['delegated'], null)).toBe(false);
  });

  it('matches nothing when no role is ticked or I am unknown', () => {
    expect(matchesRoles(both, [], ME)).toBe(false);
    expect(matchesRoles(both, ['assignee'], null)).toBe(false);
  });
});

describe('priority filter (multi-select, OR)', () => {
  it('shows every task for "Tất cả" (nothing ticked), otherwise only the ticked priorities', () => {
    const urgent = task({ priority: 'urgent' });
    const low = task({ priority: 'low' });
    const none = task({ priority: '' });
    expect([urgent, low, none].every(t => matchesPrios(t, []))).toBe(true);
    expect(matchesPrios(urgent, ['urgent', 'high'])).toBe(true);
    expect(matchesPrios(low, ['urgent', 'high'])).toBe(false);
    expect(matchesPrios(none, ['urgent', 'high', 'medium'])).toBe(false); // no priority: only under "Tất cả"
  });

  it('is part of matchesView', () => {
    const ctx: MatchContext = { view: { ...DEFAULT_VIEW, roles: ['assignee'], prios: ['high'] }, query: '', meId: ME, now: NOW };
    expect(matchesView(task({ assignee: person(ME), priority: 'high' }), ctx)).toBe(true);
    expect(matchesView(task({ assignee: person(ME), priority: 'low' }), ctx)).toBe(false);
  });
});

describe('search (accent-insensitive)', () => {
  const t = task({ subject: 'Đối soát công nợ', descText: 'Gửi kế toán trưởng', reporter: other, status: 'pending' });
  it('looks at title, description text, reporter name and status label', () => {
    expect(matchesQuery(t, fold('doi soat'))).toBe(true);
    expect(matchesQuery(t, fold('KE TOAN'))).toBe(true);
    expect(matchesQuery(t, fold('nguyen thi lan'))).toBe(true);
    expect(matchesQuery(t, fold('đang chờ'))).toBe(true);
    expect(matchesQuery(t, fold('khong co'))).toBe(false);
    expect(matchesQuery(t, '')).toBe(true);
    expect(searchText(task({ reporter: null }))).toContain('viec thu');
  });
});

describe('sorting', () => {
  const a = task({ id: 'A', subject: 'Bảo trì', priority: 'urgent', status: 'pending', dueDate: vn(10, 3), created: 3 });
  const b = task({ id: 'B', subject: 'Ăn trưa', priority: 'low', status: 'new', dueDate: vn(10, 2), created: 1 });
  const c = task({ id: 'C', subject: 'Cập nhật', priority: '', status: 'closed', dueDate: null, created: 2 });
  const order = (key: SortKey, dir: SortDir) => [a, b, c].sort((x, y) => compareTasks(x, y, key, dir)).map(t => t.id);

  it.each<[SortKey, SortDir, string[]]>([
    ['prio', 'desc', ['A', 'C', 'B']],
    ['prio', 'asc', ['B', 'C', 'A']],
    ['due', 'asc', ['B', 'A', 'C']],
    ['due', 'desc', ['A', 'B', 'C']],
    ['created', 'desc', ['A', 'C', 'B']],
    ['created', 'asc', ['B', 'C', 'A']],
    ['status', 'asc', ['B', 'A', 'C']],
    ['status', 'desc', ['C', 'A', 'B']],
    ['title', 'asc', ['B', 'A', 'C']],
    ['title', 'desc', ['C', 'A', 'B']],
  ])('%s %s', (key, dir, expected) => {
    expect(order(key, dir)).toEqual(expected);
  });

  it('breaks ties newest first, then by id', () => {
    const x = task({ id: 'X', priority: 'high', created: 1 });
    const y = task({ id: 'Y', priority: 'high', created: 2 });
    const z = task({ id: 'Z', priority: 'high', created: 2 });
    expect([x, z, y].sort((p, q) => compareTasks(p, q, 'prio', 'desc')).map(t => t.id)).toEqual(['Y', 'Z', 'X']);
    const n1 = task({ id: 'N1', dueDate: null, created: 1 });
    const n2 = task({ id: 'N2', dueDate: null, created: 5 });
    expect([n1, n2].sort((p, q) => compareTasks(p, q, 'due', 'asc')).map(t => t.id)).toEqual(['N2', 'N1']);
  });
});

describe('selectVisible', () => {
  const ctx = (over: Partial<MatchContext> = {}): MatchContext => ({ view: DEFAULT_VIEW, query: '', meId: ME, now: NOW, ...over });

  it('filters and sorts (default: priority high → low)', () => {
    const list = [
      task({ id: '1', priority: 'low' }),
      task({ id: '2', priority: 'urgent' }),
      task({ id: '3', priority: 'high', status: 'resolved' }),
    ];
    expect(selectVisible(list, ctx()).map(t => t.id)).toEqual(['2', '1']);
    expect(selectVisible(list, ctx({ view: { ...DEFAULT_VIEW, quick: 'all' } })).map(t => t.id)).toEqual(['2', '3', '1']);
  });

  it('keeps a frozen snapshot in place while its change settles', () => {
    const before = task({ id: '1', status: 'new' });
    const after = { ...before, status: 'resolved' };
    expect(selectVisible([after], ctx())).toEqual([]);
    expect(selectVisible([after], ctx(), new Map([['1', before]]))).toEqual([after]);
    expect(matchesView(after, ctx({ view: { ...DEFAULT_VIEW, quick: 'done' } }))).toBe(true);
  });
});

describe('counts and summaries', () => {
  it('counts open locally and done from the server total, for the ticked roles only', () => {
    const list = [
      task({ id: '1' }), // assignee + reporter: me
      task({ id: '2', status: 'closed' }),
      task({ id: '3', assignee: other, reporter: other, ccs: [person(ME)] }), // follow-only, open
      task({ id: '4', assignee: other, reporter: other, ccs: [person(ME)], status: 'resolved' }),
    ];
    const all = ['reporter', 'assignee', 'cc'] as const;
    expect(countTasks(list, 10, [...all], ME)).toEqual({ open: 2, done: 10, all: 12 });
    expect(countTasks(list, 0, [...all], ME)).toEqual({ open: 2, done: 2, all: 4 });
    expect(countTasks(list, 5, ['assignee'], ME)).toEqual({ open: 1, done: 5, all: 6 });
    expect(countTasks(list, 0, ['cc'], ME)).toEqual({ open: 1, done: 1, all: 2 });
    // nothing ticked: everything is 0, even with done tasks loaded
    expect(countTasks(list, 7, [], ME)).toEqual({ open: 0, done: 0, all: 0 });
    expect(loadedDoneCount(list, ['cc'], ME)).toBe(1);
    expect(loadedDoneCount(list, ['assignee', 'cc'], ME)).toBe(2);
    expect(loadedDoneCount(list, [], ME)).toBe(0);
  });

  it('groups by reporter, busiest first', () => {
    const r = reporterSummary([task({ reporter: other }), task({ reporter: other }), task({ reporter: person(ME) }), task({ reporter: null })]);
    expect(r.map(x => [x.short, x.count])).toEqual([
      ['Lan', 2],
      ['An', 1],
    ]);
    expect(reporterSummary([task({ reporter: person('Q', '', '') })])[0]).toMatchObject({ name: 'Q', short: 'Q' });
  });
});

describe('people filter of the list bar (chips)', () => {
  const minh = person('P3', 'Minh', 'Trần');
  const t1 = task({ id: 'A', reporter: other, assignee: person(ME) });
  const t2 = task({ id: 'B', reporter: person(ME), assignee: other });
  const t3 = task({ id: 'C', reporter: person(ME), assignee: person(ME), ccs: [other, minh] });
  const t4 = task({ id: 'D', reporter: minh, assignee: person(ME) });
  const ids = (f: PeopleFilter) => [t1, t2, t3, t4].filter(t => matchesPeople(t, f)).map(t => t.id);

  it('matches the ticked relations of the ticked people (OR); nothing ticked = everything', () => {
    let f: PeopleFilter = {};
    expect(peopleFilterActive(f)).toBe(false);
    expect(ids(f)).toEqual(['A', 'B', 'C', 'D']);
    f = togglePersonRel(f, other, 'reporter', true);
    expect(ids(f)).toEqual(['A']);
    f = togglePersonRel(f, other, 'cc', true);
    expect(f[other.id]!.rels).toEqual(['reporter', 'cc']);
    expect(ids(f)).toEqual(['A', 'C']);
    f = togglePersonRel(f, other, 'assignee', true);
    expect(ids(f)).toEqual(['A', 'B', 'C']);
    f = togglePersonRel(f, minh, 'reporter', true); // a second person
    expect(ids(f)).toEqual(['A', 'B', 'C', 'D']);
    for (const rel of ['reporter', 'assignee', 'cc'] as const) f = togglePersonRel(f, other, rel, false);
    expect(Object.keys(f)).toEqual([minh.id]); // nothing ticked: the person leaves the filter
    expect(ids(f)).toEqual(['D']);
    expect(peopleFilterActive(f)).toBe(true);
  });

  it('keeps a chip for a ticked person who reports none of the listed tasks', () => {
    const f = togglePersonRel({}, minh, 'cc', true);
    expect(peopleChips([t1, t2], f).map(c => [c.short, c.count])).toEqual([
      ['Lan', 1],
      ['An', 1],
      ['Minh', 0],
    ]);
  });
});

describe('deadline labels', () => {
  it('labels cards like the design', () => {
    expect(dueInfo(task({ dueDate: vn(9, 28) }), NOW)).toMatchObject({ text: 'Quá hạn 3 ngày', cls: 'late' });
    expect(dueInfo(task({ dueDate: vn(10, 1, 9, 0) }), NOW)).toMatchObject({ text: 'Quá hạn hôm nay', cls: 'late' });
    expect(dueInfo(task({ dueDate: vn(10, 1, 17, 0) }), NOW)).toMatchObject({ text: 'Hôm nay', cls: 'soon' });
    expect(dueInfo(task({ dueDate: vn(10, 2, 8, 0) }), NOW)).toMatchObject({ text: 'Ngày mai', cls: 'soon' });
    expect(dueInfo(task({ dueDate: vn(10, 9) }), NOW)).toMatchObject({ text: '9 thg 10', cls: '' });
    expect(dueInfo(task({ dueDate: vn(1, 9, 17, 0, 2027) }), NOW).text).toBe('9 thg 1, 2027');
    expect(dueInfo(task({ dueDate: vn(9, 28), status: 'resolved' }), NOW)).toMatchObject({ text: '28 thg 9', cls: '' });
    expect(dueInfo(task({ dueDate: null }), NOW)).toMatchObject({ text: 'Không có hạn', cls: 'none' });
    expect(dueInfo(task({ dueDate: vn(10, 9, 8, 30) }), NOW).title).toBe('Hạn chót: Thứ Sáu, 9 tháng 10, 2026, 08:30');
  });

  it('adds a relative part in the popup', () => {
    expect(dueRelative(task({ dueDate: vn(10, 4) }), NOW)).toEqual({ text: 'Còn 3 ngày', cls: '' });
    expect(dueRelative(task({ dueDate: vn(9, 30) }), NOW)).toEqual({ text: 'Quá hạn 1 ngày', cls: 'late' });
    expect(dueRelative(task({ dueDate: vn(10, 1, 8) }), NOW)).toEqual({ text: 'Quá hạn hôm nay', cls: 'late' });
    expect(dueRelative(task({ dueDate: vn(10, 1, 18) }), NOW)).toEqual({ text: 'Hôm nay', cls: 'soon' });
    expect(dueRelative(task({ dueDate: vn(10, 2) }), NOW)).toEqual({ text: 'Ngày mai', cls: 'soon' });
    expect(dueRelative(task({ dueDate: vn(10, 2), status: 'closed' }), NOW)).toEqual({ text: '', cls: '' });
    expect(dueRelative(task({ dueDate: null }), NOW)).toEqual({ text: '', cls: '' });
  });
});
