import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockStatusRule } from '../dev/mock-seed';
import { getItem, inItem, renderApp } from './test/app';
import { jsonResponse } from './test/fixtures';

const rule = { transitionRules: [mockStatusRule()] };
const optionNames = () => screen.getAllByRole('option').map(o => o.textContent);
const updates = (backend: { calls: { service?: string }[] }) => backend.calls.filter(c => c.service === '10201').length;

describe('status workflow (CONTRACT §4 "Quy trình trạng thái")', () => {
  it('offers only the allowed next statuses on the card', async () => {
    await renderApp(rule);
    fireEvent.click(inItem('TASMOCK0001').getByTestId('task-status')); // in_progress
    expect(optionNames()).toEqual(['Đang xử lý', 'Đang chờ', 'Tạm dừng', 'Đã xử lý']);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    fireEvent.click(inItem('TASMOCK0005').getByTestId('task-status')); // new
    expect(optionNames()).toEqual(['Mới', 'Đang xử lý', 'Đã huỷ']);
  });

  it('locks the checkbox where the workflow has no way to "Đã xử lý" / back, and offers no Hoàn tác', async () => {
    const { user, backend } = await renderApp(rule);
    const newBox = inItem('TASMOCK0005').getByTestId('task-checkbox');
    expect(newBox).toBeDisabled();
    expect(newBox.closest('label')).toHaveAttribute('title', 'Quy trình không cho chuyển từ “Mới” sang “Đã xử lý”');
    // in_progress → resolved is allowed; resolved → in_progress is not: no Hoàn tác, and no unticking
    const box = inItem('TASMOCK0001').getByTestId('task-checkbox');
    expect(box).toBeEnabled();
    await user.click(box);
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('Đã xong “Chuẩn bị báo cáo doanh thu quý 3”'));
    expect(screen.queryByTestId('toast-undo')).toBeNull();
    expect(backend.calls.filter(c => c.service === '10201').at(-1)?.body.data.status).toBe('resolved');
    await user.click(screen.getByTestId('quick-all'));
    expect(inItem('TASMOCK0001').getByTestId('task-checkbox')).toBeDisabled();
  });

  it('keeps Hoàn tác when the way back exists (in_progress ⇄ pending)', async () => {
    const { user } = await renderApp(rule, {}, { view: { roles: ['reporter', 'assignee', 'cc'], quick: 'all' } });
    fireEvent.click(inItem('TASMOCK0001').getByTestId('task-status'));
    fireEvent.click(screen.getByRole('option', { name: 'Đang chờ' }));
    await waitFor(() => expect(inItem('TASMOCK0001').getByTestId('task-status')).toHaveTextContent('Đang chờ'));
    // still in the view ("Tất cả"): no toast at all; the card offers the way back
    fireEvent.click(inItem('TASMOCK0001').getByTestId('task-status'));
    expect(optionNames()).toContain('Đang xử lý');
    await user.keyboard('{Escape}');
  });

  it('creates in the initial statuses only, and the detail view offers the next steps only', async () => {
    const { user } = await renderApp(rule);
    await user.click(screen.getByTestId('open-create'));
    fireEvent.click(screen.getByTestId('field-status'));
    expect(optionNames()).toEqual(['Mới']);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await user.click(screen.getByTestId('form-cancel'));
    await user.click(getItem('TASMOCK0004').querySelector('.desc, .main')!); // on_hold
    fireEvent.click(within(screen.getByTestId('task-view')).getByTestId('view-status'));
    expect(optionNames()).toEqual(['Đang xử lý', 'Tạm dừng', 'Đã huỷ']); // the list's usual order
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await user.click(screen.getByTestId('form-edit'));
    fireEvent.click(screen.getByTestId('field-status'));
    expect(optionNames()).toEqual(['Đang xử lý', 'Tạm dừng', 'Đã huỷ']);
  });

  it('explains a refusal from the server in Vietnamese (rule changed after loading) and keeps the old status', async () => {
    const { backend } = await renderApp({}, {
      override: (path, body) =>
        path === '/api/v1/records' && body.data?.status === 'pending'
          ? jsonResponse({ r: 48, msg: 'Your target value [pending] is not allowed, current value: [new], available values: [new, in_progress, cancelled]' }, 422)
          : undefined,
    });
    fireEvent.click(inItem('TASMOCK0005').getByTestId('task-status'));
    fireEvent.click(screen.getByRole('option', { name: 'Đang chờ' }));
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('Không lưu được trạng thái “Phỏng vấn ứng viên vị trí kế toán”: Quy trình không cho chuyển từ “Mới” sang “Đang chờ”'));
    await waitFor(() => expect(inItem('TASMOCK0005').getByTestId('task-status')).toHaveTextContent('Mới'));
    expect(updates(backend)).toBe(0); // the refused request is the override, not the store
  });

  it('works without a readable rule (every status offered)', async () => {
    await renderApp({}, { override: path => (path === '/api/v1/object_security/transition_rule' ? jsonResponse({ r: 403, msg: 'Forbidden' }, 403) : undefined) });
    fireEvent.click(inItem('TASMOCK0005').getByTestId('task-status'));
    expect(optionNames()).toHaveLength(7);
    expect(screen.queryByTestId('session-expired')).toBeNull();
  });
});
