import type { Page } from '@playwright/test';
import { test, expect } from '../../support/local/fixtures';
import { T } from '../../support/local/dataset';

/**
 * AC28 Desktop kiểu macOS (CONTRACT mục 5 điểm 1c, 2026-10-03):
 *  - Dock (`dock`, nav "Ứng dụng") giữa mép trái; "Công việc" (`dock-app-cong-viec`) đang chạy (`data-running="true"`).
 *  - Thu nhỏ (`win-minimize`) → `.page[hidden]`, giữ mọi trạng thái, phím tắt tắt; bấm icon dock hiện lại, không tải lại.
 *  - Đóng (`win-close`) → gỡ cửa sổ (không còn `.page`, mất chấm); icon dock mở lại từ đầu (tải lại, tìm kiếm trống).
 *  - Phóng to (`win-maximize`, aria-pressed) → `.desktop[data-max]`, khung phủ kín trang, dock ẩn; nhớ `cong-viec.window`;
 *    bấm lại về cửa sổ. Đóng/thu nhỏ không nhớ qua lần tải trang. Điện thoại ≤ 640px: dock giữa mép dưới, nằm ngang.
 */

const WINDOW_KEY = 'cong-viec.window';
const dockApp = (page: Page) => page.getByTestId('dock-app-cong-viec');
const pageEl = (page: Page) => page.locator('.page');
const readWindowPref = (page: Page) => page.evaluate((k) => localStorage.getItem(k), WINDOW_KEY);

test.describe('AC28 desktop 1440×900', () => {
  test('AC28 dock bên trái: nav "Ứng dụng", "Công việc" đang chạy; khung chừa chỗ cho dock; nút cửa sổ ở góc trái trên khung', async ({ app, page }) => {
    await app.openReady();
    const dock = page.getByTestId('dock');
    await expect(dock).toBeVisible();
    await expect(dock).toHaveAccessibleName('Ứng dụng');
    await expect(dock).toHaveRole('navigation');
    await expect(dockApp(page)).toHaveAccessibleName(/Công việc/);
    await expect(dockApp(page)).toHaveAttribute('data-running', 'true');

    const vp = page.viewportSize()!;
    const d = (await dock.boundingBox())!;
    expect(d.x, 'dock sát mép trái').toBeLessThan(40);
    expect(Math.abs(d.y + d.height / 2 - vp.height / 2), 'dock giữa theo chiều dọc').toBeLessThan(4);
    const icon = (await dockApp(page).boundingBox())!;
    expect(Math.round(icon.width)).toBe(48);
    expect(Math.round(icon.height)).toBe(48);
    expect(await dockApp(page).evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('12px');

    // Khung (main) nằm bên phải dock, không chồng lên.
    const board = (await page.getByRole('main').boundingBox())!;
    expect(board.x, 'khung nằm bên phải dock').toBeGreaterThanOrEqual(d.x + d.width);
    expect(await pageEl(page).evaluate((el) => getComputedStyle(el).paddingLeft)).toBe('98px');

    // Nút cửa sổ: góc trái trên khung, phía trên tiêu đề "Công việc".
    for (const id of ['win-close', 'win-minimize', 'win-maximize']) {
      const b = (await app.tid(id).boundingBox())!;
      expect(b.x, `${id} ở nửa trái khung`).toBeLessThan(board.x + 200);
      expect(b.y, `${id} ở đầu khung`).toBeLessThan(board.y + 80);
    }
    await expect(app.tid('win-maximize')).toHaveAttribute('aria-pressed', 'false');

    // Popup nằm bên phải dock.
    await app.openTask(T.T1);
    const dlg = (await app.dialog().boundingBox())!;
    expect(dlg.x, 'popup không chồng dock').toBeGreaterThanOrEqual(d.x + d.width);
  });

  test('AC28 Thu nhỏ → .page[hidden], giữ trạng thái (tìm kiếm, bộ lọc), phím tắt tắt; icon dock mở lại không tải lại', async ({ app, mock, page }) => {
    await app.openReady();
    await app.quick('all');
    await app.search('onboarding');
    await app.expectIds([T.T1]);
    const lists = mock.byKind('list').length;
    const rules = mock.ruleReads().length;

    await app.tid('win-minimize').click();
    await expect(pageEl(page)).toHaveAttribute('hidden', '');
    await expect(page.getByRole('main')).toBeHidden();
    await expect(dockApp(page), 'thu nhỏ vẫn đang chạy').toHaveAttribute('data-running', 'true');
    // Phím tắt tạm tắt: N không mở form tạo.
    await page.locator('body').click({ position: { x: 700, y: 450 } }).catch(() => {});
    await page.keyboard.press('n');
    await page.waitForTimeout(300);
    await expect(app.dialog()).toHaveCount(0);

    await dockApp(page).click();
    await expect(pageEl(page)).not.toHaveAttribute('hidden', /.*/);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(app.tid('search')).toHaveValue('onboarding');
    await expect(app.tid('list-title')).toHaveText('Tất cả');
    await app.expectIds([T.T1]);
    await page.waitForTimeout(500);
    expect(mock.byKind('list'), 'mở lại sau thu nhỏ không tải lại dữ liệu').toHaveLength(lists);
    expect(mock.ruleReads()).toHaveLength(rules);
    // Phím tắt hoạt động lại.
    await page.locator('body').click({ position: { x: 4, y: 4 } }).catch(() => {});
    await page.keyboard.press('n');
    await expect(app.form()).toBeVisible();
  });

  test('AC28 Đóng → gỡ cửa sổ, dock mất chấm; icon dock mở lại từ đầu (tải lại dữ liệu, tìm kiếm trống)', async ({ app, mock, page }) => {
    await app.openReady();
    await app.search('onboarding');
    await app.expectIds([T.T1]);
    const openLists = mock.taskLists('open').length;

    await app.tid('win-close').click();
    await expect(pageEl(page)).toHaveCount(0);
    await expect(page.getByRole('main')).toHaveCount(0);
    await expect(dockApp(page)).not.toHaveAttribute('data-running', 'true');
    await expect(page.getByTestId('dock')).toBeVisible();

    await dockApp(page).click();
    await app.ready();
    await expect(dockApp(page)).toHaveAttribute('data-running', 'true');
    await expect(app.tid('search')).toHaveValue('');
    await expect.poll(() => mock.taskLists('open').length, { message: 'mở lại sau khi đóng → tải lại danh sách' }).toBeGreaterThan(openLists);
    await app.expectIds([T.T1, T.T3, T.T4, T.T6, T.T7, T.T8]);
  });

  test('AC28 Phóng to → .desktop[data-max], khung phủ kín trang, dock ẩn, nhớ qua refresh; bấm lại về cửa sổ (normal)', async ({ app, page }) => {
    await app.openReady();
    const vp = page.viewportSize()!;
    await app.tid('win-maximize').click();
    await expect(page.locator('.desktop[data-max]')).toHaveCount(1);
    await expect(app.tid('win-maximize')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('dock')).toBeHidden();
    const expectFull = async () => {
      const b = (await page.getByRole('main').boundingBox())!;
      expect(Math.abs(b.x), 'khung sát mép trái').toBeLessThanOrEqual(1);
      expect(Math.abs(b.y), 'khung sát mép trên').toBeLessThanOrEqual(1);
      expect(Math.abs(b.width - vp.width), 'khung rộng bằng trang (không max-width)').toBeLessThanOrEqual(1);
      expect(Math.abs(b.height - vp.height), 'khung cao bằng trang').toBeLessThanOrEqual(1);
      const look = await page.getByRole('main').evaluate((el) => {
        const cs = getComputedStyle(el);
        return { radius: cs.borderTopLeftRadius, border: cs.borderTopWidth };
      });
      expect(look, 'không viền/bo góc').toEqual({ radius: '0px', border: '0px' });
    };
    await expectFull();
    expect(await readWindowPref(page)).toBe('max');

    await page.reload();
    await app.ready();
    await expect(page.locator('.desktop[data-max]'), 'nhớ phóng to qua refresh').toHaveCount(1);
    await expect(app.tid('win-maximize')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('dock')).toBeHidden();
    await expectFull();

    await app.tid('win-maximize').click();
    await expect(page.locator('.desktop[data-max]')).toHaveCount(0);
    await expect(app.tid('win-maximize')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('dock')).toBeVisible();
    expect(await readWindowPref(page)).toBe('normal');
    const b = (await page.getByRole('main').boundingBox())!;
    expect(b.x, 'về cửa sổ: chừa chỗ dock').toBeGreaterThanOrEqual(92 - 1);
  });

  test('AC28 khoảng cách đều 16px: mép trái → dock → cửa sổ, cửa sổ → mép trên / phải / dưới (kể cả màn rộng 1900px)', async ({ app, page }) => {
    await page.setViewportSize({ width: 1900, height: 1000 });
    await app.openReady();
    const w = (await page.getByRole('main').boundingBox())!;
    const d = (await page.getByTestId('dock').boundingBox())!;
    const gaps = { dockLeft: d.x, dockToWindow: w.x - (d.x + d.width), top: w.y, right: 1900 - (w.x + w.width), bottom: 1000 - (w.y + w.height) };
    for (const [name, g] of Object.entries(gaps)) expect(Math.round(g), name).toBe(16);
  });

  test('AC28 thu nhỏ / đóng không nhớ qua lần tải trang', async ({ app, page }) => {
    await app.openReady();
    await app.tid('win-minimize').click();
    await expect(pageEl(page)).toHaveAttribute('hidden', '');
    await page.reload();
    await app.ready();
    await expect(page.getByRole('main')).toBeVisible();

    await app.tid('win-close').click();
    await expect(pageEl(page)).toHaveCount(0);
    await page.reload();
    await app.ready();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(dockApp(page)).toHaveAttribute('data-running', 'true');
  });
});

test.describe('AC28 điện thoại 375px', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('AC28 ≤ 640px: dock giữa mép dưới, nằm ngang; không cuộn ngang', async ({ app, page }) => {
    await app.openReady();
    const dock = page.getByTestId('dock');
    await expect(dock).toBeVisible();
    const d = (await dock.boundingBox())!;
    expect(d.width, 'dock nằm ngang').toBeGreaterThanOrEqual(d.height);
    expect(Math.abs(d.x + d.width / 2 - 375 / 2), 'giữa theo chiều ngang').toBeLessThan(4);
    expect(812 - (d.y + d.height), 'sát mép dưới').toBeLessThan(40);
    expect(d.y, 'ở nửa dưới màn hình').toBeGreaterThan(812 / 2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await expect(dockApp(page)).toHaveAttribute('data-running', 'true');
  });
});
