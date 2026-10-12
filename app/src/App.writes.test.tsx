import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { advance, chooseOption, flush, getItem, inItem, item, items, renderApp, taskOnServer, useTimers } from './test/app';
import { jsonResponse } from './test/fixtures';

const updateCalls = (backend: { calls: { service?: string; body: any }[] }) => backend.calls.filter(c => c.service === '10201');
const deleteCalls = (backend: { calls: { path: string; body: any }[] }) => backend.calls.filter(c => c.path === '/api/v1/records/delete');

describe('tick, status and undo (AC8, AC9)', () => {
  it('tick → resolved, struck through, leaves "chưa xong" after 600 ms with an undo toast', async () => {
    const { backend } = await renderApp();
    useTimers();
    fireEvent.click(inItem('TASMOCK0001').getByTestId('task-checkbox'));
    // stays in place, checked and struck through
    expect(getItem('TASMOCK0001')).toHaveClass('done');
    expect(inItem('TASMOCK0001').getByTestId('task-checkbox')).toBeChecked();
    expect(screen.getByTestId('count-open')).toHaveTextContent('9');
    expect(screen.getByTestId('count-done')).toHaveTextContent('131');
    await advance(300);
    expect(item('TASMOCK0001')).toBeDefined();
    expect(taskOnServer(backend, 'TASMOCK0001').status).toBe('resolved');
    expect(updateCalls(backend).at(-1)?.body.data).toMatchObject({ id: 'TASMOCK0001', status: 'resolved' });
    expect(Object.keys(updateCalls(backend).at(-1)!.body.data).sort()).toEqual(['id', 'object_type', 'status', 'workspace_id']);
    await advance(300);
    expect(item('TASMOCK0001')).toBeUndefined();
    expect(screen.getByTestId('toast')).toHaveTextContent('Đã xong “Chuẩn bị báo cáo doanh thu quý 3”');

    fireEvent.click(screen.getByTestId('toast-undo'));
    await flush();
    expect(item('TASMOCK0001')).toBeDefined();
    expect(taskOnServer(backend, 'TASMOCK0001').status).toBe('in_progress');
    expect(screen.getByTestId('toast')).not.toBeVisible();
    expect(screen.getByTestId('count-open')).toHaveTextContent('10');
  });

  it('un-tick returns to the status before the tick, or "new" when unknown', async () => {
    const { backend, user } = await renderApp();
    await user.click(screen.getByTestId('quick-all'));
    await waitFor(() => expect(items().length).toBeGreaterThan(100));
    await user.click(inItem('TASMOCK0003').getByTestId('task-checkbox')); // pending → resolved
    await waitFor(() => expect(taskOnServer(backend, 'TASMOCK0003').status).toBe('resolved'));
    await user.click(inItem('TASMOCK0003').getByTestId('task-checkbox')); // → pending again
    await waitFor(() => expect(taskOnServer(backend, 'TASMOCK0003').status).toBe('pending'));
    expect(getItem('TASMOCK0003')).not.toHaveClass('done');

    // a done task loaded from the server, never ticked in this session
    expect(getItem('TASMOCK0001')).toBeDefined();
    const doneId = items().find(el => el.dataset.status === 'closed')!.dataset.taskId!;
    await user.click(inItem(doneId).getByTestId('task-checkbox'));
    await waitFor(() => expect(taskOnServer(backend, doneId).status).toBe('new'));
  });

  it('changes status with the card select and saves it (AC9)', async () => {
    const { backend } = await renderApp();
    chooseOption(inItem('TASMOCK0001').getByTestId('task-status'), 'Tạm dừng');
    await waitFor(() => expect(taskOnServer(backend, 'TASMOCK0001').status).toBe('on_hold'));
    expect(getItem('TASMOCK0001').dataset.status).toBe('on_hold');

    useTimers();
    chooseOption(inItem('TASMOCK0004').getByTestId('task-status'), 'Đã đóng');
    await advance(600);
    expect(item('TASMOCK0004')).toBeUndefined();
    expect(screen.getByTestId('toast')).toHaveTextContent('Đã chuyển “Cập nhật hồ sơ năng lực công ty” sang Đã đóng');
    expect(taskOnServer(backend, 'TASMOCK0004').status).toBe('closed');
  });

  it('rolls back and explains when saving the status fails', async () => {
    const { user } = await renderApp({}, {
      override: (path, body) => (path === '/api/v1/records' && body.data.status ? jsonResponse({ r: 13, msg: 'Không có quyền sửa' }) : undefined),
    });
    await user.click(inItem('TASMOCK0005').getByTestId('task-checkbox'));
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('Không lưu được trạng thái “Phỏng vấn ứng viên vị trí kế toán”: Không có quyền sửa'));
    expect(inItem('TASMOCK0005').getByTestId('task-checkbox')).not.toBeChecked();
    expect(getItem('TASMOCK0005').dataset.status).toBe('new');
    expect(screen.getByTestId('count-done')).toHaveTextContent('130');
  });

  it('keeps sorting by status stable until the change settles', async () => {
    await renderApp();
    chooseOption(screen.getByTestId('sort-by'), 'Trạng thái');
    const before = items().map(el => el.dataset.taskId);
    useTimers();
    chooseOption(inItem(before[0]!).getByTestId('task-status'), 'Tạm dừng');
    expect(items().map(el => el.dataset.taskId)).toEqual(before);
    await advance(600);
    expect(items().map(el => el.dataset.taskId)).not.toEqual(before);
    expect(screen.getByTestId('toast')).not.toBeVisible();
  });
});

describe('quick title edit (AC12)', () => {
  it('Enter saves, Esc cancels, blur saves, empty keeps the old name', async () => {
    const { backend, user } = await renderApp();
    await user.dblClick(inItem('TASMOCK0005').getByTestId('task-title'));
    const input = inItem('TASMOCK0005').getByTestId('title-edit');
    expect(input).toHaveFocus();
    expect(input).toHaveValue('Phỏng vấn ứng viên vị trí kế toán');
    await user.clear(input);
    await user.type(input, 'Phỏng vấn 3 ứng viên kế toán{Enter}');
    expect(inItem('TASMOCK0005').getByTestId('task-title')).toHaveTextContent('Phỏng vấn 3 ứng viên kế toán');
    await waitFor(() => expect(taskOnServer(backend, 'TASMOCK0005').subject).toBe('Phỏng vấn 3 ứng viên kế toán'));

    await user.dblClick(inItem('TASMOCK0005').getByTestId('task-title'));
    await user.type(inItem('TASMOCK0005').getByTestId('title-edit'), ' NHÁP{Escape}');
    expect(inItem('TASMOCK0005').getByTestId('task-title')).toHaveTextContent('Phỏng vấn 3 ứng viên kế toán');
    expect(screen.queryByTestId('task-dialog')).toBeNull();

    await user.dblClick(inItem('TASMOCK0005').getByTestId('task-title'));
    await user.clear(inItem('TASMOCK0005').getByTestId('title-edit'));
    await user.keyboard('{Enter}');
    expect(inItem('TASMOCK0005').getByTestId('task-title')).toHaveTextContent('Phỏng vấn 3 ứng viên kế toán');

    const calls = updateCalls(backend).length;
    await user.dblClick(inItem('TASMOCK0005').getByTestId('task-title'));
    await user.type(inItem('TASMOCK0005').getByTestId('title-edit'), ' (gấp)');
    await user.click(screen.getByTestId('list-title')); // blur
    await waitFor(() => expect(taskOnServer(backend, 'TASMOCK0005').subject).toBe('Phỏng vấn 3 ứng viên kế toán (gấp)'));
    expect(updateCalls(backend)).toHaveLength(calls + 1);
  });

  it('a press outside the editor only ends the edit: it saves and does not open a popup (another card or the same one)', async () => {
    const { backend, user } = await renderApp();
    // another card
    await user.dblClick(inItem('TASMOCK0005').getByTestId('task-title'));
    await user.type(inItem('TASMOCK0005').getByTestId('title-edit'), ' A');
    await user.click(getItem('TASMOCK0001').querySelector('.desc')!);
    expect(screen.queryByTestId('task-dialog')).toBeNull();
    expect(inItem('TASMOCK0005').queryByTestId('title-edit')).toBeNull();
    await waitFor(() => expect(taskOnServer(backend, 'TASMOCK0005').subject).toBe('Phỏng vấn ứng viên vị trí kế toán A'));
    await user.click(getItem('TASMOCK0001').querySelector('.desc')!); // next click opens normally
    expect(screen.getByTestId('task-dialog')).toHaveTextContent('Chuẩn bị báo cáo doanh thu quý 3');
    await user.keyboard('{Escape}');

    // the same card
    await user.dblClick(inItem('TASMOCK0001').getByTestId('task-title'));
    await user.type(inItem('TASMOCK0001').getByTestId('title-edit'), ' B');
    await user.click(getItem('TASMOCK0001').querySelector('.desc')!);
    expect(screen.queryByTestId('task-dialog')).toBeNull();
    await waitFor(() => expect(taskOnServer(backend, 'TASMOCK0001').subject).toBe('Chuẩn bị báo cáo doanh thu quý 3 B'));
    await user.click(getItem('TASMOCK0001').querySelector('.desc')!);
    expect(screen.getByTestId('task-dialog')).toBeInTheDocument();
  });

  it('other controls still work on the press that ends an edit; a drag without click is not remembered', async () => {
    const { backend, user } = await renderApp();
    await user.dblClick(inItem('TASMOCK0005').getByTestId('task-title'));
    await user.type(inItem('TASMOCK0005').getByTestId('title-edit'), ' C');
    await user.click(inItem('TASMOCK0010').getByTestId('task-checkbox'));
    await waitFor(() => expect(taskOnServer(backend, 'TASMOCK0010').status).toBe('resolved'));
    await waitFor(() => expect(taskOnServer(backend, 'TASMOCK0005').subject).toBe('Phỏng vấn ứng viên vị trí kế toán C'));

    // press outside without a click (drag): the following real click opens the popup
    await user.dblClick(inItem('TASMOCK0005').getByTestId('task-title'));
    const desc = getItem('TASMOCK0003').querySelector('.desc')!;
    await user.pointer([{ keys: '[MouseLeft>]', target: desc }, { target: screen.getByTestId('list-title') }, { keys: '[/MouseLeft]' }]);
    await new Promise(r => setTimeout(r, 0));
    expect(inItem('TASMOCK0005').queryByTestId('title-edit')).toBeNull();
    await user.click(desc);
    expect(screen.getByTestId('task-dialog')).toHaveTextContent('Rà soát quy trình nhập kho');
  });

  it('marks the list while an edit is open (arrow cursor on the cards), and clears it when the edit ends', async () => {
    const { user } = await renderApp();
    const list = () => screen.getByRole('list', { name: 'Chưa xong' });
    expect(list()).toHaveClass('tasks');
    expect(list()).not.toHaveClass('is-editing');
    // Esc
    await user.dblClick(inItem('TASMOCK0005').getByTestId('task-title'));
    expect(list()).toHaveClass('tasks', 'is-editing');
    await user.keyboard('{Escape}');
    expect(list()).not.toHaveClass('is-editing');
    // Enter
    await user.dblClick(inItem('TASMOCK0005').getByTestId('task-title'));
    expect(list()).toHaveClass('is-editing');
    await user.keyboard('{Enter}');
    expect(list()).not.toHaveClass('is-editing');
    // a press on another card's title ends it (and opens nothing)
    await user.dblClick(inItem('TASMOCK0005').getByTestId('task-title'));
    await user.click(inItem('TASMOCK0001').getByTestId('task-title'));
    expect(list()).not.toHaveClass('is-editing');
    expect(screen.queryByTestId('task-dialog')).toBeNull();
    // a follow-only card cannot be renamed: the click opens its (read-only) popup, which a press outside
    // no longer closes; the list behind it is not in edit mode
    await user.dblClick(inItem('TASMOCK0006').getByTestId('task-title'));
    expect(screen.getByTestId('task-view')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Chưa xong', hidden: true })).not.toHaveClass('is-editing');
  });

  it('reports a failed rename and restores the old name', async () => {
    const { user } = await renderApp({}, {
      override: (path, body) => (path === '/api/v1/records' && body.data.subject ? jsonResponse({ r: 2, msg: 'Lỗi lưu' }) : undefined),
    });
    await user.dblClick(inItem('TASMOCK0005').getByTestId('task-title'));
    await user.type(inItem('TASMOCK0005').getByTestId('title-edit'), ' X{Enter}');
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('Không đổi được tên “Phỏng vấn ứng viên vị trí kế toán”: Lỗi lưu'));
    expect(inItem('TASMOCK0005').getByTestId('task-title')).toHaveTextContent('Phỏng vấn ứng viên vị trí kế toán');
  });
});

describe('delete asks for confirmation (AC13)', () => {
  /** The cards have no delete button: open the popup, then its trash icon. */
  const askDelete = async (user: { click: (el: Element) => Promise<void> }, id: string) => {
    if (!screen.queryByTestId('task-dialog')) await user.click(getItem(id));
    await user.click(await screen.findByTestId('form-delete'));
  };

  it('has no delete button on the cards; the popup trash icon opens "Xoá công việc?"; Huỷ and Esc delete nothing', async () => {
    const { backend, user } = await renderApp();
    expect(screen.queryAllByTestId('task-delete')).toHaveLength(0);
    await askDelete(user, 'TASMOCK0005');
    const box = screen.getByTestId('confirm-delete');
    expect(box).toHaveAttribute('role', 'alertdialog');
    expect(within(box).getByRole('heading', { name: 'Xoá công việc?' })).toBeInTheDocument();
    expect(box).toHaveTextContent('“Phỏng vấn ứng viên vị trí kế toán” sẽ bị xoá vĩnh viễn khỏi Cogover.');
    expect(screen.getByTestId('confirm-delete-cancel')).toHaveFocus();
    expect(screen.getByTestId('confirm-delete-ok')).toHaveClass('btn-danger');
    await user.click(screen.getByTestId('confirm-delete-cancel'));
    expect(screen.queryByTestId('confirm-delete')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('form-delete')).toHaveFocus()); // focus goes back
    await askDelete(user, 'TASMOCK0005');
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('confirm-delete')).toBeNull();
    expect(screen.getByTestId('task-dialog')).toBeInTheDocument(); // Esc only closed the question
    expect(item('TASMOCK0005')).toBeDefined();
    expect(deleteCalls(backend)).toHaveLength(0);
  });

  it('deletes on the server right away after "Xoá", with a plain toast (no undo)', async () => {
    const { backend, user } = await renderApp({}, {}, { view: null });
    expect(screen.getByTestId('count-open')).toHaveTextContent('6');
    await askDelete(user, 'TASMOCK0005');
    await user.click(screen.getByTestId('confirm-delete-ok'));
    await waitFor(() => expect(item('TASMOCK0005')).toBeUndefined());
    expect(screen.queryByTestId('task-dialog')).toBeNull(); // the popup of the deleted task closes
    expect(deleteCalls(backend)).toHaveLength(1);
    expect(deleteCalls(backend)[0].body).toEqual({ workspace_id: 'WSDEMO0000001', object_type: 'OTDEMOTASK001', ids: ['TASMOCK0005'] });
    expect(taskOnServer(backend, 'TASMOCK0005')).toBeUndefined();
    expect(screen.queryByTestId('confirm-delete')).toBeNull();
    expect(screen.getByTestId('toast')).toHaveTextContent('Đã xoá “Phỏng vấn ứng viên vị trí kế toán”');
    expect(screen.queryByTestId('toast-undo')).toBeNull();
    expect(screen.getByTestId('count-open')).toHaveTextContent('5');
  });

  it('keeps the task and reports the error when the server refuses or fails', async () => {
    let mode: 'refuse' | 'fail' = 'refuse';
    const { user } = await renderApp({}, {
      override: path =>
        path === '/api/v1/records/delete'
          ? mode === 'refuse'
            ? jsonResponse({ r: 0, data: { deleted: [], not_deleted: ['TASMOCK0005'] } })
            : jsonResponse({ r: 7, msg: 'Không có quyền xoá' })
          : undefined,
    });
    await askDelete(user, 'TASMOCK0005');
    await user.click(screen.getByTestId('confirm-delete-ok'));
    await waitFor(() =>
      expect(screen.getByTestId('toast')).toHaveTextContent('Không xoá được “Phỏng vấn ứng viên vị trí kế toán”: Máy chủ từ chối xoá công việc này.'),
    );
    expect(item('TASMOCK0005')).toBeDefined();
    expect(screen.queryByTestId('confirm-delete')).toBeNull();
    mode = 'fail';
    await askDelete(user, 'TASMOCK0005');
    await user.click(screen.getByTestId('confirm-delete-ok'));
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('Không có quyền xoá'));
    expect(item('TASMOCK0005')).toBeDefined();
  });

  it('disables the buttons while deleting', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>(r => (release = r));
    const { user } = await renderApp({}, { override: async path => (path === '/api/v1/records/delete' ? (await gate, undefined) : undefined) });
    await askDelete(user, 'TASMOCK0005');
    await user.click(screen.getByTestId('confirm-delete-ok'));
    expect(screen.getByTestId('confirm-delete-ok')).toHaveTextContent('Đang xoá…');
    expect(screen.getByTestId('confirm-delete-ok')).toBeDisabled();
    expect(screen.getByTestId('confirm-delete-cancel')).toBeDisabled();
    await user.keyboard('{Escape}'); // ignored while the request runs
    expect(screen.getByTestId('confirm-delete')).toBeInTheDocument();
    release();
    await waitFor(() => expect(item('TASMOCK0005')).toBeUndefined());
  });
});

describe('follow-only tasks are read-only (AC14)', () => {
  it('disables every write control on the card', async () => {
    const { user, backend } = await renderApp();
    const card = getItem('TASMOCK0006');
    expect(card).toHaveAttribute('data-readonly', 'true');
    expect(getItem('TASMOCK0005')).toHaveAttribute('data-readonly', 'false');
    const c = within(card);
    expect(c.getByTestId('task-role')).toHaveTextContent('Theo dõi');
    expect(c.getByTestId('task-checkbox')).toBeDisabled();
    expect(c.getByTestId('task-status')).toBeDisabled();
    await user.dblClick(c.getByTestId('task-title'));
    expect(c.queryByTestId('title-edit')).toBeNull();
    expect(updateCalls(backend)).toHaveLength(0);
    expect(within(getItem('TASMOCK0009')).queryByTestId('task-role')).toBeNull(); // assignee and follower
  });
});
