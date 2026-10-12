import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, vi } from 'vitest';
import App from '../App';
import { DEFAULT_VIEW, type ViewState } from '../domain/view';
import type { MockBackendOptions } from '../../dev/mock-backend';
import { valueToHtml } from '../rte/html';
import { loadEditor } from '../rte/loadEditor';
import { editorFor } from '../rte/RichTextEditor';
import { FIXED_NOW, freezeTime, installBackend, type FetchOptions } from './fixtures';

/** Every role ticked: most tests look at all 10 seeded open tasks. */
export const ALL_ROLES_VIEW: Partial<ViewState> = { roles: ['reporter', 'assignee', 'cc'] };

interface RenderOptions {
  /** View saved in localStorage before mounting; null keeps the app defaults (only "Giao cho tôi"). */
  view?: Partial<ViewState> | null;
  waitReady?: boolean;
}

export async function renderApp(
  opts: Partial<MockBackendOptions> = {},
  fetchOpts: FetchOptions = {},
  { view: savedView = ALL_ROLES_VIEW, waitReady = true }: RenderOptions = {},
) {
  await loadEditor(); // the description editor chunk, as if prefetched (no loading state in tests)
  if (savedView) localStorage.setItem('cong-viec.view.v1', JSON.stringify({ ...DEFAULT_VIEW, ...savedView }));
  freezeTime();
  const env = installBackend(opts, fetchOpts);
  const user = userEvent.setup();
  const view = render(<App />);
  if (waitReady) await waitFor(() => expect(screen.queryByTestId('app-loading')).toBeNull());
  return { ...env, user, view };
}

export const items = () => screen.queryAllByTestId('task-item');
export const item = (id: string) => items().find(el => el.dataset.taskId === id);
export const getItem = (id: string) => {
  const el = item(id);
  if (!el) throw new Error(`task ${id} is not in the list`);
  return el;
};
export const ids = () => items().map(el => el.dataset.taskId);
export const inItem = (id: string) => within(getItem(id));

/** Switches setTimeout to fake timers (Date stays frozen at FIXED_NOW unless advanced). */
export function useTimers() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], now: FIXED_NOW });
}

export async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

export async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

export const taskOnServer = (backend: { state: { tasks: { id: string }[] } }, id: string) =>
  backend.state.tasks.find(t => t.id === id) as (typeof backend.state.tasks)[number] & Record<string, unknown>;

/** Picks an option of a shadcn (Radix) Select by its label. Works with fake timers too (no waiting). */
export function chooseOption(trigger: HTMLElement, label: string | RegExp) {
  fireEvent.click(trigger);
  const name = typeof label === 'string' ? new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) : label;
  fireEvent.click(screen.getByRole('option', { name }));
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Opens the date picker `testId` and clicks the day `iso` ("YYYY-MM-DD") in its calendar. */
export function pickDate(testId: string, iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  fireEvent.click(screen.getByTestId(testId));
  const calendar = screen.getByTestId('calendar');
  // react-day-picker (vi) names day buttons like "Thứ Bảy, ngày 3 tháng 10 năm 2026"
  const dayName = new RegExp(`ngày ${d} tháng ${pad2(m)} năm ${y}`);
  for (let i = 0; i < 24 && !within(calendar).queryByRole('button', { name: dayName }); i++) {
    const shown = within(calendar).getByText(/^Tháng \d+, \d{4}$/).textContent!.match(/(\d+), (\d{4})/)!;
    const forward = y * 12 + m > Number(shown[2]) * 12 + Number(shown[1]);
    fireEvent.click(within(calendar).getByRole('button', { name: forward ? 'Đến tháng tiếp theo' : 'Đến tháng trước' }));
  }
  fireEvent.click(within(calendar).getByRole('button', { name: dayName }));
}

/** The Plate editor behind the form's "Mô tả" (jsdom cannot type into contenteditable: drive its API). */
export async function descEditor() {
  const editor = editorFor(await screen.findByTestId('field-desc'));
  if (!editor) throw new Error('no description editor');
  return editor;
}

/** Saved-format HTML of what the description editor holds. */
export const descHtml = async () => valueToHtml((await descEditor()).children);

/** Types `text` at the end of the description. */
export async function typeInDesc(text: string) {
  const editor = await descEditor();
  act(() => {
    editor.tf.select(editor.api.end([]));
    editor.tf.insertText(text);
  });
}

/** Replaces the description with one paragraph per line. */
export async function setDescLines(lines: string[]) {
  const editor = await descEditor();
  act(() => editor.tf.setValue(lines.map(text => ({ type: 'p', children: [{ text }] }))));
}
