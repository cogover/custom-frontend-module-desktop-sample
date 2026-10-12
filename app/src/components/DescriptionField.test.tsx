import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorHandle, RichTextEditorProps } from '../rte/RichTextEditor';
import type { DescriptionApi, DescriptionField as Field } from './DescriptionField';

// the real editor is covered in rte/RichTextEditor.test.tsx; here the download itself is controlled
const ctl = vi.hoisted(() => ({
  loaded: null as null | { default: (p: RichTextEditorProps) => ReactElement },
  calls: 0,
  settle: null as null | { resolve: (m: unknown) => void; reject: (e: unknown) => void },
}));
vi.mock('../rte/loadEditor', () => ({
  loadEditor: () => {
    ctl.calls++;
    return new Promise((resolve, reject) => (ctl.settle = { resolve, reject }));
  },
  loadedEditor: () => ctl.loaded,
}));

/** Stand-in editor: a textbox whose document is whatever `value` holds. */
let value: unknown[] = [];
let mounts = 0;
function FakeEditor({ id, label, initialValue, onReady }: RichTextEditorProps) {
  const [first] = useState(() => {
    mounts++;
    value = initialValue;
    return true;
  });
  void first;
  const handle: EditorHandle = { getValue: () => value as never };
  queueMicrotask(() => onReady(handle, initialValue as never));
  return <div id={id} role="textbox" aria-label={label} data-testid="field-desc" contentEditable suppressContentEditableWarning />;
}
const fakeModule = { default: FakeEditor };

// a fresh module per test: React.lazy keeps what it downloaded once
let DescriptionField: typeof Field;

const renderField = (initialHtml: string, editing = true) => {
  const api = createRef<DescriptionApi>();
  render(<DescriptionField editing={editing} initialHtml={initialHtml} apiRef={api} />);
  return api;
};

beforeEach(async () => {
  mounts = 0;
  vi.resetModules();
  ({ DescriptionField } = await import('./DescriptionField'));
  ctl.loaded = null;
  ctl.calls = 0;
  ctl.settle = null;
});

describe('DescriptionField', () => {
  it('shows the text in a look-alike box while the editor downloads, then the editor', async () => {
    renderField('<p>Đang <b>tải</b></p>');
    const loading = screen.getByTestId('field-desc-loading');
    expect(loading).toHaveTextContent('Đang tải');
    expect(loading.closest('.rte')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId('field-desc')).toBeNull();
    await waitFor(() => expect(ctl.calls).toBe(1)); // asked for right after the first paint
    expect(screen.getByTestId('field-desc-loading')).toBeInTheDocument();
    await act(async () => ctl.settle!.resolve(fakeModule));
    expect(await screen.findByTestId('field-desc')).toHaveAccessibleName('Mô tả');
    expect(screen.queryByTestId('field-desc-loading')).toBeNull();
  });

  it('never swaps a lazily mounted editor for a new one when the parent re-renders later', async () => {
    const api = createRef<DescriptionApi>();
    const { rerender } = render(<DescriptionField editing={false} initialHtml="" apiRef={api} />);
    await waitFor(() => expect(ctl.calls).toBe(1));
    await act(async () => ctl.settle!.resolve(fakeModule));
    const box = await screen.findByTestId('field-desc');
    ctl.loaded = fakeModule; // the chunk is now known to the loader too
    value = [{ type: 'p', children: [{ text: 'Đang gõ' }] }];
    for (let i = 0; i < 3; i++) rerender(<DescriptionField editing={false} initialHtml="" apiRef={api} />); // e.g. a date was picked
    expect(screen.getByTestId('field-desc')).toBe(box);
    expect(mounts).toBe(1);
    expect(api.current!.read()).toBe('<p>Đang gõ</p>');
  });

  it('shows the placeholder while loading an empty description', () => {
    renderField('', false);
    expect(screen.getByTestId('field-desc-loading')).toHaveTextContent('Ghi chú về việc cần làm');
  });

  it('says when the editor cannot be downloaded and retries on demand', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderField('<p>a</p>');
    await waitFor(() => expect(ctl.calls).toBe(1));
    await act(async () => ctl.settle!.reject(new Error('offline')));
    expect(await screen.findByTestId('field-desc-failed')).toHaveTextContent('Không tải được trình soạn thảo mô tả.');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByTestId('field-desc-retry'));
    expect(ctl.calls).toBe(2); // a fresh download, not the remembered failure
    await act(async () => ctl.settle!.resolve(fakeModule));
    expect(await screen.findByTestId('field-desc')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('mounts a downloaded editor right after the first paint (look-alike box first) and reports changes only', async () => {
    ctl.loaded = fakeModule;
    const api = renderField('<p>Cũ</p>');
    expect(screen.getByTestId('field-desc-loading')).toHaveTextContent('Cũ');
    expect(screen.getByTestId('field-desc-loading').closest('.rte')!.querySelectorAll('.rte-btn')).toHaveLength(14); // same toolbar
    expect(api.current!.read()).toBeNull(); // unchanged, even before the editor is there
    expect(await screen.findByTestId('field-desc')).toBeInTheDocument();
    expect(ctl.calls).toBe(0); // nothing to download
    await act(async () => {});
    expect(api.current!.read()).toBeNull(); // unchanged → leave `description` alone
    value = [{ type: 'p', children: [{ text: 'Mới <b>' }] }];
    expect(api.current!.read()).toBe('<p>Mới &lt;b&gt;</p>');
    value = [{ type: 'p', children: [{ text: '' }] }];
    expect(api.current!.read()).toBe(''); // emptied
  });

  it('when creating, always reports the (possibly empty) description, even before the editor is there', () => {
    const api = renderField('', false);
    expect(api.current!.read()).toBe('');
  });

  it('keeps an unsupported description read-only, as it is, with a note, and never reports it', () => {
    const api = renderField('<p>Bảng</p><table><tr><td>1</td></tr></table><script>alert(1)</script>');
    const box = screen.getByTestId('field-desc');
    expect(box).toHaveAttribute('aria-readonly', 'true');
    expect(box).toHaveAttribute('tabindex', '0');
    expect(box.querySelector('td')).toHaveTextContent('1');
    expect(box.innerHTML).not.toMatch(/script/);
    expect(screen.getByTestId('field-desc-locked')).toHaveTextContent('Mô tả có định dạng chưa hỗ trợ — hãy sửa trên Cogover');
    expect(api.current!.read()).toBeNull();
    expect(ctl.calls).toBe(0); // no editor needed
  });

  it('focuses the editing area when its label is clicked', async () => {
    ctl.loaded = fakeModule;
    const user = userEvent.setup();
    renderField('<p>x</p>');
    await screen.findByTestId('field-desc');
    await user.click(screen.getByText('Mô tả'));
    expect(screen.getByTestId('field-desc')).toHaveFocus();
  });
});
