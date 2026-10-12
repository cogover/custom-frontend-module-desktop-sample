import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getItem, ids, inItem, items, renderApp } from './test/app';
import { ME } from './test/fixtures';

type Call = { path: string; body: any };
const isDoneQuery = (c: Call) =>
  c.path === '/api/v1/records/list' &&
  c.body?.object_slug === 'task' &&
  c.body.filters.some((f: any) => f.field === 'status' && f.params.includes('resolved'));
const doneCounts = (calls: Call[]) => calls.filter(c => isDoneQuery(c) && c.body.size === 1).map(c => c.body);
const donePages = (calls: Call[]) => calls.filter(c => isDoneQuery(c) && c.body.size === 100).map(c => c.body);
const scopeOf = (body: any) => ({ type: body.type, logic: body.logic_sequence, fields: body.filters.map((f: any) => f.field) });
const ASSIGNED_TO_ME = ['TASMOCK0001', 'TASMOCK0003', 'TASMOCK0004', 'TASMOCK0005', 'TASMOCK0009', 'TASMOCK0010'];

describe('Vai trò: multi-select roles (AC3, AC5)', () => {
  it('starts with only "Giao cho tôi" ticked and counts by that role', async () => {
    const { backend } = await renderApp({}, {}, { view: null });
    const group = screen.getByRole('group', { name: 'Vai trò' });
    const boxes = within(group).getAllByRole('checkbox');
    expect(boxes.map(b => b.closest('label')?.textContent)).toEqual(['Tất cả', 'Tôi giao', 'Tôi giao người khác', 'Giao cho tôi', 'Tôi theo dõi']);
    expect(boxes.map(b => b.dataset.testid)).toEqual(['role-filter-all', 'role-filter-reporter', 'role-filter-delegated', 'role-filter-assignee', 'role-filter-cc']);
    expect(screen.getByRole('checkbox', { name: 'Giao cho tôi' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Tôi giao' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Tôi theo dõi' })).not.toBeChecked();
    expect(screen.getByTestId('role-filter-all')).not.toBeChecked();

    expect(ids().sort()).toEqual(ASSIGNED_TO_ME);
    expect(screen.getByTestId('count-open')).toHaveTextContent('6');
    expect(screen.getByTestId('count-done')).toHaveTextContent('65');
    expect(screen.getByTestId('count-all')).toHaveTextContent('71');
    // the done count is asked for "assigned to me" only: type 1, assignee AND status
    expect(doneCounts(backend.calls).map(scopeOf)).toEqual([{ type: 1, logic: '', fields: ['assignee', 'status'] }]);
    // default roles are not "filtering": no badge
    expect(screen.queryByLabelText(/tuỳ chọn đang bật/)).toBeNull();
  });

  it('"Tôi giao người khác": tasks I gave to someone else, counted on the server with assignee != me', async () => {
    const { user, backend } = await renderApp({}, {}, { view: null });
    await user.click(screen.getByTestId('role-filter-delegated')); // with "Giao cho tôi"
    expect(ids().sort()).toEqual([...ASSIGNED_TO_ME, 'TASMOCK0002', 'TASMOCK0008'].sort());
    await waitFor(() => expect(scopeOf(doneCounts(backend.calls).at(-1))).toEqual({ type: 3, logic: '(1 OR (2 AND 3)) AND 4', fields: ['assignee', 'reporter', 'assignee', 'status'] }));
    await user.click(screen.getByTestId('role-filter-assignee')); // only "Tôi giao người khác"
    expect(ids().sort()).toEqual(['TASMOCK0002', 'TASMOCK0008']); // 0005: I gave it to myself
    await waitFor(() => expect(scopeOf(doneCounts(backend.calls).at(-1))).toEqual({ type: 1, logic: '', fields: ['reporter', 'assignee', 'status'] }));
    expect(doneCounts(backend.calls).at(-1).filters[1]).toEqual({ field: 'assignee', op: '!=', params: '$currentUser', fieldType: 'lookup_normal' });
    expect(screen.getByTestId('role-filter-delegated')).toBeChecked();
    expect(screen.getByTestId('role-filter-reporter')).not.toBeChecked();
  });

  it('ORs ticked roles, recounts done tasks on the server with only those roles', async () => {
    const { user, backend } = await renderApp({}, {}, { view: null });
    await user.click(screen.getByTestId('role-filter-reporter'));
    expect(ids().sort()).toEqual([...ASSIGNED_TO_ME, 'TASMOCK0002', 'TASMOCK0008'].sort());
    expect(screen.getByTestId('count-open')).toHaveTextContent('8');
    await waitFor(() => expect(screen.getByTestId('count-done')).toHaveTextContent('130'));
    expect(scopeOf(doneCounts(backend.calls).at(-1))).toEqual({ type: 3, logic: '(1 OR 2) AND 3', fields: ['assignee', 'reporter', 'status'] });
    expect(screen.getByLabelText('1 tuỳ chọn đang bật')).toBeInTheDocument();

    await user.click(screen.getByTestId('role-filter-assignee')); // only "Tôi giao"
    expect(ids().sort()).toEqual(['TASMOCK0002', 'TASMOCK0005', 'TASMOCK0008']);
    await waitFor(() => expect(screen.getByTestId('count-done')).toHaveTextContent('65'));
    expect(scopeOf(doneCounts(backend.calls).at(-1))).toEqual({ type: 1, logic: '', fields: ['reporter', 'status'] });

    await user.click(screen.getByTestId('role-filter-cc')); // "Tôi giao" OR "Tôi theo dõi"
    await waitFor(() => expect(screen.getByTestId('count-done')).toHaveTextContent('75'));
    expect(scopeOf(doneCounts(backend.calls).at(-1))).toEqual({ type: 3, logic: '(1 OR 2) AND 3', fields: ['reporter', 'ccs', 'status'] });
    expect(screen.getByTestId('count-open')).toHaveTextContent('6');
    expect(screen.getByTestId('count-all')).toHaveTextContent('81');
  });

  it('unticking the only ticked role goes back to "Tất cả" (every role), as in "Mức ưu tiên"', async () => {
    const { user, backend } = await renderApp({}, {}, { view: null });
    await user.click(screen.getByTestId('role-filter-assignee'));
    expect(screen.getByTestId('role-filter-all')).toBeChecked();
    expect(screen.getByTestId('role-filter-assignee')).not.toBeChecked();
    expect(items()).toHaveLength(10);
    await waitFor(() => expect(scopeOf(doneCounts(backend.calls).at(-1))).toEqual({ type: 3, logic: '(1 OR 2 OR 3) AND 4', fields: ['assignee', 'reporter', 'ccs', 'status'] }));
    expect(screen.getByLabelText('1 tuỳ chọn đang bật')).toBeInTheDocument();
    // from "Tất cả", a role keeps only itself
    await user.click(screen.getByTestId('role-filter-reporter'));
    expect(ids().sort()).toEqual(['TASMOCK0002', 'TASMOCK0005', 'TASMOCK0008']);
    expect(screen.getByTestId('role-filter-all')).not.toBeChecked();
  });

  it('shows "Chưa chọn vai trò nào" for a view saved with no role, without querying, and resets to the default', async () => {
    // no longer reachable by clicking (the last role goes back to "Tất cả"), only from a view saved by an older version
    const { user, backend } = await renderApp({}, {}, { view: { roles: [] } });
    const before = doneCounts(backend.calls).length;
    expect(items()).toHaveLength(0);
    const empty = screen.getByTestId('empty-state');
    expect(empty).toHaveTextContent('Chưa chọn vai trò nào');
    expect(empty).toHaveTextContent('Tick ít nhất một mục trong Vai trò để xem công việc.');
    expect(screen.getByTestId('count-open')).toHaveTextContent('0');
    expect(screen.getByTestId('count-done')).toHaveTextContent('0');
    expect(screen.getByTestId('count-all')).toHaveTextContent('0');
    // even with a search typed, the roles message wins
    await user.type(screen.getByTestId('search'), 'bao cao');
    expect(screen.getByTestId('empty-state')).toHaveTextContent('Chưa chọn vai trò nào');
    // "Đã xong" with no role: no request at all
    await user.click(screen.getByTestId('quick-done'));
    expect(screen.getByTestId('empty-state')).toHaveTextContent('Chưa chọn vai trò nào');
    expect(doneCounts(backend.calls)).toHaveLength(before);
    expect(donePages(backend.calls)).toHaveLength(0);
    expect(screen.queryByTestId('load-more')).toBeNull();

    await user.click(screen.getByTestId('empty-reset'));
    expect(screen.getByTestId('role-filter-assignee')).toBeChecked();
    expect(screen.getByTestId('search')).toHaveValue('bao cao');
    await user.clear(screen.getByTestId('search'));
    await waitFor(() => expect(items()).toHaveLength(65)); // done tasks assigned to me
    expect(screen.getByTestId('done-progress')).toHaveTextContent('Đã tải 65/65 việc đã xong');
  });

  it('reloads the done pages for the new roles (keeping open tasks) when roles change', async () => {
    const { user, backend } = await renderApp({}, {}, { view: { quick: 'all' } });
    await waitFor(() => expect(items()).toHaveLength(6 + 65));
    expect(scopeOf(donePages(backend.calls)[0])).toEqual({ type: 1, logic: '', fields: ['assignee', 'status'] });
    await user.click(screen.getByTestId('role-filter-cc'));
    // 9 done tasks follow me without being assigned to me; 2 open follow-only tasks appear too
    await waitFor(() => expect(screen.getByTestId('done-progress')).toHaveTextContent('Đã tải 74/74 việc đã xong'));
    expect(items()).toHaveLength(8 + 74);
    expect(scopeOf(donePages(backend.calls).at(-1))).toEqual({ type: 3, logic: '(1 OR 2) AND 3', fields: ['assignee', 'ccs', 'status'] });
    expect(donePages(backend.calls).at(-1).search_after).toEqual([]); // from the first page again
    expect(screen.getByTestId('count-all')).toHaveTextContent('82');
  });

  it('ignores answers that belong to an older roles selection (race)', async () => {
    let releaseOld: () => void = () => {};
    const oldGate = new Promise<void>(r => (releaseOld = r));
    let oldAnswered = 0;
    const { user } = await renderApp({}, {
      override: async (_path, body) => {
        // hold every done query for "Tôi giao" alone
        const reporterOnly = body?.object_slug === 'task' && body.type === 1 && body.filters[0].field === 'reporter' && body.filters[1]?.params.includes('resolved');
        if (!reporterOnly) return undefined;
        await oldGate;
        oldAnswered++;
        return undefined;
      },
    }, { view: { quick: 'done' } });
    await waitFor(() => expect(items()).toHaveLength(65));

    await user.click(screen.getByTestId('role-filter-reporter')); // assignee + reporter
    await waitFor(() => expect(items()).toHaveLength(100));
    await user.click(screen.getByTestId('role-filter-assignee')); // reporter only → held
    await user.click(screen.getByTestId('role-filter-cc')); // reporter + cc
    await user.click(screen.getByTestId('role-filter-reporter')); // cc only
    await waitFor(() => expect(screen.getByTestId('done-progress')).toHaveTextContent('Đã tải 19/19 việc đã xong'));
    expect(items()).toHaveLength(19);

    releaseOld(); // the stale "Tôi giao" count (65) and page (65 rows) arrive now
    await waitFor(() => expect(oldAnswered).toBe(2));
    await new Promise(r => setTimeout(r, 30));
    expect(screen.getByTestId('count-done')).toHaveTextContent('19');
    expect(screen.getByTestId('done-progress')).toHaveTextContent('Đã tải 19/19 việc đã xong');
    expect(items()).toHaveLength(19);
    expect(screen.getByTestId('role-filter-cc')).toBeChecked();
    expect(screen.getByTestId('role-filter-reporter')).not.toBeChecked();
  });

  it('keeps the done count in step with ticks for the ticked roles', async () => {
    const { user } = await renderApp({}, {}, { view: null });
    await user.click(inItem('TASMOCK0005').getByTestId('task-checkbox'));
    expect(screen.getByTestId('count-done')).toHaveTextContent('66');
    expect(screen.getByTestId('count-open')).toHaveTextContent('5');
  });

  it('ticks the new task’s role when it would be hidden by the ticked roles (AC10)', async () => {
    const { user, backend } = await renderApp({}, {}, { view: null });
    await user.click(screen.getByTestId('open-create'));
    await user.type(screen.getByTestId('field-title'), 'Việc tôi giao cho Lan');
    await user.click(screen.getByTestId('field-assignee'));
    await user.click((await screen.findAllByTestId('person-option')).find(o => o.dataset.personId === 'PERMOCK00002')!);
    await user.click(screen.getByTestId('form-submit'));
    await waitFor(() => expect(screen.queryByTestId('task-dialog')).toBeNull());
    expect(screen.getByTestId('role-filter-reporter')).toBeChecked();
    expect(screen.getByTestId('role-filter-assignee')).toBeChecked();
    expect(screen.getByTestId('role-filter-cc')).not.toBeChecked();
    const created = backend.state.tasks.at(-1)!;
    expect(created).toMatchObject({ reporter: ME, assignee: 'PERMOCK00002' });
    expect(getItem(created.id)).toBeDefined();
    expect(JSON.parse(localStorage.getItem('cong-viec.view.v1')!).roles).toEqual(['reporter', 'assignee']);
  });
});
