import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { chooseOption, getItem, inItem, items, renderApp } from './test/app';
import { freezeTime, installBackend, jsonResponse } from './test/fixtures';

describe('loading, error and session states (AC2)', () => {
  it('shows the loading state while the first requests are pending', async () => {
    freezeTime();
    let release: () => void = () => {};
    const gate = new Promise<void>(r => (release = r));
    installBackend({}, { override: async () => (await gate, undefined) });
    render(<App />);
    expect(screen.getByTestId('app-loading')).toHaveTextContent('Đang tải công việc…');
    expect(screen.getByTestId('list-count')).toHaveTextContent('');
    release();
    await waitFor(() => expect(items()).toHaveLength(6)); // default roles: only "Giao cho tôi"
    expect(screen.queryByTestId('app-loading')).toBeNull();
  });

  it('shows the API error with a working "Thử lại"', async () => {
    let broken = true;
    const { user } = await renderApp({}, { override: () => (broken ? jsonResponse({ r: 500, msg: 'Máy chủ bận' }) : undefined) });
    expect(screen.getByTestId('app-error')).toHaveTextContent('Máy chủ bận');
    broken = false;
    await user.click(screen.getByTestId('app-retry'));
    await waitFor(() => expect(items()).toHaveLength(10));
    expect(screen.queryByTestId('app-error')).toBeNull();
  });

  it('shows a network error', async () => {
    freezeTime();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    render(<App />);
    expect(await screen.findByTestId('app-error')).toHaveTextContent('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
  });

  it('asks to sign in again on 401/403', async () => {
    await renderApp({}, { scenario: 'expired' });
    const box = screen.getByTestId('session-expired');
    expect(box).toHaveTextContent('Phiên đăng nhập đã hết hạn');
    expect(screen.getByRole('link', { name: 'Đăng nhập lại' })).toHaveAttribute('href', '/');
  });

  it('treats a rejected CSRF token as an expired session', async () => {
    await renderApp({}, { scenario: 'csrf' });
    expect(screen.getByTestId('session-expired')).toBeInTheDocument();
  });

  it('switches to the expired state when a write hits 403, closing any popup', async () => {
    const { user } = await renderApp({}, {
      override: path => (path === '/api/v1/records' ? jsonResponse({ msg: 'Forbidden' }, 403) : undefined),
    });
    await user.click(inItem('TASMOCK0005').getByTestId('task-checkbox'));
    expect(await screen.findByTestId('session-expired')).toBeInTheDocument();
    expect(screen.queryByTestId('toast')).not.toBeVisible();
  });

  it('reports a failed "Tải thêm" and lets the user retry', async () => {
    let failDone = true;
    const { user } = await renderApp({}, {
      override: (path, body) =>
        failDone && path === '/api/v1/records/list' && body.size === 100 && body.sorts?.[0]?.updated ? jsonResponse({ r: 4, msg: 'Quá tải' }) : undefined,
    });
    await user.click(screen.getByTestId('quick-done'));
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('Không tải được việc đã xong: Quá tải'));
    expect(screen.getByTestId('done-progress')).toHaveTextContent('Đã tải 0/130 việc đã xong');
    failDone = false;
    await user.click(screen.getByTestId('load-more'));
    await waitFor(() => expect(items()).toHaveLength(100));
  });
});

describe('theme (AC15)', () => {
  it('toggles light/dark, remembers it and updates the button label', async () => {
    const { user } = await renderApp();
    const btn = screen.getByTestId('theme-toggle');
    expect(btn).toHaveAccessibleName('Chuyển sang giao diện tối');
    await user.click(btn);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('cong-viec.theme')).toBe('dark');
    expect(btn).toHaveAccessibleName('Chuyển sang giao diện sáng');
    await user.click(btn);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('cong-viec.theme')).toBe('light');
  });

  it('follows the system theme until the user picks one', async () => {
    const listeners: (() => void)[] = [];
    let dark = true;
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (q: string) =>
        ({
          get matches() {
            return q.includes('dark') ? dark : false;
          },
          media: q,
          addEventListener: (_: string, fn: () => void) => listeners.push(fn),
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
    await renderApp();
    expect(screen.getByTestId('theme-toggle')).toHaveAccessibleName('Chuyển sang giao diện sáng');
    dark = false;
    act(() => listeners.forEach(fn => fn()));
    expect(screen.getByTestId('theme-toggle')).toHaveAccessibleName('Chuyển sang giao diện tối');
  });
});

describe('keyboard shortcuts', () => {
  it('N opens the create popup, / focuses search, T toggles the theme — not while typing', async () => {
    const { user } = await renderApp();
    await user.keyboard('/');
    expect(screen.getByTestId('search')).toHaveFocus();
    await user.keyboard('n');
    expect(screen.queryByTestId('task-dialog')).toBeNull();
    expect(screen.getByTestId('search')).toHaveValue('n');
    await user.clear(screen.getByTestId('search'));
    (document.activeElement as HTMLElement).blur();
    await user.keyboard('t');
    expect(document.documentElement.dataset.theme).toBe('dark');
    await user.keyboard('N');
    expect(screen.getByTestId('task-dialog')).toBeInTheDocument();
    await user.keyboard('t');
    expect(document.documentElement.dataset.theme).toBe('dark');
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('task-dialog')).toBeNull();
  });

  it('leaves letters to a focused Select (typeahead) instead of running shortcuts', async () => {
    const { user } = await renderApp();
    screen.getByTestId('sort-by').focus();
    await user.keyboard('n');
    expect(screen.queryByTestId('task-dialog')).toBeNull();
    inItem('TASMOCK0005').getByTestId('task-status').focus();
    await user.keyboard('t');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('does not open the popup when an option of the status menu is clicked (portal events)', async () => {
    await renderApp();
    fireEvent.click(inItem('TASMOCK0005').getByTestId('task-status'));
    fireEvent.click(screen.getByRole('option', { name: 'Đang chờ' }));
    expect(screen.queryByTestId('task-dialog')).toBeNull();
    await waitFor(() => expect(getItem('TASMOCK0005').dataset.status).toBe('pending'));
  });

  it('ignores N / T while the help menu is open; Esc only closes the menu', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByTestId('help-toggle'));
    expect(await screen.findByTestId('help-menu')).toBeInTheDocument();
    await user.keyboard('n');
    await user.keyboard('t');
    expect(screen.queryByTestId('task-dialog')).toBeNull();
    expect(document.documentElement.dataset.theme).toBeUndefined();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('help-menu')).toBeNull());
    expect(items()).toHaveLength(10);
    await waitFor(() => expect(screen.getByTestId('help-toggle')).toHaveFocus());
    await user.keyboard('n'); // menu closed → shortcuts work again
    expect(screen.getByTestId('task-dialog')).toBeInTheDocument();
  });
});

describe('remembered view (AC19)', () => {
  it('restores quick filter, deadline, roles and sort after a reload', async () => {
    const { user, view } = await renderApp({}, {}, { view: null });
    await user.click(screen.getByTestId('due-filter-overdue'));
    await user.click(screen.getByTestId('role-filter-assignee'));
    await user.click(screen.getByTestId('role-filter-cc'));
    chooseOption(screen.getByTestId('sort-by'), 'Tên công việc');
    expect(JSON.parse(localStorage.getItem('cong-viec.view.v1')!).roles).toEqual(['cc']);
    view.unmount();

    installBackend();
    render(<App />);
    await waitFor(() => expect(screen.queryByTestId('app-loading')).toBeNull());
    expect(screen.getByTestId('due-filter-overdue')).toBeChecked();
    expect(screen.getByTestId('role-filter-cc')).toBeChecked();
    expect(screen.getByTestId('role-filter-assignee')).not.toBeChecked();
    expect(screen.getByTestId('sort-by')).toHaveTextContent('Tên công việc');
    expect(items().map(el => el.dataset.taskId).sort()).toEqual(['TASMOCK0007', 'TASMOCK0009']);
  });

  it('opens a card by clicking but not while text is selected', async () => {
    const { user } = await renderApp();
    const sel = vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'chữ' } as unknown as Selection);
    fireEvent.click(getItem('TASMOCK0001').querySelector('.desc')!);
    expect(screen.queryByTestId('task-dialog')).toBeNull();
    sel.mockRestore();
    await user.click(getItem('TASMOCK0006').querySelector('.ttext')!); // read-only title opens the popup
    expect(screen.getByTestId('task-dialog')).toBeInTheDocument();
  });
});
