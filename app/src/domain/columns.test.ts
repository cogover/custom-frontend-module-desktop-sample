import { describe, expect, it } from 'vitest';
import { columnsStyle, DEFAULT_COLUMNS, gridTemplate, moveColumn, normalizeColumns, setWidth, toggleColumn } from './columns';

describe('task list columns', () => {
  it('defaults: tick, Mã, Công việc (flexible), Trạng thái, Người giao, Giao cho, Ưu tiên, Hạn chót', () => {
    expect(gridTemplate(DEFAULT_COLUMNS)).toBe('22px 76px minmax(0,1fr) 120px 88px 88px 64px 84px');
    const { style, hide } = columnsStyle(DEFAULT_COLUMNS);
    expect(style).toMatchObject({ '--o-code': '1', '--o-main': '2', '--o-due': '7' });
    expect(hide).toBe('');
  });

  it('hides, moves and sizes columns; "Công việc" can neither be hidden nor sized', () => {
    let s = toggleColumn(DEFAULT_COLUMNS, 'priority', false);
    s = toggleColumn(s, 'main', false);
    s = moveColumn(s, 'due', -1);
    s = moveColumn(s, 'code', -1); // already first
    s = setWidth(s, 'status', 999); // clamped
    s = setWidth(s, 'main', 300);
    expect(s.hidden).toEqual(['priority']);
    expect(s.order).toEqual(['code', 'main', 'status', 'reporter', 'assignee', 'due', 'priority']);
    expect(gridTemplate(s)).toBe('22px 76px minmax(0,1fr) 260px 88px 88px 84px');
    expect(columnsStyle(s).hide).toBe('priority');
    expect(setWidth(s, 'status', null).widths).toEqual({});
  });

  it('repairs what was saved: unknown ids out, missing ids back in place, odd widths clamped or dropped', () => {
    expect(normalizeColumns(null)).toEqual(DEFAULT_COLUMNS);
    expect(normalizeColumns({ order: ['due', 'x', 'due', 'main'], hidden: ['main', 'code', 'y'], widths: { code: 10, due: 'a', main: 50, x: 3 } })).toEqual({
      order: ['code', 'due', 'main', 'status', 'reporter', 'assignee', 'priority'],
      hidden: ['code'],
      widths: { code: 56 },
    });
  });
});
