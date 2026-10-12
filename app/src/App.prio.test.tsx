import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PRIORITY_ORDER } from './domain/status';
import { ids, renderApp, taskOnServer } from './test/app';

describe('Mức ưu tiên: multi-select priority filter', () => {
  it('narrows the list to the ticked priorities, counts as a filter and resets', async () => {
    const { backend, user } = await renderApp();
    const all = ids();
    expect(all).toHaveLength(10);
    const prioOf = (id: string) => taskOnServer(backend, id).priority as string;

    await user.click(screen.getByTestId('prio-filter-urgent'));
    expect(ids().length).toBeGreaterThan(0);
    expect(ids().every(id => prioOf(id!) === 'urgent')).toBe(true);
    expect(screen.getByTestId('prio-filter-all')).not.toBeChecked();
    // the quick-filter counts do not depend on the priority filter (like the deadline filter)
    expect(screen.getByTestId('count-open')).toHaveTextContent('10');

    await user.click(screen.getByTestId('prio-filter-low'));
    const urgentOrLow = all.filter(id => ['urgent', 'low'].includes(prioOf(id!)));
    expect(ids().sort()).toEqual(urgentOrLow.sort());

    await user.click(screen.getByTestId('prio-filter-high'));
    await user.click(screen.getByTestId('prio-filter-medium')); // all four = "Tất cả"
    expect(screen.getByTestId('prio-filter-all')).toBeChecked();
    expect(ids()).toHaveLength(10); // tasks without a priority are back too

    await user.click(screen.getByTestId('prio-filter-high'));
    expect(ids().every(id => prioOf(id!) === 'high')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Đặt lại bộ lọc' }));
    expect(screen.getByTestId('prio-filter-all')).toBeChecked();
    expect(JSON.parse(localStorage.getItem('cong-viec.view.v1')!).prios).toEqual([]);
  });

  it('shows the "no match" state when no task has the ticked priority', async () => {
    const { backend, user } = await renderApp({}, {}, { view: { roles: ['cc'] } }); // only "Tôi theo dõi"
    const shown = new Set(ids().map(id => taskOnServer(backend, id!).priority));
    const missing = PRIORITY_ORDER.find(p => !shown.has(p));
    expect(missing).toBeDefined(); // the seed has no watched task for some priority
    await user.click(screen.getByTestId(`prio-filter-${missing}`));
    expect(ids()).toHaveLength(0);
    const empty = screen.getByTestId('empty-state');
    expect(empty).toHaveTextContent('Không có việc nào khớp bộ lọc');
    expect(empty).toHaveTextContent('mức ưu tiên');
    await user.click(within(empty).getByRole('button'));
    expect(screen.getByTestId('prio-filter-all')).toBeChecked();
  });
});
