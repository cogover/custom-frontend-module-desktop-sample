import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FIXED_NOW, person, task } from '../test/fixtures';
import { TaskItem } from './TaskItem';

const renderItem = (t = task()) =>
  render(
    <ul>
      <TaskItem
        task={t}
        readOnly={false}
        now={FIXED_NOW}
        onToggle={vi.fn()}
        onStatus={vi.fn()}
        onRename={vi.fn()}
        onOpen={vi.fn()}
      />
    </ul>,
  );

describe('TaskItem "Người giao" cell', () => {
  it('is an avatar carrying the full name as accessible name, no native tooltip (a hover card instead)', () => {
    renderItem(task({ reporter: person('P2', 'Lan', 'Nguyễn Thị') }));
    const cell = screen.getByTestId('task-reporter');
    expect(cell).not.toHaveAttribute('title');
    expect(screen.getByRole('img', { name: 'Người giao: Nguyễn Thị Lan' })).toBe(cell);
    expect(cell.querySelector('.avatar')).toHaveTextContent('L');
    // the name stays in the DOM for the wrapped (≤980px) layout, where CSS shows it again
    expect(cell.querySelector('.pname')).toHaveTextContent('Nguyễn Thị Lan');
  });

  it('shows a muted dash when nobody assigned the task', () => {
    renderItem(task({ reporter: null }));
    const cell = screen.getByTestId('task-reporter');
    expect(cell).toHaveClass('none');
    expect(screen.getByRole('img', { name: 'Chưa có người giao' })).toBe(cell);
    expect(cell.querySelector('.pshort')).toHaveTextContent('—');
  });
});

describe('TaskItem "Giao cho" cell and priority flag', () => {
  it('shows the assignee as an avatar after the reporter, the role and name for the wrapped layout', () => {
    renderItem(task({ reporter: person('P2', 'Lan', 'Nguyễn Thị'), assignee: person('P3', 'Minh', 'Trần Quang') }));
    const cell = screen.getByTestId('task-assignee');
    expect(screen.getByRole('img', { name: 'Giao cho: Trần Quang Minh' })).toBe(cell);
    expect(cell.querySelector('.avatar')).toHaveTextContent('M');
    expect(cell.querySelector('.prole')).toHaveTextContent('Giao cho');
    expect(cell.querySelector('.pname')).toHaveTextContent('Trần Quang Minh');
    expect(screen.getByTestId('task-reporter').querySelector('.prole')).toHaveTextContent('Người giao');
    const meta = cell.closest('.meta')!;
    expect(Array.from(meta.children).map(c => c.getAttribute('data-testid'))).toEqual(['task-status', 'task-reporter', 'task-assignee', 'task-priority', 'task-due']);
  });

  it('shows a muted dash when the task is assigned to nobody', () => {
    renderItem(task({ assignee: null }));
    expect(screen.getByRole('img', { name: 'Chưa giao cho ai' })).toHaveClass('none');
  });

  it('draws the priority as a flag named by its label (the label only shows when the row wraps)', () => {
    renderItem(task({ priority: 'high' }));
    const prio = screen.getByTestId('task-priority');
    expect(screen.getByRole('img', { name: 'Ưu tiên: Cao' })).toBe(prio);
    expect(prio).not.toHaveAttribute('title');
    expect(prio.querySelector('.prio-label')).toHaveTextContent('Cao');
  });

  it('shows a hover card at once (no delay) on the reporter, the assignee and the priority', async () => {
    const user = userEvent.setup();
    renderItem(task({ reporter: person('P2', 'Lan', 'Nguyễn Thị'), assignee: null, priority: 'urgent' }));
    await user.hover(screen.getByTestId('task-reporter'));
    const reporter = await screen.findByTestId('task-reporter-card');
    expect(reporter).toHaveTextContent('Nguyễn Thị Lan');
    expect(reporter).toHaveTextContent('Người giao');
    expect(reporter.querySelector('.avatar')).toHaveTextContent('L');
    await user.unhover(screen.getByTestId('task-reporter'));
    await user.hover(screen.getByTestId('task-assignee'));
    expect(await screen.findByTestId('task-assignee-card')).toHaveTextContent('Chưa giao cho ai');
    await user.hover(screen.getByTestId('task-priority'));
    const prio = await screen.findByTestId('task-priority-card');
    expect(prio).toHaveTextContent('Mức ưu tiên');
    expect(within(prio).getByText('Khẩn cấp').closest('.prio')).toHaveAttribute('data-tone', 'red');
  });

  it('opens the hover cards with no delay', async () => {
    const src = (await import('./TaskItem.tsx?raw')).default;
    expect(src).toContain('const HOVER = { openDelay: 0, closeDelay: 100 } as const;');
  });

  it('has no delete button on the card (deleting is in the popup)', () => {
    renderItem();
    expect(screen.queryByTestId('task-delete')).toBeNull();
    expect(screen.queryByRole('button', { name: /Xoá/ })).toBeNull();
  });

  it('puts the deadline text in its own span (two lines at most in the column layout)', () => {
    renderItem();
    expect(screen.getByTestId('task-due').querySelector('.due-text')).not.toBeNull();
  });
});

describe('TaskItem "mark as done" circle', () => {
  it('keeps the checkbox (same name) and explains the action in a tooltip', () => {
    const { rerender } = renderItem(task({ subject: 'Gửi báo cáo', status: 'new' }));
    const box = screen.getByTestId('task-checkbox');
    expect(box).toHaveAttribute('type', 'checkbox');
    expect(box).toHaveAccessibleName('Gửi báo cáo');
    expect(box.closest('label')).toHaveAttribute('title', 'Đánh dấu hoàn thành');
    rerender(
      <ul>
        <TaskItem task={task({ subject: 'Gửi báo cáo', status: 'resolved' })} readOnly={false} now={FIXED_NOW} onToggle={vi.fn()} onStatus={vi.fn()} onRename={vi.fn()} onOpen={vi.fn()} />
      </ul>,
    );
    expect(screen.getByTestId('task-checkbox')).toBeChecked();
    expect(screen.getByTestId('task-checkbox').closest('label')).toHaveAttribute('title', 'Đánh dấu chưa xong');
    rerender(
      <ul>
        <TaskItem task={task({ status: 'new' })} readOnly now={FIXED_NOW} onToggle={vi.fn()} onStatus={vi.fn()} onRename={vi.fn()} onOpen={vi.fn()} />
      </ul>,
    );
    expect(screen.getByTestId('task-checkbox')).toBeDisabled();
    expect(screen.getByTestId('task-checkbox').closest('label')).toHaveAttribute('title', 'Bạn chỉ theo dõi công việc này');
  });
});

describe('TaskItem quick title edit', () => {
  it('reports when the editor opens and closes (the list shows the arrow cursor meanwhile)', () => {
    const onEditing = vi.fn();
    const props = { readOnly: false, now: FIXED_NOW, onToggle: vi.fn(), onStatus: vi.fn(), onRename: vi.fn(), onOpen: vi.fn(), onEditing };
    const { unmount } = render(
      <ul>
        <TaskItem task={task()} {...props} />
      </ul>,
    );
    expect(onEditing).not.toHaveBeenCalled();
    fireEvent.doubleClick(screen.getByTestId('task-title'));
    expect(onEditing).toHaveBeenLastCalledWith(true);
    fireEvent.keyDown(screen.getByTestId('title-edit'), { key: 'Escape' });
    expect(onEditing).toHaveBeenLastCalledWith(false);
    fireEvent.doubleClick(screen.getByTestId('task-title'));
    expect(onEditing).toHaveBeenLastCalledWith(true);
    unmount(); // the card disappears while editing (e.g. filtered out): the list is not left marked
    expect(onEditing).toHaveBeenLastCalledWith(false);
    expect(onEditing.mock.calls.filter(([on]) => on)).toHaveLength(onEditing.mock.calls.filter(([on]) => !on).length);
  });
});
