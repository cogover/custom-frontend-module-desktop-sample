import { describe, expect, it, vi } from 'vitest';

describe('loadEditor', () => {
  it('downloads the editor chunk once and keeps the module for instant rendering', async () => {
    vi.resetModules();
    const { loadEditor, loadedEditor } = await import('./loadEditor');
    expect(loadedEditor()).toBeNull();
    const a = loadEditor();
    expect(loadEditor()).toBe(a);
    const mod = await a;
    expect(typeof mod.default).toBe('function');
    expect(loadedEditor()).toBe(mod);
  });

  it('prefetches when the browser is idle, or after a short delay without requestIdleCallback', async () => {
    vi.resetModules();
    const { prefetchEditorWhenIdle, loadedEditor } = await import('./loadEditor');
    const idle = vi.fn((cb: () => void) => {
      cb();
      return 1;
    });
    prefetchEditorWhenIdle({ requestIdleCallback: idle } as never);
    expect(idle).toHaveBeenCalledWith(expect.any(Function), { timeout: 4000 });
    await vi.waitFor(() => expect(loadedEditor()).not.toBeNull());
    prefetchEditorWhenIdle({ requestIdleCallback: idle } as never); // already there: nothing to do
    expect(idle).toHaveBeenCalledTimes(1);

    vi.resetModules();
    const fresh = await import('./loadEditor');
    const setTimeout = vi.fn();
    fresh.prefetchEditorWhenIdle({ setTimeout } as never);
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 1500);
  });

  it('forgets a failed download so the next open tries again', async () => {
    vi.resetModules();
    vi.doMock('./RichTextEditor', () => {
      throw new Error('offline');
    });
    const { loadEditor, loadedEditor } = await import('./loadEditor');
    const first = loadEditor();
    await expect(first).rejects.toThrow();
    const second = loadEditor();
    expect(second).not.toBe(first); // not the remembered failure
    await expect(second).rejects.toThrow();
    expect(loadedEditor()).toBeNull();
    vi.doUnmock('./RichTextEditor');
  });
});
