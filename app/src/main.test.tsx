import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { freezeTime, installBackend } from './test/fixtures';

describe('bootstrap (main.tsx)', () => {
  it('applies the saved theme and mounts the app into #root', async () => {
    freezeTime();
    installBackend();
    localStorage.setItem('cong-viec.theme', 'dark');
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    vi.resetModules();
    const mod = await import('./main');
    expect(document.documentElement.dataset.theme).toBe('dark');
    await waitFor(() => expect(screen.getAllByTestId('task-item')).toHaveLength(6), { timeout: 5000 }); // default roles: only "Giao cho tôi"
    expect(() => mod.bootstrap(null)).toThrow('Không tìm thấy phần tử #root');
    act(() => mod.appRoot.unmount());
    root.remove();
  }, 30_000); // imports the whole app: slow under coverage when every suite runs in parallel
});
