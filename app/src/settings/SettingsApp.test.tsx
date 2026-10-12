import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockBackendOptions } from '../../dev/mock-backend';
import { ME, freezeTime, installBackend, jsonResponse, type FetchOptions } from '../test/fixtures';
import SettingsApp from './SettingsApp';
import { WALLPAPER_CACHE_KEY } from './settingsConfig';
import { showWallpaper } from './wallpaper';

/** jsdom never loads pictures: this one "loads" at once. */
class LoadingImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_v: string) {
    queueMicrotask(() => this.onload?.());
  }
}

type Row = Record<string, unknown>;
const settingsRows = (backend: { state: { records: Record<string, Row[]> } }) => backend.state.records.user_settings ?? [];
const wallpaperVar = () => document.documentElement.style.getPropertyValue('--wallpaper');
const png = (name = 'bien-xanh.png', size = 2048) => new File([new Uint8Array(size)], name, { type: 'image/png' });

async function renderSettings(opts: Partial<MockBackendOptions> = {}, fetchOpts: FetchOptions = {}) {
  freezeTime();
  const env = installBackend(opts, fetchOpts);
  const user = userEvent.setup({ applyAccept: false });
  render(<SettingsApp />);
  await waitFor(() => expect(screen.queryByTestId('settings-loading')).toBeNull());
  return { ...env, user };
}

const META = { file_id: 'FILOLD', fileName: 'cu.jpg', fileSize: 10, fileExt: 'jpg', fileType: 'object_field' };
const withRecord = (wallpaper: unknown = JSON.stringify(META)): Partial<MockBackendOptions> => ({
  records: { user_settings: [{ id: 'USTMOCK1', name: 'UST-00001', desktop_wallpaper: wallpaper, created_by: ME, updated: 1 }] },
});

beforeEach(() => vi.stubGlobal('Image', LoadingImage));
afterEach(() => {
  void showWallpaper(null, { preload: false });
});

describe('SettingsApp — desktop wallpaper (CONTRACT §10)', () => {
  it('shows the default picture when I have no settings yet; nothing to reset', async () => {
    await renderSettings();
    expect(screen.getByRole('heading', { level: 1, name: 'Cài đặt' })).toBeInTheDocument();
    expect(screen.getByTestId('settings-nav-wallpaper')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('wallpaper-name')).toHaveTextContent('Ảnh mặc định');
    expect(screen.getByTestId('wallpaper-reset')).toBeDisabled();
    expect(screen.getByTestId('wallpaper-choose')).toBeEnabled();
    expect(screen.getByTestId('wallpaper-input')).toHaveAttribute('accept', '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp');
    expect(wallpaperVar()).toBe('');
  });

  it('uploads a picture to desktop_wallpaper, creates my record with it, then shows it behind the windows', async () => {
    const { backend, fetchMock, user } = await renderSettings();
    await user.upload(screen.getByTestId('wallpaper-input'), png());
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('Đã đổi ảnh nền'));

    const upload = fetchMock.mock.calls.find(([url]) => String(url).includes('/file/upload/'))!;
    const form = upload[1]!.body as FormData;
    expect([form.get('field_slug'), form.get('object_slug')]).toEqual(['desktop_wallpaper', 'user_settings']);
    const rows = settingsRows(backend);
    expect(rows).toHaveLength(1);
    expect(rows[0].created_by).toBe(ME);
    const stored = JSON.parse(String(rows[0].desktop_wallpaper)); // one object, not an array
    expect(stored).toMatchObject({ fileName: 'bien-xanh.png', file_id: expect.any(String) });
    expect(wallpaperVar()).toBe(`url("/files/${stored.file_id}/original/bien-xanh.png?redirect=true")`);
    expect(localStorage.getItem(WALLPAPER_CACHE_KEY)).toBe(`/files/${stored.file_id}/original/bien-xanh.png?redirect=true`);
    expect(screen.getByTestId('wallpaper-name')).toHaveTextContent('bien-xanh.png');
    expect(screen.getByTestId('wallpaper-preview').style.backgroundImage).toContain(stored.file_id);

    // a second picture updates the same record
    await user.upload(screen.getByTestId('wallpaper-input'), png('nui.webp'));
    await waitFor(() => expect(screen.getByTestId('wallpaper-name')).toHaveTextContent('nui.webp'));
    expect(settingsRows(backend)).toHaveLength(1);
    expect(JSON.parse(String(settingsRows(backend)[0].desktop_wallpaper)).fileName).toBe('nui.webp');
  });

  it('reads my record (and shows its picture); "Dùng ảnh mặc định" clears the field', async () => {
    const { backend, user } = await renderSettings(withRecord());
    expect(screen.getByTestId('wallpaper-name')).toHaveTextContent('cu.jpg');
    await waitFor(() => expect(wallpaperVar()).toBe('url("/files/FILOLD/original/cu.jpg?redirect=true")'));
    await user.click(screen.getByTestId('wallpaper-reset'));
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('Đã dùng lại ảnh nền mặc định'));
    expect(settingsRows(backend)[0].desktop_wallpaper).toBeNull();
    expect(wallpaperVar()).toBe('');
    expect(screen.getByTestId('wallpaper-name')).toHaveTextContent('Ảnh mặc định');
    expect(screen.getByTestId('wallpaper-reset')).toBeDisabled();
  });

  it('refuses other files before uploading: type and 20 MB', async () => {
    const { fetchMock, user } = await renderSettings();
    const before = fetchMock.mock.calls.length;
    await user.upload(screen.getByTestId('wallpaper-input'), new File(['x'], 'dong.gif', { type: 'image/gif' }));
    expect(screen.getByTestId('wallpaper-error')).toHaveTextContent('Chỉ nhận ảnh JPG, PNG hoặc WebP.');
    await user.upload(screen.getByTestId('wallpaper-input'), png('to.png', 20 * 1024 * 1024 + 1));
    expect(screen.getByTestId('wallpaper-error')).toHaveTextContent('Ảnh lớn hơn 20 MB.');
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it('takes a picture dropped on the preview', async () => {
    const { backend } = await renderSettings();
    const preview = screen.getByTestId('wallpaper-preview');
    fireEvent.dragOver(preview, { dataTransfer: { files: [png('keo-tha.jpg')] } });
    expect(preview).toHaveAttribute('data-drag', 'true');
    fireEvent.drop(preview, { dataTransfer: { files: [png('keo-tha.jpg')] } });
    await waitFor(() => expect(settingsRows(backend)).toHaveLength(1));
    expect(preview).not.toHaveAttribute('data-drag');
  });

  it('explains a refused upload in Vietnamese and keeps the wallpaper', async () => {
    const { backend, user } = await renderSettings(withRecord(), {
      override: path => (path.includes('/file/upload/') ? jsonResponse({ r: 15, msg: 'file type not allowed' }, 400) : undefined),
    });
    await user.upload(screen.getByTestId('wallpaper-input'), png());
    await waitFor(() => expect(screen.getByTestId('wallpaper-error')).toHaveTextContent('Không đổi được ảnh nền: Chỉ nhận ảnh JPG, PNG hoặc WebP.'));
    expect(JSON.parse(String(settingsRows(backend)[0].desktop_wallpaper)).file_id).toBe('FILOLD');
    expect(screen.getByTestId('wallpaper-choose')).toBeEnabled();
  });

  it('reports a failed read with a retry, and an expired session', async () => {
    let fail = true;
    const { user } = await renderSettings({}, {
      override: (path, body) => (fail && path === '/api/v1/records/list' && body?.object_slug === 'user_settings' ? jsonResponse({ r: 1, msg: 'Lỗi máy chủ' }) : undefined),
    });
    expect(screen.getByTestId('settings-load-error')).toHaveTextContent('Không tải được thiết lập: Lỗi máy chủ');
    expect(screen.getByTestId('wallpaper-choose')).toBeDisabled();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(screen.queryByTestId('settings-load-error')).toBeNull());
    expect(screen.getByTestId('wallpaper-choose')).toBeEnabled();
  });

  it('shows the expired-session box when the session is gone', async () => {
    await renderSettings({}, { override: path => (path === '/api/v1/records/list' ? jsonResponse({ r: 19000, msg: 'Unauthorized' }, 400) : undefined) });
    expect(await screen.findByTestId('session-expired')).toBeInTheDocument();
  });
});
