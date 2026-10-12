import type { Page } from '@playwright/test';
import { test, expect } from '../../support/local/fixtures';
import { makeJpeg, makePng } from '../../support/files';
import { SETTINGS_OBJECT, WALLPAPER_FIELD, WORKSPACE_ID } from '../../support/model';

/**
 * AC41 / CONTRACT mục 10: app Cài đặt trên dock, ảnh nền Desktop lưu ở `user_settings` (một bản ghi mỗi người theo
 * `created_by`, field `desktop_wallpaper` = MỘT object FILE_METADATA, về mặc định = null); ảnh hiện qua biến CSS
 * `--wallpaper` trên :root.
 */
const SETTINGS = SETTINGS_OBJECT.slug;
const CACHE_KEY = 'cong-viec.wallpaper';

/** Giá trị `--wallpaper` đang đặt trên :root ('' = ảnh mặc định). */
const wallpaperVar = (page: Page) => page.evaluate(() => document.documentElement.style.getPropertyValue('--wallpaper').trim());
/** URL ảnh hiển thị (cùng origin, `?redirect=true`) của một FILE_METADATA. */
const fileUrl = (m: { file_id: string; fileName: string }) => `/files/${m.file_id}/original/${encodeURIComponent(m.fileName)}?redirect=true`;
/** Ảnh nền của khung xem trước (`wallpaper-preview`). */
const previewImage = (page: Page) => page.getByTestId('wallpaper-preview').evaluate((el) => getComputedStyle(el).backgroundImage);
const visibleToast = (page: Page) => page.locator('[data-testid="toast"]:visible');

async function openSettings(page: Page) {
  await page.getByTestId('dock-app-cai-dat').click();
  await expect(page.getByTestId('settings-app')).toBeVisible();
  await expect(page.getByTestId('settings-loading')).toHaveCount(0);
  await expect(page.getByTestId('wallpaper-choose')).toBeEnabled();
}

test.describe('AC41 Cài đặt — ảnh nền Desktop', () => {
  test('AC41 dock có "Cài đặt"; mở → cửa sổ Cài đặt ở trước, ?app=settings; refresh mở lại Cài đặt; chưa có bản ghi → ảnh mặc định, nút đặt lại khoá', async ({ app, mock, page }) => {
    await app.openReady();
    const dock = page.getByTestId('dock-app-cai-dat');
    await expect(dock).toHaveAccessibleName('Cài đặt');
    await expect(dock).not.toHaveAttribute('data-running', 'true');
    // Desktop đọc thiết lập của tôi khi mở (created_by = $currentUser)
    await expect.poll(() => mock.genericLists(SETTINGS).length).toBeGreaterThan(0);
    const read = mock.genericLists(SETTINGS)[0].body;
    expect(read.filters).toEqual([{ field: 'created_by', op: '=', params: '$currentUser', fieldType: 'lookup_normal' }]);
    expect(read.fields).toContain(WALLPAPER_FIELD);
    expect(await wallpaperVar(page), 'chưa có bản ghi → ảnh mặc định').toBe('');

    await openSettings(page);
    await expect(page.locator('.desktop')).toHaveAttribute('data-front', 'cai-dat');
    await expect(dock).toHaveAttribute('data-running', 'true');
    await expect(page.getByTestId('settings-app').locator('h1.brand')).toHaveText('Cài đặt');
    await expect(page.getByTestId('settings-app').getByRole('heading', { level: 2, name: 'Hình nền Desktop' })).toBeVisible();
    await expect(page.getByTestId('settings-nav-wallpaper')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('wallpaper-name')).toHaveText('Ảnh mặc định');
    await expect(page.getByTestId('wallpaper-reset')).toBeDisabled();
    expect(await previewImage(page), 'xem trước = ảnh mặc định').toMatch(/bg-default/);
    const pv = (await page.getByTestId('wallpaper-preview').boundingBox())!;
    expect(Math.abs(pv.width / pv.height - 16 / 9), 'khung xem trước 16:9').toBeLessThan(0.05);
    await expect(page.getByTestId('wallpaper-input')).toHaveAttribute('accept', /\.jpg.*\.jpeg.*\.png.*\.webp/);
    await expect.poll(() => new URL(page.url()).searchParams.get('app')).toBe('settings');

    await page.reload();
    await expect(page.getByTestId('settings-app')).toBeVisible();
    await expect(page.locator('.desktop')).toHaveAttribute('data-front', 'cai-dat');
    await expect(page.getByTestId('wallpaper-name')).toHaveText('Ảnh mặc định');
    expect(mock.writes()).toHaveLength(0);
  });

  test('AC41 chọn PNG → upload desktop_wallpaper/user_settings, tạo đúng 1 bản ghi của tôi chứa 1 FILE_METADATA (object), --wallpaper đổi; ảnh thứ hai sửa cùng bản ghi; đặt lại → null', async ({ app, mock, page }) => {
    await app.openReady();
    await openSettings(page);
    const png = makePng(16, 9, 3);
    await page.getByTestId('wallpaper-input').setInputFiles({ name: 'bien xanh.png', mimeType: 'image/png', buffer: png });
    await expect(visibleToast(page)).toContainText('Đã đổi ảnh nền');

    // upload
    const ups = mock.wallpaperUploads();
    expect(ups).toHaveLength(1);
    expect(ups[0].upload?.fields).toEqual({ field_slug: WALLPAPER_FIELD, object_slug: SETTINGS });
    expect(ups[0].upload?.fileSize).toBe(png.length);
    const meta = ups[0].response.data;
    expect(meta.fileName, 'server đổi khoảng trắng thành "-"').toBe('bien-xanh.png');
    // tạo bản ghi
    const creates = mock.genericWrites(SETTINGS, 'create');
    expect(creates).toHaveLength(1);
    expect(creates[0].headers['x-req-service']).toBe('10200');
    expect(creates[0].body.workspace_id).toBe(WORKSPACE_ID);
    expect(creates[0].body.object_type).toBe(SETTINGS_OBJECT.id);
    const sent = creates[0].body.data[WALLPAPER_FIELD];
    expect(Array.isArray(sent), 'một object FILE_METADATA, không phải mảng').toBe(false);
    expect(sent).toEqual(meta);
    const rows = mock.rows(SETTINGS);
    expect(rows, 'đúng một bản ghi').toHaveLength(1);
    expect(rows[0].created_by).toBe(mock.meId);
    expect(JSON.parse(rows[0][WALLPAPER_FIELD]).file_id).toBe(meta.file_id);
    // hiển thị
    await expect.poll(() => wallpaperVar(page)).toContain(fileUrl(meta));
    await expect(page.getByTestId('wallpaper-name')).toHaveText('bien-xanh.png');
    await expect.poll(() => previewImage(page), { message: 'khung xem trước 16:9 hiện ảnh đang dùng' }).toContain(fileUrl(meta));
    await expect(page.getByTestId('wallpaper-reset')).toBeEnabled();
    expect(await page.evaluate((k) => localStorage.getItem(k), CACHE_KEY)).toContain(meta.file_id);
    // ảnh được tải (cùng origin, ?redirect=true) trước khi thay ảnh nền
    expect(mock.fileGets.some((g) => g.fileId === meta.file_id && g.redirect), 'trình duyệt tải ảnh nền qua /files/<id>/original/…?redirect=true').toBe(true);

    // ảnh thứ hai → sửa cùng bản ghi
    const jpg = await makeJpeg(page, 24, 16, 5);
    await page.getByTestId('wallpaper-input').setInputFiles({ name: 'nui.jpg', mimeType: 'image/jpeg', buffer: jpg });
    await expect.poll(() => mock.genericWrites(SETTINGS, 'update').length).toBe(1);
    const upd = mock.genericWrites(SETTINGS, 'update')[0];
    expect(upd.headers['x-req-service']).toBe('10201');
    expect(upd.body.data.id).toBe(rows[0].id);
    const meta2 = mock.wallpaperUploads()[1].response.data;
    expect(upd.body.data[WALLPAPER_FIELD]).toEqual(meta2);
    expect(mock.genericWrites(SETTINGS, 'create'), 'không tạo bản ghi thứ hai').toHaveLength(1);
    await expect.poll(() => wallpaperVar(page)).toContain(fileUrl(meta2));
    await expect(page.getByTestId('wallpaper-name')).toHaveText('nui.jpg');

    // đặt lại
    await page.getByTestId('wallpaper-reset').click();
    await expect(visibleToast(page)).toContainText('Đã dùng lại ảnh nền mặc định');
    await expect.poll(() => mock.genericWrites(SETTINGS, 'update').length).toBe(2);
    expect(mock.genericWrites(SETTINGS, 'update')[1].body.data).toEqual({
      object_type: SETTINGS_OBJECT.id,
      workspace_id: WORKSPACE_ID,
      [WALLPAPER_FIELD]: null,
      id: rows[0].id,
    });
    await expect.poll(() => wallpaperVar(page)).toBe('');
    await expect(page.getByTestId('wallpaper-name')).toHaveText('Ảnh mặc định');
    await expect(page.getByTestId('wallpaper-reset')).toBeDisabled();
    await expect.poll(() => previewImage(page), { message: 'xem trước ảnh mặc định' }).toMatch(/bg-default/);
    expect(mock.rows(SETTINGS)[0][WALLPAPER_FIELD]).toBeNull();
    expect(mock.violations).toEqual([]);
  });

  test('AC41 ảnh nền giữ sau khi tải lại trang và "trên máy khác" (trình duyệt không có cache) — đọc từ user_settings', async ({ app, mock, page }) => {
    await app.openReady();
    await openSettings(page);
    await page.getByTestId('wallpaper-input').setInputFiles({ name: 'ho.png', mimeType: 'image/png', buffer: makePng(12, 8, 9) });
    await expect(visibleToast(page)).toContainText('Đã đổi ảnh nền');
    const meta = mock.wallpaperUploads()[0].response.data;

    // tải lại: Cài đặt vẫn ở trước, ảnh nền vẫn là ảnh đã chọn
    await page.reload();
    await expect(page.getByTestId('settings-app')).toBeVisible();
    await expect.poll(() => wallpaperVar(page)).toContain(fileUrl(meta));
    await expect(page.getByTestId('wallpaper-name')).toHaveText('ho.png');

    // "máy khác": không có cache của trình duyệt, mở Công việc → Desktop đọc bản ghi của tôi rồi đổi ảnh nền
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await app.ready();
    await expect.poll(() => wallpaperVar(page), { message: 'ảnh nền đọc từ server' }).toContain(fileUrl(meta));
    expect(mock.writes().map((w) => w.kind), 'tải lại / máy khác chỉ đọc, không ghi thêm').toEqual(['create']);
  });

  test('AC41 file sai loại / rỗng / quá 20 MB bị chặn trước khi gửi (wallpaper-error, không upload); server từ chối loại → thông báo tiếng Việt', async ({ app, mock, page, guard }) => {
    await app.openReady();
    await openSettings(page);
    const input = page.getByTestId('wallpaper-input');
    const err = page.getByTestId('wallpaper-error');

    await input.setInputFiles({ name: 'dong.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
    await expect(err).toHaveText('Chỉ nhận ảnh JPG, PNG hoặc WebP.');
    await input.setInputFiles({ name: 'rong.png', mimeType: 'image/png', buffer: Buffer.alloc(0) });
    await expect(err).toHaveText('File ảnh rỗng.');
    await input.setInputFiles({ name: 'qua-lon.png', mimeType: 'image/png', buffer: Buffer.alloc(20 * 1024 * 1024 + 1, 1) });
    await expect(err).toHaveText('Ảnh lớn hơn 20 MB.');
    expect(mock.wallpaperUploads(), 'không gửi upload nào').toHaveLength(0);
    expect(mock.writes()).toHaveLength(0);
    await expect(page.getByTestId('wallpaper-name')).toHaveText('Ảnh mặc định');

    // đúng 20 MB vẫn được (giới hạn ≤ 20 MB) — server mock nhận
    await input.setInputFiles({ name: 'dung-20mb.png', mimeType: 'image/png', buffer: Buffer.alloc(20 * 1024 * 1024, 1) });
    await expect(visibleToast(page)).toContainText('Đã đổi ảnh nền');
    await expect(err).toHaveCount(0);
    expect(mock.wallpaperUploads()).toHaveLength(1);

    // server từ chối loại file (đuôi hợp lệ nhưng server không nhận)
    guard.allow(/HTTP 400: POST .*client_upload/, /console\.error: Failed to load resource/);
    mock.failNext((r) => r.kind === 'upload', { status: 400, body: { r: 15, msg: 'file type not allowed' } });
    await input.setInputFiles({ name: 'la.webp', mimeType: 'image/webp', buffer: makePng(4, 4, 1) });
    await expect(err).toHaveText('Không đổi được ảnh nền: Chỉ nhận ảnh JPG, PNG hoặc WebP.');
    expect(mock.genericWrites(SETTINGS), 'upload lỗi → không ghi bản ghi').toHaveLength(1);
  });

  test('AC41 đã có bản ghi khi mở trang → ảnh nền áp ngay cả khi chỉ mở Công việc; Cài đặt hiện tên file, nút đặt lại bật; ô chờ "settings-loading" khi đang đọc', async ({ app, mock, page }) => {
    const meta = mock.makeFileMeta('san-may.png', 100, makePng(10, 10, 4));
    mock.fileStore.get(meta.file_id)!.mime = 'image/png';
    mock.setRecords(SETTINGS, [{ id: 'USTMOCK000001', name: 'UST-00001', [WALLPAPER_FIELD]: JSON.stringify(meta), created_by: mock.meId, updated: 1 }]);
    await app.openReady();
    await expect.poll(() => wallpaperVar(page)).toContain(fileUrl(meta));

    const gate = mock.hold((r) => r.kind === 'list' && r.body?.object_slug === SETTINGS);
    await page.getByTestId('dock-app-cai-dat').click();
    await expect(page.getByTestId('settings-loading')).toBeVisible();
    await expect(page.getByTestId('settings-loading')).toContainText('Đang tải thiết lập…');
    gate.release();
    await expect(page.getByTestId('settings-loading')).toHaveCount(0);
    await expect(page.getByTestId('wallpaper-name')).toHaveText('san-may.png');
    await expect(page.getByTestId('wallpaper-reset')).toBeEnabled();
  });
});
