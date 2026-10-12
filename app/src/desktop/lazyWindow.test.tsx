import { act, render, screen, waitFor, within } from '@testing-library/react';
import { Suspense, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadEditor } from '../rte/loadEditor';
import { freezeTime, installBackend } from '../test/fixtures';
import { DOCK_APPS } from './apps';
import { Desktop } from './Desktop';
import { lazyWindow, preloadWhenIdle } from './lazyWindow';

// a fresh module registry per test file: the lazy windows of DOCK_APPS are not downloaded yet when this file starts

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState(null, '', '/');
});

describe('lazyWindow', () => {
  it('suspends until the chunk is there, then renders at once once preloaded (no fallback)', async () => {
    let resolve!: (m: { default: () => ReactElement }) => void;
    const load = vi.fn(() => new Promise<{ default: () => ReactElement }>(r => (resolve = r)));
    const Win = lazyWindow(load);
    const { unmount } = render(
      <Suspense fallback={<p>chờ</p>}>
        <Win />
      </Suspense>,
    );
    expect(screen.getByText('chờ')).toBeInTheDocument();
    await act(async () => resolve({ default: () => <p>cửa sổ</p> }));
    expect(await screen.findByText('cửa sổ')).toBeInTheDocument();
    unmount();

    // a second window from a chunk preloaded beforehand never shows its fallback
    const Ready = lazyWindow(async () => ({ default: () => <p>sẵn sàng</p> }));
    await Ready.preload();
    render(
      <Suspense fallback={<p>không được hiện</p>}>
        <Ready />
      </Suspense>,
    );
    expect(screen.getByText('sẵn sàng')).toBeInTheDocument();
    expect(screen.queryByText('không được hiện')).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('downloads once, and again after a failure', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('mạng')).mockResolvedValue({ default: () => null });
    const Win = lazyWindow(load);
    await expect(Win.preload()).rejects.toThrow('mạng');
    await Win.preload();
    await Win.preload();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('preloads when the browser is idle (or after 2 s without requestIdleCallback)', () => {
    const a = vi.fn(async () => {});
    const b = vi.fn(async () => {});
    const idle = vi.fn((cb: () => void) => (cb(), 1));
    preloadWhenIdle([a, b], { requestIdleCallback: idle } as unknown as Window);
    expect(idle).toHaveBeenCalledWith(expect.any(Function), { timeout: 5000 });
    expect([a.mock.calls.length, b.mock.calls.length]).toEqual([1, 1]);

    vi.useFakeTimers();
    const c = vi.fn(async () => {});
    preloadWhenIdle([c], window as Window & { requestIdleCallback?: undefined });
    expect(c).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(c).toHaveBeenCalledTimes(1);
  });
});

describe('Desktop: the loading frame of a window whose code is not there yet', () => {
  it('shows the window (buttons, app name, the app’s own loading box), then the app takes over', async () => {
    window.history.replaceState(null, '', '/?app=settings');
    await loadEditor();
    freezeTime();
    installBackend();
    render(<Desktop />);
    const frame = screen.getByTestId('window-frame');
    expect(within(frame).getByRole('heading', { level: 1, name: 'Cài đặt' })).toBeInTheDocument();
    expect(within(frame).getByRole('group', { name: 'Điều khiển cửa sổ' })).toBeInTheDocument();
    expect(within(frame).getByTestId('window-loading')).toHaveTextContent('Đang tải thiết lập…');
    expect(within(frame).getByTestId('window-loading')).toHaveTextContent('Lấy thiết lập cá nhân của bạn từ Cogover.');
    expect(frame.querySelector('.topbar .topbar-spacer')).not.toBeNull();
    // same box as the app's own loading state, then the settings
    expect(await screen.findByTestId('settings-app')).toBeInTheDocument();
    expect(screen.queryByTestId('window-frame')).toBeNull();
  });

  it('every app has its loading text; the lazy windows can be preloaded', () => {
    expect(DOCK_APPS.map(a => [a.id, a.loading?.title, typeof a.preload])).toEqual([
      ['cong-viec', 'Đang tải công việc…', 'undefined'],
      ['ghi-chu', 'Đang tải ghi chú…', 'function'],
      ['dev-tools', 'Đang mở Dev tools…', 'function'],
      ['cai-dat', 'Đang tải thiết lập…', 'function'],
    ]);
  });

  it('opens a window at once when its code was preloaded', async () => {
    await DOCK_APPS.find(a => a.id === 'ghi-chu')!.preload!();
    await loadEditor();
    freezeTime();
    installBackend();
    render(<Desktop />);
    await screen.findAllByTestId('task-item');
    act(() => screen.getByTestId('dock-app-ghi-chu').click());
    expect(screen.queryByTestId('window-frame')).toBeNull();
    expect(screen.getByTestId('notes-app')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('notes-loading')).toBeNull());
  });
});
