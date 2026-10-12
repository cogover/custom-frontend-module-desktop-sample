import type { Page } from '@playwright/test';
import { test, expect } from '../../support/local/fixtures';
import type { TaskApp } from '../../support/ui';

/**
 * AC31 Cột trái đổi độ rộng / ẩn được (CONTRACT mục 5 điểm 1d, 2026-10-04) — chỉ ≥ 881px.
 *  - Tay kéo `side-resizer` (separator): kéo chuột thật đổi `--side-w` (kẹp 220–420), board `data-resizing` lúc kéo,
 *    lưu `localStorage['cong-viec.side']` = {width, hidden} khi thả; ←/→ 16px, Shift 48px, Home/End 220/420; bấm đúp → 256.
 *  - Nút `side-toggle` trong `.traffic`: ẩn → cột trái + tay kéo không render, board 1 cột (`data-side="hidden"`), `.traffic`
 *    lên `.title-ctl` trước ô tìm kiếm, focus ở nút; ⌘/Ctrl+\ ẩn/hiện (trừ khi cửa sổ thu nhỏ).
 *  - Refresh giữ; giá trị lưu lạ → 256 và đang hiện; ≤ 880px bỏ qua trạng thái ẩn, không có nút/tay kéo.
 */

const KEY = 'cong-viec.side';
const DEFAULT_W = 256;
const MIN_W = 220;
const MAX_W = 420;

const board = (page: Page) => page.getByRole('main');
const resizer = (app: TaskApp) => app.tid('side-resizer');
const toggle = (app: TaskApp) => app.tid('side-toggle');

/** Cột trái = phần tử mà nút ẩn/hiện điều khiển (aria-controls). */
async function side(app: TaskApp) {
  const id = await toggle(app).getAttribute('aria-controls');
  expect(id, 'side-toggle có aria-controls').toBeTruthy();
  return app.page.locator(`[id="${id}"]`);
}
async function sideWidth(app: TaskApp) {
  const b = await (await side(app)).boundingBox();
  if (!b) throw new Error('Cột trái không hiển thị');
  return Math.round(b.width);
}
const saved = (page: Page) =>
  page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    try {
      return raw === null ? null : JSON.parse(raw);
    } catch {
      return { raw };
    }
  }, KEY);
const setSaved = (page: Page, raw: string) => page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, raw] as const);

async function expectWidth(app: TaskApp, w: number) {
  await expect.poll(() => sideWidth(app), { message: `cột trái rộng ${w}px` }).toBeGreaterThanOrEqual(w - 1);
  expect(await sideWidth(app)).toBeLessThanOrEqual(w + 1);
  await expect(resizer(app)).toHaveAttribute('aria-valuenow', String(w));
}

/** Kéo tay kéo bằng chuột thật thêm `dx` px; trả hàm thả chuột (để kiểm trạng thái trong lúc kéo). */
async function startDrag(app: TaskApp, dx: number) {
  const b = (await resizer(app).boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + Math.min(b.height / 2, 300);
  await app.page.mouse.move(x, y);
  await app.page.mouse.down();
  await app.page.mouse.move(x + dx / 2, y, { steps: 5 });
  await app.page.mouse.move(x + dx, y, { steps: 5 });
  return () => app.page.mouse.up();
}

test.describe('AC31 cột trái 1440×900', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('AC31 tay kéo: ARIA separator; kéo chuột → độ rộng đổi theo, board data-resizing lúc kéo, chỉ lưu khi thả; kẹp 220–420', async ({ app, page }) => {
    await app.openReady();
    const r = resizer(app);
    await expect(r).toBeVisible();
    await expect(r).toHaveAttribute('role', 'separator');
    await expect(r).toHaveAttribute('aria-orientation', 'vertical');
    await expect(r).toHaveAccessibleName('Đổi độ rộng cột trái');
    await expect(r).toHaveAttribute('aria-valuemin', String(MIN_W));
    await expect(r).toHaveAttribute('aria-valuemax', String(MAX_W));
    await expect(r).toHaveAttribute('tabindex', '0');
    await expect(r).toHaveAttribute('title', 'Kéo để đổi độ rộng · bấm đúp để về mặc định');
    expect(await r.getAttribute('aria-controls')).toBe(await toggle(app).getAttribute('aria-controls'));
    expect(await r.evaluate((el) => !!el.closest('main'))).toBe(true);
    await expectWidth(app, DEFAULT_W);
    // Tay kéo nằm ở mép phải cột trái.
    const rb = (await r.boundingBox())!;
    const sb = (await (await side(app)).boundingBox())!;
    expect(Math.abs(rb.x + rb.width / 2 - (sb.x + sb.width)), 'tay kéo ở mép phải cột trái').toBeLessThanOrEqual(2);
    expect(Math.round(rb.width)).toBe(6);
    const before = await saved(page);

    const up = await startDrag(app, 60);
    await expect(board(page)).toHaveAttribute('data-resizing', /.*/);
    await expect.poll(() => sideWidth(app)).toBeGreaterThanOrEqual(DEFAULT_W + 60 - 1);
    expect(await saved(page), 'đang kéo → chưa lưu').toEqual(before);
    await up();
    await expect(board(page)).not.toHaveAttribute('data-resizing', /.*/);
    await expectWidth(app, DEFAULT_W + 60);
    await expect.poll(() => saved(page), { message: 'thả chuột → lưu' }).toEqual({ width: DEFAULT_W + 60, hidden: false });

    // Kéo quá max / min → kẹp.
    let release = await startDrag(app, 400);
    await release();
    await expectWidth(app, MAX_W);
    await expect.poll(() => saved(page)).toEqual({ width: MAX_W, hidden: false });
    release = await startDrag(app, -600);
    await release();
    await expectWidth(app, MIN_W);
    await expect.poll(() => saved(page)).toEqual({ width: MIN_W, hidden: false });
    // Cột danh sách co giãn theo, không tràn ngang.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  });

  test('AC31 phím ←/→ (16px), Shift (48px), Home/End (220/420), bấm đúp → 256; mỗi lần đều lưu', async ({ app, page }) => {
    await app.openReady();
    const r = resizer(app);
    await r.focus();
    await page.keyboard.press('ArrowRight');
    await expectWidth(app, DEFAULT_W + 16);
    expect(await saved(page)).toEqual({ width: DEFAULT_W + 16, hidden: false });
    await page.keyboard.press('ArrowLeft');
    await expectWidth(app, DEFAULT_W);
    await page.keyboard.press('Shift+ArrowRight');
    await expectWidth(app, DEFAULT_W + 48);
    expect(await saved(page)).toEqual({ width: DEFAULT_W + 48, hidden: false });
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await expectWidth(app, DEFAULT_W - 48 < MIN_W ? MIN_W : DEFAULT_W - 48);
    await page.keyboard.press('End');
    await expectWidth(app, MAX_W);
    expect(await saved(page)).toEqual({ width: MAX_W, hidden: false });
    await page.keyboard.press('ArrowRight');
    await expectWidth(app, MAX_W);
    await page.keyboard.press('Home');
    await expectWidth(app, MIN_W);
    expect(await saved(page)).toEqual({ width: MIN_W, hidden: false });
    await page.keyboard.press('ArrowLeft');
    await expectWidth(app, MIN_W);
    await expect(r).toBeFocused();

    await r.dblclick();
    await expectWidth(app, DEFAULT_W);
    await expect.poll(() => saved(page)).toEqual({ width: DEFAULT_W, hidden: false });
  });

  test('AC31 nút ẩn: cột trái + tay kéo biến mất, board 1 cột; .traffic (ba chấm + nút) lên .title-ctl trước ô tìm kiếm; focus ở nút; aria-expanded/label đổi; hiện lại đúng độ rộng cũ', async ({ app, page }) => {
    await app.openReady();
    const t = toggle(app);
    await expect(t).toHaveAttribute('aria-expanded', 'true');
    // Contract 1d: aria-label chỉ là hành động; phím tắt chỉ có trong title và aria-keyshortcuts.
    await expect(t).toHaveAccessibleName('Ẩn cột trái');
    await expect(t).toHaveAttribute('title', 'Ẩn cột trái (⌘\\)');
    await expect(t).toHaveAttribute('aria-keyshortcuts', 'Meta+Backslash Control+Backslash');
    expect(await t.evaluate((el) => !!el.closest('.traffic')), 'nút nằm trong nhóm .traffic').toBe(true);
    const s = await side(app);
    expect(await t.evaluate((el, sel) => !!el.closest(sel), `[id="${await t.getAttribute('aria-controls')}"]`), 'khi hiện, nút ở trong cột trái').toBe(true);
    const tb = (await t.boundingBox())!;
    expect(Math.round(tb.width)).toBe(26);
    // Đặt độ rộng khác mặc định để kiểm hiện lại giữ nguyên.
    await resizer(app).focus();
    await page.keyboard.press('Shift+ArrowRight');
    await expectWidth(app, DEFAULT_W + 48);

    await t.click();
    await expect(s).toHaveCount(0);
    await expect(resizer(app)).toHaveCount(0);
    await expect(board(page)).toHaveAttribute('data-side', 'hidden');
    await expect(t).toBeFocused();
    await expect(t).toHaveAttribute('aria-expanded', 'false');
    await expect(t).toHaveAccessibleName('Hiện cột trái');
    await expect(t).toHaveAttribute('title', 'Hiện cột trái (⌘\\)');
    await expect.poll(() => saved(page)).toEqual({ width: DEFAULT_W + 48, hidden: true });
    // .title-ctl chứa cả ba nút cửa sổ + nút hiện, đứng trước ô tìm kiếm.
    const ctl = page.locator('.title-ctl');
    await expect(ctl).toBeVisible();
    for (const id of ['win-close', 'win-minimize', 'win-maximize', 'side-toggle']) await expect(ctl.getByTestId(id), `${id} trong .title-ctl`).toBeVisible();
    const order = await page.evaluate(() => {
      const ctlEl = document.querySelector('.title-ctl')!;
      const search = document.querySelector('[data-testid="search"]')!;
      return ctlEl.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING ? 'before' : 'after';
    });
    expect(order, '.title-ctl đứng trước ô tìm kiếm').toBe('before');
    const cb = (await ctl.boundingBox())!;
    const sbx = (await app.tid('search').boundingBox())!;
    expect(cb.x + cb.width, 'nằm bên trái ô tìm kiếm').toBeLessThanOrEqual(sbx.x + 1);
    const gap = (await t.boundingBox())!.x - ((await app.tid('win-maximize').boundingBox())!.x + (await app.tid('win-maximize').boundingBox())!.width);
    // Contract 1d (sửa 2026-10-04): margin-left 10px + gap 8px của .traffic = cách nút xanh 18px (giống app Ghi chú).
    expect(Math.abs(gap - 18), `nút cách nút xanh 18px (đo ${gap})`).toBeLessThanOrEqual(1.5);
    // Board 1 cột: danh sách bắt đầu sát mép trái board.
    const bb = (await board(page).boundingBox())!;
    const title = (await app.tid('list-title').boundingBox())!;
    expect(title.x - bb.x, 'không còn cột trái').toBeLessThan(80);

    // Bấm lại → hiện, độ rộng cũ, focus ở nút.
    await t.click();
    await expect(await side(app)).toBeVisible();
    await expect(resizer(app)).toBeVisible();
    await expect(board(page)).not.toHaveAttribute('data-side', 'hidden');
    await expect(t).toBeFocused();
    await expect(t).toHaveAttribute('aria-expanded', 'true');
    await expectWidth(app, DEFAULT_W + 48);
    await expect.poll(() => saved(page)).toEqual({ width: DEFAULT_W + 48, hidden: false });
  });

  test('AC31 ⌘+\\ và Ctrl+\\ ẩn/hiện; có trong menu Trợ giúp; cửa sổ thu nhỏ thì phím tắt không có tác dụng', async ({ app, page }) => {
    await app.openReady();
    await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.keyboard.press('Meta+Backslash');
    await expect(board(page)).toHaveAttribute('data-side', 'hidden');
    await expect(resizer(app)).toHaveCount(0);
    await page.keyboard.press('Control+Backslash');
    await expect(board(page)).not.toHaveAttribute('data-side', 'hidden');
    await expect(resizer(app)).toBeVisible();
    await page.keyboard.press('Control+Backslash');
    await expect(board(page)).toHaveAttribute('data-side', 'hidden');
    await page.keyboard.press('Meta+Backslash');
    await expect(board(page)).not.toHaveAttribute('data-side', 'hidden');

    await app.tid('help-toggle').click();
    await expect(app.tid('help-menu')).toContainText('cột trái');
    await expect(app.tid('help-menu')).toContainText('\\');
    await page.keyboard.press('Escape');

    // Thu nhỏ → phím tắt không chạy.
    const before = await saved(page);
    await app.tid('win-minimize').click();
    await expect(page.locator('.page')).toHaveAttribute('hidden', '');
    await page.keyboard.press('Meta+Backslash');
    await page.keyboard.press('Control+Backslash');
    await page.waitForTimeout(300);
    expect(await saved(page), 'thu nhỏ → không đổi trạng thái').toEqual(before);
    await page.getByTestId('dock-app-cong-viec').click();
    await expect(board(page)).toBeVisible();
    await expect(board(page)).not.toHaveAttribute('data-side', 'hidden');
    await expect(resizer(app)).toBeVisible();
  });

  test('AC31 refresh giữ độ rộng và trạng thái ẩn', async ({ app, page }) => {
    await app.openReady();
    await resizer(app).focus();
    await page.keyboard.press('End');
    await expectWidth(app, MAX_W);
    await page.reload();
    await app.ready();
    await expectWidth(app, MAX_W);
    await toggle(app).click();
    await expect(board(page)).toHaveAttribute('data-side', 'hidden');
    await page.reload();
    await app.ready();
    await expect(board(page)).toHaveAttribute('data-side', 'hidden');
    await expect(resizer(app)).toHaveCount(0);
    await expect(toggle(app)).toHaveAttribute('aria-expanded', 'false');
    await toggle(app).click();
    await expectWidth(app, MAX_W);
  });

  test('AC31 giá trị lưu lạ → 256 và đang hiện (width null / hidden "yes", JSON hỏng); width ngoài khoảng → kẹp', async ({ app, page }) => {
    await app.openReady();
    for (const raw of ['{"width":null,"hidden":"yes"}', 'not-json{', '{"width":"300","hidden":1}', '{"width":1e999,"hidden":true}']) {
      await setSaved(page, raw);
      await page.reload();
      await app.ready();
      if (raw.includes('1e999')) {
        // 1e999 → Infinity (không hữu hạn) → 256; hidden true hợp lệ → đang ẩn.
        await expect(board(page)).toHaveAttribute('data-side', 'hidden');
        await toggle(app).click();
      } else {
        await expect(board(page), `${raw} → đang hiện`).not.toHaveAttribute('data-side', 'hidden');
      }
      await expectWidth(app, DEFAULT_W);
    }
    for (const [w, want] of [
      [999, MAX_W],
      [100, MIN_W],
      [300, 300],
    ] as const) {
      await setSaved(page, JSON.stringify({ width: w, hidden: false }));
      await page.reload();
      await app.ready();
      await expectWidth(app, want);
    }
  });
});

test.describe('AC31 ≤ 880px', () => {
  test.use({ viewport: { width: 768, height: 1000 } });

  test('AC31 768px: bỏ qua trạng thái ẩn đã lưu, nút ẩn không hiển thị, không có tay kéo; lên ≥ 881px thì áp lại', async ({ app, page }) => {
    await app.open();
    await setSaved(page, JSON.stringify({ width: 300, hidden: true }));
    await page.reload();
    await app.ready();
    await expect(board(page)).not.toHaveAttribute('data-side', 'hidden');
    await expect(app.tid('side-resizer'), 'không có tay kéo').toBeHidden();
    await expect(app.tid('side-toggle'), 'không có nút ẩn').toBeHidden();
    await app.ensurePanelOpen('role-filter-assignee');
    await expect(app.tid('role-filter-assignee'), 'cột trái (bộ lọc) vẫn dùng được').toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(768);

    // matchMedia có nghe change: lên 1440 → áp trạng thái ẩn đã lưu; về 768 → bỏ qua.
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(board(page)).toHaveAttribute('data-side', 'hidden');
    await expect(app.tid('side-toggle')).toBeVisible();
    await page.setViewportSize({ width: 768, height: 1000 });
    await expect(board(page)).not.toHaveAttribute('data-side', 'hidden');
    await expect(app.tid('side-toggle')).toBeHidden();
  });
});
