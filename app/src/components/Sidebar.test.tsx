import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_VIEW, type ViewState } from '../domain/view';
import { Sidebar } from './Sidebar';

const counts = { open: 6, done: 65, all: 71 };
const setup = (view: Partial<ViewState> = {}) => {
  const onChange = vi.fn();
  const onReset = vi.fn();
  render(<Sidebar view={{ ...DEFAULT_VIEW, ...view }} counts={counts} onChange={onChange} onReset={onReset} />);
  return { onChange, onReset, user: userEvent.setup() };
};

describe('Sidebar', () => {
  it('shows the roles as checkboxes (multi-select) in the order Tất cả / Tôi giao / Tôi giao người khác / Giao cho tôi / Tôi theo dõi', () => {
    setup();
    const group = screen.getByRole('group', { name: 'Vai trò' });
    const boxes = within(group).getAllByRole('checkbox');
    expect(boxes.map(b => b.getAttribute('data-testid'))).toEqual(['role-filter-all', 'role-filter-reporter', 'role-filter-delegated', 'role-filter-assignee', 'role-filter-cc']);
    expect(within(group).getByRole('checkbox', { name: 'Tất cả' })).not.toBeChecked();
    expect(within(group).getByRole('checkbox', { name: 'Tôi giao người khác' })).not.toBeChecked();
    expect(within(group).getByRole('checkbox', { name: 'Tôi giao' })).not.toBeChecked();
    expect(within(group).getByRole('checkbox', { name: 'Giao cho tôi' })).toBeChecked();
    expect(within(group).getByRole('checkbox', { name: 'Tôi theo dõi' })).not.toBeChecked();
    expect(screen.queryByRole('radio', { name: 'Giao cho tôi' })).toBeNull();
  });

  it('adds and removes roles, keeping the display order', async () => {
    const { onChange, user } = setup({ roles: ['assignee', 'cc'] });
    await user.click(screen.getByRole('checkbox', { name: 'Tôi giao' }));
    expect(onChange).toHaveBeenLastCalledWith({ roles: ['reporter', 'assignee', 'cc'] }); // all three = "Tất cả"
    await user.click(screen.getByRole('checkbox', { name: 'Giao cho tôi' }));
    expect(onChange).toHaveBeenLastCalledWith({ roles: ['cc'] });
  });

  it('"Tất cả" in Vai trò ticks every role; from there a role keeps only itself, unticking the last goes back', async () => {
    const { onChange, user } = setup({ roles: ['reporter', 'assignee', 'cc'] });
    const group = screen.getByRole('group', { name: 'Vai trò' });
    expect(within(group).getByRole('checkbox', { name: 'Tất cả' })).toBeChecked();
    // like "Mức ưu tiên": with "Tất cả" on, the single roles show unticked
    for (const name of ['Tôi giao', 'Giao cho tôi', 'Tôi theo dõi']) expect(within(group).getByRole('checkbox', { name })).not.toBeChecked();
    expect(screen.getByLabelText('1 tuỳ chọn đang bật')).toBeInTheDocument(); // not the default (only "Giao cho tôi")
    await user.click(within(group).getByRole('checkbox', { name: 'Tôi theo dõi' }));
    expect(onChange).toHaveBeenLastCalledWith({ roles: ['cc'] });
  });

  it('"Tất cả" in Vai trò from a few roles; unticking the only role goes back to "Tất cả"', async () => {
    const { onChange, user } = setup({ roles: ['reporter'] });
    const group = screen.getByRole('group', { name: 'Vai trò' });
    await user.click(within(group).getByRole('checkbox', { name: 'Tất cả' }));
    expect(onChange).toHaveBeenLastCalledWith({ roles: ['reporter', 'assignee', 'cc'] });
    await user.click(within(group).getByRole('checkbox', { name: 'Tôi giao' }));
    expect(onChange).toHaveBeenLastCalledWith({ roles: ['reporter', 'assignee', 'cc'] });
  });

  it('counts roles other than the default as an active filter and offers a reset', async () => {
    const { onReset, user } = setup({ roles: ['reporter'] });
    expect(screen.getByLabelText('1 tuỳ chọn đang bật')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Đặt lại bộ lọc' }));
    expect(onReset).toHaveBeenCalled();
  });

  it('lists the priorities after Vai trò: "Tất cả" or any of them', async () => {
    const { onChange, user } = setup();
    const titles = [...document.querySelectorAll('.fg-title')].map(h => h.textContent);
    expect(titles).toEqual(['Hạn chót', 'Vai trò', 'Mức ưu tiên', 'Sắp xếp theo']);
    const group = screen.getByRole('group', { name: 'Mức ưu tiên' });
    const boxes = within(group).getAllByRole('checkbox');
    expect(boxes.map(b => b.closest('label')?.textContent)).toEqual(['Tất cả', 'Khẩn cấp', 'Cao', 'Trung bình', 'Thấp']);
    expect(boxes.map(b => b.getAttribute('data-testid'))).toEqual([
      'prio-filter-all',
      'prio-filter-urgent',
      'prio-filter-high',
      'prio-filter-medium',
      'prio-filter-low',
    ]);
    expect(within(group).getByRole('checkbox', { name: 'Tất cả' })).toBeChecked();
    await user.click(within(group).getByRole('checkbox', { name: 'Cao' }));
    expect(onChange).toHaveBeenLastCalledWith({ prios: ['high'] });
    // every multi-select chip carries its small tick box
    expect(document.querySelectorAll('.chip.multi .chip-box')).toHaveLength(10); // 5 roles + 5 priorities
  });

  it('adds a priority to the ticked ones, and "Tất cả" clears them', async () => {
    const { onChange, user } = setup({ prios: ['urgent', 'high', 'medium'] });
    const group = screen.getByRole('group', { name: 'Mức ưu tiên' });
    expect(within(group).getByRole('checkbox', { name: 'Tất cả' })).not.toBeChecked();
    expect(screen.getByLabelText('1 tuỳ chọn đang bật')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Thấp' }));
    expect(onChange).toHaveBeenLastCalledWith({ prios: [] }); // all four = "Tất cả"
    await user.click(screen.getByRole('checkbox', { name: 'Khẩn cấp' }));
    expect(onChange).toHaveBeenLastCalledWith({ prios: ['high', 'medium'] });
    await user.click(within(group).getByRole('checkbox', { name: 'Tất cả' }));
    expect(onChange).toHaveBeenLastCalledWith({ prios: [] });
  });

  it('shows the window buttons only when given', () => {
    setup();
    expect(document.querySelector('.side')).not.toHaveClass('has-traffic');
  });

  it('has no "Phím tắt" box any more (moved to the help menu)', () => {
    setup();
    expect(screen.queryByText('Phím tắt')).toBeNull();
    expect(document.querySelector('.tips')).toBeNull();
    expect(screen.getByTestId('count-done')).toHaveTextContent('65');
  });
});
