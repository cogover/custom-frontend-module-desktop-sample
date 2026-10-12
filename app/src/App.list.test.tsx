import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { chooseOption, getItem, ids, items, pickDate, renderApp } from './test/app';
import { jsonResponse } from './test/fixtures';

describe('task list (AC1, AC3–AC7, AC20)', () => {
  it('shows my open tasks sorted by priority high → low, with counts', async () => {
    const { fetchMock } = await renderApp();
    expect(screen.getByTestId('list-title')).toHaveTextContent('Chưa xong');
    expect(screen.getByTestId('list-count')).toHaveTextContent('10 việc · Ưu tiên: Cao → thấp');
    expect(screen.getByTestId('count-open')).toHaveTextContent('10');
    expect(screen.getByTestId('count-done')).toHaveTextContent('130');
    expect(screen.getByTestId('count-all')).toHaveTextContent('140');
    expect(ids()).toEqual([
      'TASMOCK0002', // urgent
      'TASMOCK0006', // high (newest first among equals)
      'TASMOCK0005',
      'TASMOCK0001',
      'TASMOCK0009', // medium / empty priority counts as medium
      'TASMOCK0008',
      'TASMOCK0007',
      'TASMOCK0003',
      'TASMOCK0010', // low
      'TASMOCK0004',
    ]);
    // not in my scope
    expect(screen.queryByText('Việc của phòng khác (không thuộc phạm vi)')).toBeNull();
    // done tasks are not fetched while showing open tasks: me + open + done count
    expect(fetchMock).toHaveBeenCalledTimes(4); // … + the status workflow (transition rule, GET)
    expect(fetchMock.mock.calls.some(([u, init]) => String(u).startsWith('/api/v1/object_security/transition_rule?objectSlug=task') && init?.method === 'GET')).toBe(true);
  });

  it('renders the card columns like the design', async () => {
    await renderApp();
    const card = within(getItem('TASMOCK0002'));
    expect(card.getByTestId('task-title')).toHaveTextContent('Gọi lại khách hàng Hưng Thịnh về hợp đồng');
    expect(card.getByTestId('task-status')).toHaveTextContent('Mới');
    expect(card.getByTestId('task-status')).toHaveAttribute('role', 'combobox');
    expect(card.getByTestId('task-reporter')).toHaveTextContent('Trần Minh An');
    expect(card.getByTestId('task-priority')).toHaveTextContent('Khẩn cấp');
    expect(card.getByTestId('task-due')).toHaveTextContent('Quá hạn 1 ngày');
    expect(within(getItem('TASMOCK0001')).getByTestId('task-due')).toHaveTextContent('Hôm nay');
    expect(within(getItem('TASMOCK0003')).getByTestId('task-due')).toHaveTextContent('Ngày mai');
    expect(within(getItem('TASMOCK0009')).getByTestId('task-due')).toHaveTextContent('Quá hạn hôm nay');
    expect(within(getItem('TASMOCK0008')).getByTestId('task-priority')).toHaveTextContent('—');
    // the card shows the description as plain text
    expect(getItem('TASMOCK0003').querySelector('.desc')?.textContent).toContain('Mục tiêu: giảm thời gian nhập kho.');
    // reporter summary chips
    expect(screen.getByRole('group', { name: 'Số việc theo người giao' })).toHaveTextContent('An · 3');
  });

  it('switches quick filters and loads done tasks page by page (AC3, AC20)', async () => {
    const { user, fetchMock } = await renderApp();
    await user.click(screen.getByTestId('quick-done'));
    expect(screen.getByTestId('list-title')).toHaveTextContent('Đã xong');
    await waitFor(() => expect(items()).toHaveLength(100));
    expect(screen.getByTestId('done-progress')).toHaveTextContent('Đã tải 100/130 việc đã xong');
    expect(items().every(el => el.classList.contains('done'))).toBe(true);
    // only done cards here: shown like any card (the list opts out of strike-through / fading)
    expect(screen.getByRole('list', { name: 'Đã xong' })).toHaveClass('tasks', 'only-done');
    const doneBody = JSON.parse(String(fetchMock.mock.calls.at(-1)![1]!.body));
    expect(doneBody.sorts).toEqual([{ updated: { order: 'desc' } }]);

    await user.click(screen.getByTestId('load-more'));
    await waitFor(() => expect(items()).toHaveLength(130));
    expect(screen.getByTestId('done-progress')).toHaveTextContent('Đã tải 130/130 việc đã xong');
    expect(screen.queryByTestId('load-more')).toBeNull();

    await user.click(screen.getByTestId('quick-all'));
    expect(screen.getByTestId('list-title')).toHaveTextContent('Tất cả');
    expect(items()).toHaveLength(140);
    expect(screen.getByTestId('quick-all')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('list', { name: 'Tất cả' })).not.toHaveClass('only-done'); // mixed list: done cards stay struck through

    await user.click(screen.getByTestId('quick-open'));
    expect(items()).toHaveLength(10);
    expect(screen.queryByTestId('done-progress')).toBeNull();
  });

  it('filters by deadline in UTC+7, including a custom range (AC4)', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByTestId('due-filter-overdue'));
    expect(ids().sort()).toEqual(['TASMOCK0002', 'TASMOCK0007', 'TASMOCK0009']);
    await user.click(screen.getByTestId('due-filter-today'));
    expect(ids().sort()).toEqual(['TASMOCK0001', 'TASMOCK0009']);
    await user.click(screen.getByTestId('due-filter-tomorrow'));
    expect(ids()).toEqual(['TASMOCK0003']);
    await user.click(screen.getByTestId('due-filter-month'));
    expect(ids()).toHaveLength(7);
    await user.click(screen.getByTestId('due-filter-custom'));
    expect(screen.getByTestId('due-from')).toHaveFocus();
    pickDate('due-from', '2026-10-04');
    expect(screen.queryByTestId('calendar')).toBeNull(); // picking a day closes the calendar
    pickDate('due-to', '2026-10-02');
    // from > to is swapped; the buttons show dd/MM/yyyy
    expect(screen.getByTestId('due-from')).toHaveAttribute('data-value', '2026-10-02');
    expect(screen.getByTestId('due-from')).toHaveTextContent('02/10/2026');
    expect(screen.getByTestId('due-to')).toHaveAttribute('data-value', '2026-10-04');
    expect(screen.getByTestId('due-to')).toHaveAccessibleName('Đến ngày: 04/10/2026');
    expect(ids().sort()).toEqual(['TASMOCK0003', 'TASMOCK0005', 'TASMOCK0006']);
    // custom deadline + roles other than the default
    expect(screen.getByLabelText('2 tuỳ chọn đang bật')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Đặt lại bộ lọc' }));
    // reset also brings the roles back to the default: only "Giao cho tôi"
    expect(ids().sort()).toEqual(['TASMOCK0001', 'TASMOCK0003', 'TASMOCK0004', 'TASMOCK0005', 'TASMOCK0009', 'TASMOCK0010']);
    expect(screen.queryByLabelText(/tuỳ chọn đang bật/)).toBeNull();
  });

  it('filters by the ticked roles with OR (AC5)', async () => {
    const { user } = await renderApp();
    // "Tất cả" (all three roles) → every open task in scope
    expect(screen.getByTestId('role-filter-all')).toBeChecked();
    expect(items()).toHaveLength(10);
    await user.click(screen.getByTestId('role-filter-assignee')); // from "Tất cả": only "Giao cho tôi"
    expect(ids().sort()).toEqual(['TASMOCK0001', 'TASMOCK0003', 'TASMOCK0004', 'TASMOCK0005', 'TASMOCK0009', 'TASMOCK0010']);
    await user.click(screen.getByTestId('role-filter-reporter')); // "Giao cho tôi" OR "Tôi giao"
    expect(items()).toHaveLength(8); // 0006, 0007 are follow-only
    await user.click(screen.getByTestId('role-filter-assignee')); // only "Tôi giao"
    expect(ids().sort()).toEqual(['TASMOCK0002', 'TASMOCK0005', 'TASMOCK0008']);
    await user.click(screen.getByTestId('role-filter-cc')); // "Tôi giao" OR "Tôi theo dõi"
    expect(ids().sort()).toEqual(['TASMOCK0002', 'TASMOCK0005', 'TASMOCK0006', 'TASMOCK0007', 'TASMOCK0008', 'TASMOCK0009']);
    await user.click(screen.getByTestId('role-filter-reporter')); // only "Tôi theo dõi"
    expect(ids().sort()).toEqual(['TASMOCK0006', 'TASMOCK0007', 'TASMOCK0009']);
    await user.click(screen.getByTestId('role-filter-cc')); // unticking the last role → "Tất cả"
    expect(screen.getByTestId('role-filter-all')).toBeChecked();
    expect(items()).toHaveLength(10);
  });

  it('sorts by the 5 fields in both directions (AC6)', async () => {
    const { user } = await renderApp();
    const sortBy = screen.getByTestId('sort-by');
    chooseOption(sortBy, 'Hạn chót');
    expect(screen.getByTestId('sort-dir-asc')).toHaveAttribute('aria-pressed', 'true');
    expect(ids()[0]).toBe('TASMOCK0007'); // most overdue first
    await user.click(screen.getByTestId('sort-dir-desc'));
    expect(ids()[0]).toBe('TASMOCK0008');
    expect(screen.getByTestId('list-count')).toHaveTextContent('Hạn chót: Xa → gần');

    chooseOption(sortBy, 'Tên công việc');
    expect(screen.getByTestId('list-count')).toHaveTextContent('Tên công việc: A → Z');
    const titles = items().map(el => within(el).getByTestId('task-title').textContent ?? '');
    expect([...titles].sort((a, b) => a.localeCompare(b, 'vi'))).toEqual(titles);
    await user.click(screen.getByTestId('sort-dir-desc'));
    const desc = items().map(el => within(el).getByTestId('task-title').textContent ?? '');
    expect(desc).toEqual([...titles].reverse());

    chooseOption(sortBy, 'Trạng thái');
    expect(items()[0].dataset.status).toBe('new');
    await user.click(screen.getByTestId('sort-dir-desc'));
    expect(items()[0].dataset.status).toBe('on_hold');

    chooseOption(sortBy, 'Ngày tạo');
    expect(ids()[0]).toBe('TASMOCK0010');
    await user.click(screen.getByTestId('sort-dir-asc'));
    expect(ids()[0]).toBe('TASMOCK0001');

    chooseOption(sortBy, 'Ưu tiên');
    expect(screen.getByTestId('sort-dir-desc')).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByTestId('sort-dir-asc'));
    expect(ids()[0]).toBe('TASMOCK0010');
  });

  it('searches without diacritics in title, description and reporter (AC7)', async () => {
    const { user } = await renderApp();
    const search = screen.getByTestId('search');
    await user.type(search, 'doi soat');
    expect(ids()).toEqual(['TASMOCK0009']);
    expect(screen.getByTestId('list-count')).toHaveTextContent('1 việc khớp “doi soat”');
    await user.clear(search);
    await user.type(search, 'nguyen thi lan');
    expect(ids().sort()).toEqual(['TASMOCK0001', 'TASMOCK0004']);
    await user.clear(search);
    await user.type(search, 'chi nhanh');
    expect(ids()).toEqual(['TASMOCK0001']);
    await user.clear(search);
    await user.type(search, 'khong ton tai');
    expect(items()).toHaveLength(0);
    expect(screen.getByTestId('empty-state')).toHaveTextContent('Không có việc nào khớp “khong ton tai”');
    expect(screen.queryByTestId('empty-reset')).toBeNull();
  });

  it('shows an empty state with "Đặt lại bộ lọc" when filters hide everything (AC2)', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByTestId('due-filter-tomorrow'));
    await user.click(screen.getByTestId('role-filter-reporter')); // from "Tất cả": only Tôi giao
    await user.click(screen.getByTestId('role-filter-cc')); // Tôi giao + Tôi theo dõi
    expect(items()).toHaveLength(0);
    expect(screen.getByTestId('empty-state')).toHaveTextContent('Không có việc nào khớp bộ lọc');
    await user.click(screen.getByTestId('empty-reset'));
    expect(items()).toHaveLength(6);
    expect(screen.getByTestId('due-filter-all')).toBeChecked();
    expect(screen.getByTestId('role-filter-assignee')).toBeChecked();
    expect(screen.getByTestId('role-filter-reporter')).not.toBeChecked();
    expect(screen.getByTestId('role-filter-cc')).not.toBeChecked();
  });

  it('shows the plain empty state when I have no open task', async () => {
    const { user } = await renderApp({ tasks: [] }, {}, { view: null });
    expect(screen.getByTestId('empty-state')).toHaveTextContent('Không còn việc nào chưa xong');
    expect(screen.queryByRole('group', { name: 'Số việc theo người giao' })).toHaveTextContent('Chưa có người giao');
    await user.click(screen.getByTestId('quick-done'));
    expect(await screen.findByText('Chưa có việc nào xong')).toBeInTheDocument();
    await user.click(screen.getByTestId('quick-all'));
    expect(screen.getByTestId('empty-state')).toHaveTextContent('Danh sách đang trống');
  });
});

describe('"Làm mới" beside the reporter chips', () => {
  it('loads the tasks again while the list stays on screen; a failure is a toast and the list is kept', async () => {
    let fail = false;
    const { user, backend } = await renderApp({}, {
      override: (path, body) => (fail && path === '/api/v1/records/list' && body.object_slug === 'task' ? jsonResponse({ r: 500, msg: 'Hỏng' }) : undefined),
    });
    const before = ids();
    // someone renamed a task on Cogover meanwhile
    const t = backend.state.tasks.find(x => x.id === before[0])!;
    t.subject = 'Tên mới từ Cogover';
    const lists = () => backend.calls.filter(c => c.service === '217' && c.body?.object_slug === 'task').length;
    const n = lists();
    await user.click(screen.getByTestId('list-refresh'));
    await waitFor(() => expect(within(getItem(before[0]!)).getByText('Tên mới từ Cogover')).toBeInTheDocument());
    expect(lists()).toBeGreaterThan(n);
    expect(screen.queryByTestId('loading')).toBeNull();
    expect(screen.getByTestId('list-refresh')).toBeEnabled();

    fail = true;
    await user.click(screen.getByTestId('list-refresh'));
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('Không làm mới được: Hỏng'));
    expect(ids()).toEqual(before);
    expect(screen.getByTestId('list-refresh')).toBeEnabled();
  });
});
