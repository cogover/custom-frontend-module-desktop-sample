import type { Page } from '@playwright/test';
import { test, expect } from '../../support/local/fixtures';
import { seedNotes } from '../../support/local/notes-dataset';
import { NOTES_OBJECTS } from '../../support/model';
import { NotesUi } from '../../support/notes-ui';

/**
 * AC32 / CONTRACT 9.1, 10.3 (2026-10-04): dock 4 app (Công việc · Ghi chú · Dev tools · Cài đặt), giãn 12px; cửa sổ lazy được tải
 * trước khi rảnh (mở lần đầu không qua màn chờ); mở trước khi tải xong → khung chờ đúng hình cửa sổ (`window-frame`,
 * `window-loading`); ô chờ dữ liệu thống nhất (`app-loading`, `notes-loading`, `settings-loading`).
 */
const CHUNK = { notes: /\/assets\/NotesApp-[^/]+\.js$/, settings: /\/assets\/SettingsApp-[^/]+\.js$/ };

/** Ghi lại khung chờ cửa sổ có từng xuất hiện hay không (MutationObserver gắn từ trước). */
async function watchFrame(page: Page) {
  await page.evaluate(() => {
    (window as any).__frameSeen = !!document.querySelector('[data-testid="window-frame"]');
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="window-frame"]')) (window as any).__frameSeen = true;
    }).observe(document.body, { childList: true, subtree: true });
  });
  return () => page.evaluate(() => (window as any).__frameSeen as boolean);
}

test.describe('AC32 desktop nhiều cửa sổ — dock, tải trước, khung chờ', () => {
  test('AC32 dock có 4 app theo thứ tự Công việc · Ghi chú · Dev tools · Cài đặt, ô 48px, cách nhau 12px, hai đầu 12px', async ({ app, page }) => {
    await app.openReady();
    const dock = page.getByTestId('dock');
    await expect(dock).toHaveAccessibleName('Ứng dụng');
    const ids = ['cong-viec', 'ghi-chu', 'dev-tools', 'cai-dat'];
    const names = ['Công việc', 'Ghi chú', 'Dev tools', 'Cài đặt'];
    const boxes = [];
    for (let i = 0; i < ids.length; i++) {
      const btn = page.getByTestId(`dock-app-${ids[i]}`);
      await expect(btn).toHaveAccessibleName(names[i]);
      boxes.push((await btn.boundingBox())!);
    }
    await expect(dock.getByRole('button')).toHaveCount(4);
    for (const b of boxes) {
      expect(Math.round(b.width)).toBe(48);
      expect(Math.round(b.height)).toBe(48);
    }
    for (let i = 1; i < boxes.length; i++) expect(Math.round(boxes[i].y - (boxes[i - 1].y + boxes[i - 1].height)), 'khoảng cách giữa các app').toBe(12);
    const d = (await dock.boundingBox())!;
    const border = await dock.evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth) || 0);
    expect(Math.round(boxes[0].y - d.y - border), 'padding đầu trên').toBe(12);
    const last = boxes[boxes.length - 1];
    expect(Math.round(d.y + d.height - border - (last.y + last.height)), 'padding đầu dưới').toBe(12);
    await expect(page.getByTestId('dock-app-cong-viec')).toHaveAttribute('data-running', 'true');
    await expect(page.getByTestId('dock-app-ghi-chu')).not.toHaveAttribute('data-running', 'true');
    await expect(page.getByTestId('dock-app-cai-dat')).not.toHaveAttribute('data-running', 'true');
  });

  test('AC32 code Ghi chú / Cài đặt được tải khi trình duyệt rảnh (chưa bấm dock); mở lần đầu hiện ngay, không qua khung chờ', async ({ app, mock, page }) => {
    seedNotes(mock);
    const fetched: string[] = [];
    page.on('request', (r) => fetched.push(new URL(r.url()).pathname));
    await app.openReady();
    await expect
      .poll(() => fetched.some((p) => CHUNK.notes.test(p)) && fetched.some((p) => CHUNK.settings.test(p)), {
        message: 'chunk NotesApp + SettingsApp được tải trước khi rảnh (≤ 5 s)',
        timeout: 8000,
      })
      .toBe(true);
    // chờ tải xong (response) rồi mới bấm
    await page.waitForLoadState('networkidle');
    const frameSeen = await watchFrame(page);
    await new NotesUi(page).openFromDock();
    await page.getByTestId('dock-app-cai-dat').click();
    await expect(page.getByTestId('settings-app')).toBeVisible();
    expect(await frameSeen(), 'mở sau khi tải trước → không hiện khung chờ cửa sổ').toBe(false);
  });

  test('AC32 mở Ghi chú trước khi code tải xong → khung chờ là chính cửa sổ (nút cửa sổ, h1.brand "Ghi chú", top bar, window-loading), rồi app thay vào', async ({ app, mock, page }) => {
    seedNotes(mock);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route(CHUNK.notes, async (route) => {
      await gate;
      await route.fallback();
    });
    await app.openReady();
    await page.getByTestId('dock-app-ghi-chu').click();
    const frame = page.getByTestId('window-frame');
    await expect(frame).toBeVisible();
    await expect(page.locator('.desktop')).toHaveAttribute('data-front', 'ghi-chu');
    await expect(frame.locator('h1.brand')).toHaveText('Ghi chú');
    await expect(frame.getByTestId('win-close')).toBeVisible();
    await expect(frame.getByTestId('win-minimize')).toBeVisible();
    await expect(frame.getByTestId('win-maximize')).toBeVisible();
    await expect(frame.locator('.topbar')).toBeVisible();
    const box = frame.getByTestId('window-loading');
    await expect(box).toBeVisible();
    await expect(box).toContainText('Đang tải ghi chú…');
    // cùng kiểu ô chờ với ô chờ dữ liệu của app (LoadingState)
    const cls = await box.getAttribute('class');
    release();
    const notes = new NotesUi(page);
    await notes.ready();
    await expect(frame).toHaveCount(0);
    expect(cls).toBeTruthy();

    // ô chờ dữ liệu của Ghi chú: cùng kiểu với khung chờ
    await page.getByTestId('win-close').filter({ visible: true }).click();
    const hold = mock.hold((r) => r.kind === 'list' && r.body?.object_slug === NOTES_OBJECTS.folder.slug);
    await page.getByTestId('dock-app-ghi-chu').click();
    const nl = page.getByTestId('notes-loading');
    await expect(nl).toBeVisible();
    await expect(nl).toContainText('Đang tải ghi chú…');
    expect(await nl.getAttribute('class'), 'ô chờ dữ liệu = ô chờ của khung cửa sổ').toBe(cls);
    hold.release();
    await notes.ready();
  });

  test('AC32 ô chờ dữ liệu thống nhất: Công việc "Đang tải công việc…" (app-loading), Cài đặt "Đang tải thiết lập…" (settings-loading)', async ({ app, mock, page }) => {
    const hold = mock.hold((r) => r.kind === 'list' && r.body?.object_slug === 'task');
    await app.open();
    const al = page.getByTestId('app-loading');
    await expect(al).toBeVisible();
    await expect(al).toContainText('Đang tải công việc…');
    const cls = await al.getAttribute('class');
    hold.release();
    await app.ready();

    const h2 = mock.hold((r) => r.kind === 'list' && r.body?.object_slug === 'user_settings');
    await page.getByTestId('dock-app-cai-dat').click();
    const sl = page.getByTestId('settings-loading');
    await expect(sl).toBeVisible();
    await expect(sl).toContainText('Đang tải thiết lập…');
    expect(await sl.getAttribute('class')).toBe(cls);
    h2.release();
    await expect(sl).toHaveCount(0);
  });
});
