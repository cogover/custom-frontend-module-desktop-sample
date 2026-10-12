// The description editor must be created once per opened form: changing any other field never
// remounts it (E2E found typed text lost when the editor chunk arrived after the form opened).
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { valueToHtml } from './rte/html';
import { editorFor } from './rte/RichTextEditor';
import { chooseOption, pickDate } from './test/app';
import { ME, freezeTime, installBackend } from './test/fixtures';

// the editor chunk arrives only when the test lets it (as on a slow network, before the idle prefetch)
const gate = vi.hoisted(() => ({ release: () => {}, loaded: null as unknown, calls: 0 }));
vi.mock('./rte/loadEditor', async () => {
  const real = await vi.importActual<typeof import('./rte/loadEditor')>('./rte/loadEditor');
  let pending: Promise<unknown> | null = null;
  return {
    ...real,
    prefetchEditorWhenIdle: () => {},
    loadedEditor: () => gate.loaded,
    loadEditor: () => {
      gate.calls++;
      pending ??= new Promise<void>(r => (gate.release = r)).then(() => real.loadEditor()).then(m => (gate.loaded = m));
      return pending;
    },
  };
});

describe('description editor lifetime', () => {
  it('keeps the same editor (and the typed text) while other fields change, even when its chunk arrived late', async () => {
    freezeTime();
    const { backend } = installBackend();
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.queryByTestId('app-loading')).toBeNull());
    await user.click(screen.getByTestId('open-create'));
    await waitFor(() => expect(gate.calls).toBe(1)); // asked for once the popup painted
    expect(screen.getByTestId('field-desc-loading')).toBeInTheDocument();
    await act(async () => gate.release());
    const box = await screen.findByTestId('field-desc');
    const editor = editorFor(box)!;
    act(() => {
      editor.tf.select(editor.api.end([]));
      editor.tf.insertText('Nội dung');
    });
    await user.type(screen.getByTestId('field-title'), 'Giữ mô tả');

    for (let i = 0; i < 3; i++) {
      chooseOption(screen.getByTestId('field-priority'), i % 2 ? 'Cao' : 'Khẩn cấp');
      chooseOption(screen.getByTestId('field-status'), i % 2 ? 'Đang xử lý' : 'Đang chờ');
      pickDate('field-due-date', `2026-10-0${3 + i}`);
      chooseOption(screen.getByTestId('field-due-time'), '09:00');
      await user.click(screen.getByTestId('field-assignee'));
      await user.click((await screen.findAllByTestId('person-option')).find(o => o.dataset.personId === (i % 2 ? ME : 'PERMOCK00002'))!);
      // same DOM element, same editor, text still there
      expect(screen.getByTestId('field-desc')).toBe(box);
      expect(editorFor(screen.getByTestId('field-desc'))).toBe(editor);
      expect(valueToHtml(editor.children)).toBe('<p>Nội dung</p>');
    }
    expect(screen.queryByTestId('field-desc-loading')).toBeNull();

    await user.click(screen.getByTestId('form-submit'));
    await waitFor(() => expect(screen.queryByTestId('task-dialog')).toBeNull());
    const created = backend.calls.find(c => c.service === '10200')!.body.data;
    expect(created.description).toBe('<p>Nội dung</p>');
    expect(within(document.body).queryByTestId('form-error')).toBeNull();
  });
});
