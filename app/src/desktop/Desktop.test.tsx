import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadEditor } from '../rte/loadEditor';
import { mockSeed } from '../../dev/mock-seed';
import { showWallpaper } from '../settings/wallpaper';
import { FIXED_NOW, ME, freezeTime, installBackend } from '../test/fixtures';
import { DOCK_APPS, type DockApp } from './apps';
import { Desktop } from './Desktop';
import { Dock } from './Dock';

const taskList = () => screen.queryAllByTestId('task-item');
const desktop = () => document.querySelector<HTMLElement>('.desktop')!;

async function renderDesktop() {
  await loadEditor();
  freezeTime();
  const env = installBackend();
  const user = userEvent.setup();
  render(<Desktop />);
  await waitFor(() => expect(taskList().length).toBeGreaterThan(0));
  return { ...env, user };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Desktop (macOS style)', () => {
  it('shows the dock with the app running and the three window buttons top-left of the window', async () => {
    await renderDesktop();
    const dock = screen.getByRole('navigation', { name: 'Ứng dụng' });
    const app = within(dock).getByRole('button', { name: 'Công việc' });
    expect(app).toHaveAttribute('data-running', 'true');
    expect(app.querySelector('.dock-dot')).not.toBeNull();
    const buttons = within(screen.getByRole('group', { name: 'Điều khiển cửa sổ' })).getAllByRole('button');
    // the three macOS buttons, then the left-rail toggle (CONTRACT §5 1d)
    expect(buttons.map(b => b.getAttribute('aria-label'))).toEqual(['Đóng', 'Thu nhỏ', 'Phóng to toàn màn hình', 'Ẩn cột trái']);
    expect(document.querySelector('.side')).toHaveClass('has-traffic');
    expect(desktop().dataset.window).toBe('open');
  });

  it('ignores ⌘\\ (hide the left rail) while minimised', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (q: string) => ({ matches: q.includes('min-width: 881px'), media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
    );
    const { user } = await renderDesktop();
    await user.click(screen.getByTestId('win-minimize'));
    fireEvent.keyDown(document.body, { key: '\\', metaKey: true });
    expect(localStorage.getItem('cong-viec.side')).toBeNull();
    await user.click(screen.getByTestId('dock-app-cong-viec'));
    fireEvent.keyDown(document.body, { key: '\\', metaKey: true });
    expect(JSON.parse(localStorage.getItem('cong-viec.side')!)).toEqual({ width: 256, hidden: true });
  });

  it('minimises to the dock keeping everything, and the dock icon brings the window back', async () => {
    const { user, fetchMock } = await renderDesktop();
    await user.type(screen.getByRole('searchbox'), 'zzz');
    await user.click(screen.getByTestId('win-minimize'));
    expect(desktop().dataset.window).toBe('minimized');
    expect(document.querySelector('.page')).toHaveAttribute('hidden');
    expect(screen.getByTestId('dock-app-cong-viec')).toHaveAttribute('data-running', 'true');

    // shortcuts are off while the window is hidden ("n" would open the create popup)
    fireEvent.keyDown(document.body, { key: 'n' });
    expect(screen.queryByRole('dialog')).toBeNull();

    const before = fetchMock.mock.calls.length;
    await user.click(screen.getByTestId('dock-app-cong-viec'));
    expect(desktop().dataset.window).toBe('open');
    expect(document.querySelector('.page')).not.toHaveAttribute('hidden');
    expect(screen.getByRole('searchbox')).toHaveValue('zzz'); // state kept
    expect(fetchMock.mock.calls.length).toBe(before); // nothing reloaded
  });

  it('closes the app (no window, no running dot) and opens it fresh from the dock', async () => {
    const { user, fetchMock } = await renderDesktop();
    await user.type(screen.getByRole('searchbox'), 'zzz');
    await user.click(screen.getByTestId('win-close'));
    expect(desktop().dataset.window).toBe('closed');
    expect(document.querySelector('.page')).toBeNull();
    expect(screen.getByTestId('dock-app-cong-viec')).not.toHaveAttribute('data-running');
    expect(document.querySelector('.dock-dot')).toBeNull();

    const before = fetchMock.mock.calls.length;
    await user.click(screen.getByTestId('dock-app-cong-viec'));
    await waitFor(() => expect(taskList().length).toBeGreaterThan(0));
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(fetchMock.mock.calls.length).toBeGreaterThan(before); // data loaded again
  });

  it('fills the whole page with the green button (dock hidden), remembers it and toggles back', async () => {
    const { user } = await renderDesktop();
    await user.click(screen.getByTestId('win-maximize'));
    expect(desktop()).toHaveAttribute('data-max', 'true');
    expect(screen.queryByTestId('dock')).toBeNull();
    expect(localStorage.getItem('cong-viec.window')).toBe('max');
    const max = screen.getByTestId('win-maximize');
    expect(max).toHaveAttribute('aria-pressed', 'true');
    expect(max).toHaveAccessibleName('Thu về cửa sổ');

    await user.click(max);
    expect(desktop()).not.toHaveAttribute('data-max');
    expect(screen.getByTestId('dock')).toBeInTheDocument();
    expect(localStorage.getItem('cong-viec.window')).toBe('normal');
  });

  it('starts full-page when that was the last choice; minimising shows the dock again', async () => {
    localStorage.setItem('cong-viec.window', 'max');
    const { user } = await renderDesktop();
    expect(desktop()).toHaveAttribute('data-max', 'true');
    await user.click(screen.getByTestId('win-minimize'));
    expect(desktop()).not.toHaveAttribute('data-max');
    expect(screen.getByTestId('dock')).toBeInTheDocument();
    await user.click(screen.getByTestId('dock-app-cong-viec'));
    expect(desktop()).toHaveAttribute('data-max', 'true'); // still full-page when restored
  });

  it('lists the apps of DOCK_APPS: Công việc, Ghi chú, Dev tools, then Cài đặt (all windows of this SPA)', () => {
    expect(DOCK_APPS.map(a => [a.id, a.name, !!a.window])).toEqual([
      ['cong-viec', 'Công việc', true],
      ['ghi-chu', 'Ghi chú', true],
      ['dev-tools', 'Dev tools', true],
      ['cai-dat', 'Cài đặt', true],
    ]);
  });

  it('opens Ghi chú from the dock: Công việc is minimised (kept), one window in front; the dock switches back', async () => {
    const { user, fetchMock } = await renderDesktop();
    await user.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByTestId('dock-app-ghi-chu')).not.toHaveAttribute('data-running');
    await user.click(screen.getByTestId('dock-app-ghi-chu'));
    await screen.findByTestId('notes-tree');
    expect(desktop().dataset.front).toBe('ghi-chu');
    expect(desktop().dataset.window).toBe('open');
    expect(screen.getByTestId('dock-app-ghi-chu')).toHaveAttribute('data-running', 'true');
    expect(screen.getByTestId('dock-app-cong-viec')).toHaveAttribute('data-running', 'true');
    const pages = Array.from(document.querySelectorAll<HTMLElement>('.page'));
    expect(pages.map(p => [p.classList.contains('notes-app'), p.hidden])).toEqual([
      [false, true], // Công việc minimised
      [true, false],
    ]);

    // "n" belongs to the window in front: a new note, not a new task
    fireEvent.keyDown(document.body, { key: 'n' });
    expect(screen.getByTestId('note-editor')).toBeInTheDocument();
    expect(screen.queryByTestId('task-dialog')).toBeNull();

    const before = fetchMock.mock.calls.length;
    await user.click(screen.getByTestId('dock-app-cong-viec'));
    expect(desktop().dataset.front).toBe('cong-viec');
    expect(screen.getByDisplayValue('zzz')).toBeInTheDocument(); // the task search was kept
    expect(fetchMock.mock.calls.length).toBe(before);
    expect(screen.getByTestId('notes-app')).toHaveAttribute('hidden');

    // closing the notes window (from the front again) leaves Công việc minimised
    await user.click(screen.getByTestId('dock-app-ghi-chu'));
    const notesClose = within(screen.getByTestId('notes-app')).getByTestId('win-close');
    await user.click(notesClose);
    expect(screen.queryByTestId('notes-app')).toBeNull();
    expect(desktop().dataset.window).toBe('minimized');
    expect(screen.getByTestId('dock-app-ghi-chu')).not.toHaveAttribute('data-running');
  });

  it('a #/note/<id> link opens the notes window first (Công việc waits in the dock)', async () => {
    window.history.replaceState(null, '', '/#/note/NOTMOCK01');
    await loadEditor();
    freezeTime();
    installBackend();
    render(<Desktop />);
    expect(await screen.findByTestId('note-title')).toHaveTextContent('Publish Custom Frontend Module');
    expect(desktop().dataset.front).toBe('ghi-chu');
    expect(screen.getByTestId('dock-app-cong-viec')).not.toHaveAttribute('data-running');
    window.history.replaceState(null, '', '/');
  });

  it('a note link followed while Công việc is in front brings the notes window up', async () => {
    await renderDesktop();
    window.location.hash = '#/note/NOTMOCK02';
    expect(await screen.findByTestId('note-title')).toHaveTextContent('Mention trong ghi chú');
    expect(desktop().dataset.front).toBe('ghi-chu');
    window.history.replaceState(null, '', '/');
  });
});

describe('Desktop: the URL brings a refresh back to the same window (CONTRACT §9.1)', () => {
  const here = () => window.location.search + window.location.hash;

  async function renderAt(url: string) {
    window.history.replaceState(null, '', url);
    await loadEditor();
    freezeTime();
    const env = installBackend();
    render(<Desktop />);
    return { ...env, user: userEvent.setup() };
  }

  it('?app=notes opens Ghi chú (not Công việc), with the search it had', async () => {
    await renderAt('/?app=notes&q=publish');
    await screen.findByTestId('notes-tree');
    expect(desktop().dataset.front).toBe('ghi-chu');
    expect(screen.getByTestId('dock-app-cong-viec')).not.toHaveAttribute('data-running');
    expect(within(screen.getByTestId('notes-app')).getByRole('searchbox')).toHaveValue('publish');
    expect(here()).toBe('?app=notes&q=publish');
  });

  it('an unknown ?app= opens Công việc (its search is not given to Công việc)', async () => {
    await renderAt('/?app=crm&q=zzz');
    await waitFor(() => expect(taskList().length).toBeGreaterThan(0));
    expect(desktop().dataset.front).toBe('cong-viec');
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('?q= without ?app= is the search of Công việc', async () => {
    await renderAt('/?q=zzz');
    expect(await screen.findByRole('searchbox')).toHaveValue('zzz');
    expect(desktop().dataset.front).toBe('cong-viec');
  });

  it('follows the window in front: app, search and open item; no link of the other app is left behind', async () => {
    const { user } = await renderDesktop();
    await waitFor(() => expect(here()).toBe('?app=tasks'));
    await user.type(screen.getByRole('searchbox'), 'zzz');
    await waitFor(() => expect(here()).toBe('?app=tasks&q=zzz'));

    await user.click(screen.getByTestId('dock-app-ghi-chu'));
    await screen.findByTestId('notes-tree');
    expect(here()).toBe('?app=notes');
    await user.click((await screen.findAllByTestId('pinned-note'))[0]); // Publish Custom Frontend Module
    await waitFor(() => expect(here()).toBe('?app=notes#/note/NOTMOCK01'));

    await user.click(screen.getByTestId('dock-app-cong-viec'));
    expect(here()).toBe('?app=tasks&q=zzz'); // the note link is gone: a refresh opens Công việc
    await user.click(screen.getByTestId('dock-app-ghi-chu'));
    expect(here()).toBe('?app=notes#/note/NOTMOCK01');

    // closing the window in front leaves the URL (a refresh then opens Công việc)
    await user.click(within(screen.getByTestId('notes-app')).getByTestId('win-close'));
    expect(here()).toBe('');
  });

  it('a task link followed while Ghi chú is in front brings Công việc up with the task', async () => {
    await renderAt('/?app=notes');
    await screen.findByTestId('notes-tree');
    window.location.hash = '#/task/TASMOCK0001';
    expect(await screen.findByTestId('task-dialog')).toBeInTheDocument();
    expect(desktop().dataset.front).toBe('cong-viec');
    expect(here()).toBe('?app=tasks#/task/TASMOCK0001');
  });
});

describe('Desktop: wallpaper and the settings window (CONTRACT §10)', () => {
  class LoadingImage {
    onload: (() => void) | null = null;
    set src(_v: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  afterEach(() => {
    void showWallpaper(null, { preload: false });
  });

  it('shows my wallpaper (user_settings) behind the windows at start', async () => {
    vi.stubGlobal('Image', LoadingImage);
    await loadEditor();
    freezeTime();
    const meta = { file_id: 'FILWP', fileName: 'bien.jpg', fileSize: 10, fileExt: 'jpg' };
    installBackend({ records: { ...mockSeed(FIXED_NOW).records, user_settings: [{ id: 'USTMOCK1', desktop_wallpaper: JSON.stringify(meta), created_by: ME, updated: 1 }] } });
    render(<Desktop />);
    await waitFor(() => expect(document.documentElement.style.getPropertyValue('--wallpaper')).toBe('url("/files/FILWP/original/bien.jpg?redirect=true")'));
  });

  it('starts with the wallpaper this browser showed last, before the settings are read', async () => {
    localStorage.setItem('cong-viec.wallpaper', '/files/FILC/original/c.jpg?redirect=true');
    await loadEditor();
    freezeTime();
    installBackend({}, { override: path => (path === '/api/v1/records/list' ? new Promise<Response>(() => {}) : undefined) });
    render(<Desktop />);
    expect(document.documentElement.style.getPropertyValue('--wallpaper')).toBe('url("/files/FILC/original/c.jpg?redirect=true")');
  });

  it('opens Cài đặt from the dock (?app=settings) and a refresh comes back to it', async () => {
    const { user } = await renderDesktop();
    await user.click(screen.getByTestId('dock-app-cai-dat'));
    expect(await screen.findByTestId('settings-app')).toBeInTheDocument();
    expect(desktop().dataset.front).toBe('cai-dat');
    await waitFor(() => expect(window.location.search).toBe('?app=settings'));
    cleanup();
    render(<Desktop />);
    expect(await screen.findByTestId('wallpaper-choose')).toBeInTheDocument();
    expect(desktop().dataset.front).toBe('cai-dat');
  });
});

describe('Dock', () => {
  const apps: DockApp[] = [
    { id: 'cong-viec', name: 'Công việc', icon: <b>✓</b>, background: 'red' },
    { id: 'crm', name: 'CRM', icon: { src: 'crm.png' }, href: '/_cm_6/index.html' },
  ];

  it('draws node or image icons, the running dot only for running apps, and reports clicks', () => {
    const onOpen = vi.fn();
    render(<Dock apps={apps} running={['cong-viec']} onOpen={onOpen} />);
    const crm = screen.getByRole('button', { name: 'CRM' });
    expect(crm.querySelector('img')).toHaveAttribute('src', 'crm.png');
    expect(crm.querySelector('.dock-dot')).toBeNull();
    expect(screen.getByRole('button', { name: 'Công việc' }).querySelector('.dock-icon')).toHaveStyle({ background: 'red' });
    act(() => crm.click());
    expect(onOpen).toHaveBeenCalledWith(apps[1]);
  });
});
