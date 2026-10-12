import { afterEach, describe, expect, it, vi } from 'vitest';
import { WALLPAPER_CACHE_KEY, WALLPAPER_EVENT } from './settingsConfig';
import {
  cachedWallpaper,
  currentWallpaper,
  mySettingsBody,
  normalizeSettings,
  showWallpaper,
  wallpaperProblem,
  wallpaperSaveBody,
  wallpaperUploadProblem,
  wallpaperUrl,
} from './wallpaper';

const META = { file_id: 'asia-1_F1', fileName: 'anh-nen.png', fileSize: 1200, fileExt: 'png', fileType: 'object_field' };
const picture = { fileId: 'asia-1_F1', fileName: 'anh-nen.png', fileSize: 1200, fileExt: 'png', fileType: 'object_field', meta: META };

/** jsdom never loads pictures: this Image "loads" right away (or fails for names with "broken"). */
class LoadingImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(v: string) {
    queueMicrotask(() => (v.includes('broken') ? this.onerror?.() : this.onload?.()));
  }
}

afterEach(() => {
  void showWallpaper(null, { preload: false });
});

describe('user_settings records (CONTRACT §10)', () => {
  it('reads my record: created_by = me, the last updated first', () => {
    expect(mySettingsBody()).toEqual({
      object_slug: 'user_settings',
      type: 1,
      logic_sequence: '',
      filters: [{ field: 'created_by', op: '=', params: '$currentUser', fieldType: 'lookup_normal' }],
      fields: ['id', 'name', 'desktop_wallpaper', 'updated'],
      sorts: [{ updated: { order: 'desc' } }],
      order_direction: 'next',
      search_after: [],
      size: 5,
    });
  });

  it('reads the single file as the server sends it (JSON string of one object), an object or nothing', () => {
    expect(normalizeSettings({ id: 'R1', desktop_wallpaper: JSON.stringify(META) })).toEqual({ id: 'R1', wallpaper: picture });
    expect(normalizeSettings({ id: 'R1', desktop_wallpaper: META })?.wallpaper?.fileId).toBe('asia-1_F1');
    expect(normalizeSettings({ id: 'R1', desktop_wallpaper: null })).toEqual({ id: 'R1', wallpaper: null });
    expect(normalizeSettings({ id: 'R1', desktop_wallpaper: '{bad' })).toEqual({ id: 'R1', wallpaper: null });
    expect(normalizeSettings({ name: 'UST-1' })).toBeNull();
    expect(normalizeSettings(undefined)).toBeNull();
  });

  it('writes one FILE_METADATA object (not an array), null to go back to the default', () => {
    expect(wallpaperSaveBody(picture)).toEqual({
      workspace_id: 'WSDEMO0000001',
      object_type: 'OTDEMOSETTING',
      client_time_zone: 'Asia/Saigon',
      data: { object_type: 'OTDEMOSETTING', workspace_id: 'WSDEMO0000001', desktop_wallpaper: META },
    });
    expect(wallpaperSaveBody(null, 'R1').data).toEqual({ object_type: 'OTDEMOSETTING', workspace_id: 'WSDEMO0000001', desktop_wallpaper: null, id: 'R1' });
  });

  it('shows the picture from the same origin (session cookie, ?redirect=true answers with the image)', () => {
    expect(wallpaperUrl({ ...picture, fileName: 'ảnh nền.png' })).toBe('/files/asia-1_F1/original/%E1%BA%A3nh%20n%E1%BB%81n.png?redirect=true');
  });

  it('takes JPG, PNG or WebP up to 20 MB', () => {
    expect(wallpaperProblem({ name: 'a.JPG', size: 10 })).toBeNull();
    expect(wallpaperProblem({ name: 'a.webp', size: 20 * 1024 * 1024 })).toBeNull();
    expect(wallpaperProblem({ name: 'a.gif', size: 10 })).toBe('Chỉ nhận ảnh JPG, PNG hoặc WebP.');
    expect(wallpaperProblem({ name: 'anh', size: 10 })).toBe('Chỉ nhận ảnh JPG, PNG hoặc WebP.');
    expect(wallpaperProblem({ name: 'a.png', size: 0 })).toBe('File ảnh rỗng.');
    expect(wallpaperProblem({ name: 'a.png', size: 20 * 1024 * 1024 + 1 })).toBe('Ảnh lớn hơn 20 MB.');
    expect(wallpaperUploadProblem('file type not allowed')).toBe('Chỉ nhận ảnh JPG, PNG hoặc WebP.');
    expect(wallpaperUploadProblem('File size exceeds the limit')).toBe('Ảnh lớn hơn 20 MB.');
    expect(wallpaperUploadProblem('Lỗi khác')).toBe('Lỗi khác');
  });
});

describe('the wallpaper behind the windows', () => {
  it('puts it in --wallpaper once downloaded, remembers it in this browser and tells the windows', async () => {
    vi.stubGlobal('Image', LoadingImage);
    const seen = vi.fn();
    window.addEventListener(WALLPAPER_EVENT, seen);
    const pending = showWallpaper('/files/F1/original/a.png?redirect=true');
    expect(document.documentElement.style.getPropertyValue('--wallpaper')).toBe(''); // not before it is there
    await pending;
    expect(document.documentElement.style.getPropertyValue('--wallpaper')).toBe('url("/files/F1/original/a.png?redirect=true")');
    expect(currentWallpaper()).toBe('/files/F1/original/a.png?redirect=true');
    expect(localStorage.getItem(WALLPAPER_CACHE_KEY)).toBe('/files/F1/original/a.png?redirect=true');
    expect(cachedWallpaper()).toBe('/files/F1/original/a.png?redirect=true');
    expect(seen).toHaveBeenCalledTimes(1);

    await showWallpaper(null);
    expect(document.documentElement.style.getPropertyValue('--wallpaper')).toBe('');
    expect(currentWallpaper()).toBeNull();
    expect(cachedWallpaper()).toBeNull();
    window.removeEventListener(WALLPAPER_EVENT, seen);
  });

  it('the last call wins; a picture that fails to download is still set (the colour stays under it)', async () => {
    vi.stubGlobal('Image', LoadingImage);
    const first = showWallpaper('/files/A/original/a.png?redirect=true');
    const second = showWallpaper('/files/B/original/broken.png?redirect=true');
    await Promise.all([first, second]);
    expect(currentWallpaper()).toBe('/files/B/original/broken.png?redirect=true');
  });

  it('shows the cached picture at once at start (no download first)', async () => {
    vi.stubGlobal('Image', class {}); // would never load
    await showWallpaper('/files/C/original/c.png?redirect=true', { preload: false });
    expect(currentWallpaper()).toBe('/files/C/original/c.png?redirect=true');
  });
});
