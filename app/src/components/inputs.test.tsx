import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FIXED_NOW, freezeTime } from '../test/fixtures';
import { DatePicker, isoToDisplay, isoToLocalDate, localDateToIso } from './DatePicker';
import { personFilter } from './PersonPicker';
import { HALF_HOURS, TimeSelect, timeOptions } from './TimeSelect';

function ControlledDate({ initial = '', clearable = false }: { initial?: string; clearable?: boolean }) {
  const [v, setV] = useState(initial);
  return <DatePicker value={v} onChange={setV} testId="dp" label="Từ ngày" clearable={clearable} size="sm" />;
}

function ControlledTime({ initial }: { initial: string }) {
  const [v, setV] = useState(initial);
  return <TimeSelect value={v} onChange={setV} testId="tp" />;
}

describe('DatePicker (shadcn Popover + Calendar)', () => {
  it('converts between "YYYY-MM-DD", calendar days and dd/MM/yyyy', () => {
    expect(localDateToIso(isoToLocalDate('2026-02-28')!)).toBe('2026-02-28');
    expect(isoToLocalDate('2026-10-03')!.getDate()).toBe(3);
    expect(isoToLocalDate('03/10/2026')).toBeUndefined();
    expect(isoToDisplay('2026-10-03')).toBe('03/10/2026');
    expect(isoToDisplay('')).toBe('');
  });

  it('shows a placeholder, marks today in UTC+7, picks a day and can clear it', async () => {
    // 2026-10-01 20:00 UTC = 2 Oct 03:00 in Vietnam → "today" is the 2nd
    freezeTime(Date.UTC(2026, 9, 1, 20, 0));
    render(<ControlledDate clearable />);
    const trigger = screen.getByTestId('dp');
    expect(trigger).toHaveTextContent('Chọn ngày');
    expect(trigger).toHaveAccessibleName('Từ ngày');
    fireEvent.click(trigger);
    const calendar = screen.getByTestId('calendar');
    expect(within(calendar).getByRole('button', { name: /^Hôm nay, Thứ Sáu, ngày 2 tháng 10 năm 2026$/ })).toBeInTheDocument();
    fireEvent.click(within(calendar).getByRole('button', { name: /ngày 15 tháng 10 năm 2026/ }));
    expect(screen.queryByTestId('calendar')).toBeNull();
    expect(trigger).toHaveTextContent('15/10/2026');
    expect(trigger).toHaveAccessibleName('Từ ngày: 15/10/2026');
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Xoá ngày' }));
    expect(trigger).toHaveTextContent('Chọn ngày');
    expect(trigger).toHaveAttribute('data-value', '');
  });

  it('opens on the selected month and moves between months', () => {
    freezeTime(FIXED_NOW);
    render(<ControlledDate initial="2026-12-24" />);
    fireEvent.click(screen.getByTestId('dp'));
    const calendar = screen.getByTestId('calendar');
    expect(within(calendar).getByText('Tháng 12, 2026')).toBeInTheDocument();
    fireEvent.click(within(calendar).getByRole('button', { name: 'Đến tháng tiếp theo' }));
    expect(within(calendar).getByText('Tháng 1, 2027')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xoá ngày' })).toBeNull(); // not clearable
  });
});

describe('TimeSelect (shadcn Select, 30-minute slots)', () => {
  it('lists 00:00 … 23:30 and keeps an off-slot time as its own option', () => {
    expect(HALF_HOURS).toHaveLength(48);
    expect(HALF_HOURS[0]).toBe('00:00');
    expect(HALF_HOURS.at(-1)).toBe('23:30');
    expect(timeOptions('17:00')).toBe(HALF_HOURS);
    const odd = timeOptions('14:28');
    expect(odd).toHaveLength(49);
    expect(odd.slice(28, 31)).toEqual(['14:00', '14:28', '14:30']);
  });

  it('shows the value and changes it from the list', () => {
    render(<ControlledTime initial="14:28" />);
    const trigger = screen.getByTestId('tp');
    expect(trigger).toHaveTextContent('14:28');
    expect(trigger).toHaveAccessibleName('Giờ hạn chót');
    fireEvent.click(trigger);
    expect(screen.getAllByRole('option')).toHaveLength(49);
    fireEvent.click(screen.getByRole('option', { name: '09:30' }));
    expect(trigger).toHaveTextContent('09:30');
  });
});

describe('people Combobox filter', () => {
  it('matches names without diacritics, case-insensitively', () => {
    expect(personFilter('PER1', 'tran minh an', ['Trần Minh An'])).toBe(1);
    expect(personFilter('PER1', 'NGOC', ['Hoàng Bảo Ngọc'])).toBe(1);
    expect(personFilter('PER1', 'lan', ['Trần Minh An'])).toBe(0);
    expect(personFilter('PER1', '  ', ['x'])).toBe(1);
    expect(personFilter('PER1', 'a')).toBe(0);
  });
});

describe('shadcn parts', () => {
  it('ship without open/close animations or transitions', () => {
    const sources = import.meta.glob('./ui/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    expect(Object.keys(sources).length).toBeGreaterThanOrEqual(7);
    for (const [file, code] of Object.entries(sources)) {
      // class tokens only (comments may say "animations/transitions removed")
      expect(code, file).not.toMatch(/\banimate-|\bfade-(in|out)|\bzoom-(in|out)|\bslide-in-from|\btransition(-[a-z[]|\b)/);
    }
  });

  it('load Tailwind theme + utilities only (no global preflight)', () => {
    const css = Object.values(import.meta.glob('../tailwind.css', { query: '?raw', import: 'default', eager: true }))[0] as string;
    expect(css).toMatch(/@import 'tailwindcss\/theme\.css' layer\(theme\);/);
    expect(css).toMatch(/@import 'tailwindcss\/utilities\.css' layer\(utilities\);/);
    expect(css).not.toMatch(/@import 'tailwindcss(\/preflight(\.css)?)?'/);
    expect(css).toMatch(/--radius-md: var\(--radius\);/);
    expect(css).toMatch(/--color-primary: var\(--accent\);/);
  });

  it('keeps focus on the trigger after closing the calendar with Escape', async () => {
    freezeTime(FIXED_NOW);
    render(<ControlledDate initial="2026-10-03" />);
    fireEvent.click(screen.getByTestId('dp'));
    const day = within(screen.getByTestId('calendar')).getByRole('button', { name: /ngày 3 tháng 10 năm 2026, đã chọn/ });
    expect(day).toHaveFocus();
    fireEvent.keyDown(day, { key: 'Escape' });
    expect(screen.queryByTestId('calendar')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('dp')).toHaveFocus());
    vi.useRealTimers();
  });
});
