import { test, expect } from '../../support/local/fixtures';

/** Contract mục 5 #8: khối "Phím tắt" rời sidebar → nút Trợ giúp (help-toggle) + popover help-menu. */
const SHORTCUTS: [string, RegExp][] = [
  ['N', /Tạo công việc/],
  ['/', /Tìm kiếm/],
  ['T', /Đổi sáng\s*\/\s*tối/],
  ['Esc', /Đóng hộp thoại/],
];

async function expectMenuContent(menu: import('@playwright/test').Locator) {
  await expect(menu).toContainText('Phím tắt');
  const keys = (await menu.locator('kbd').allInnerTexts()).map((k) => k.trim());
  for (const [key, desc] of SHORTCUTS) {
    expect(keys, `có phím ${key} trong <kbd>`).toContain(key);
    await expect(menu).toContainText(desc);
  }
}

test.describe('Menu Trợ giúp (Phím tắt)', () => {
  test('AC16 sidebar không còn khối "Phím tắt"; nút Trợ giúp ngay bên trái nút theme, cùng hàng', async ({ app, page }) => {
    await app.openReady();
    await expect(page.getByText('Phím tắt', { exact: true }).filter({ visible: true }), 'không còn khối Phím tắt').toHaveCount(0);
    const help = app.tid('help-toggle');
    await expect(help).toBeVisible();
    await expect(help).toHaveAccessibleName(/Trợ giúp/);
    await expect(help).toHaveAttribute('title', 'Phím tắt');
    await expect(help).toHaveAttribute('aria-expanded', 'false');
    await expect(app.tid('help-menu')).toBeHidden();

    const hb = (await help.boundingBox())!;
    const tb = (await app.tid('theme-toggle').boundingBox())!;
    expect(hb.x + hb.width, 'nút Trợ giúp nằm bên trái nút theme').toBeLessThanOrEqual(tb.x + 1);
    expect(tb.x - (hb.x + hb.width), 'ngay cạnh (khoảng cách nhỏ)').toBeLessThan(24);
    expect(Math.abs(hb.y + hb.height / 2 - (tb.y + tb.height / 2)), 'cùng hàng').toBeLessThan(4);
    expect(Math.abs(hb.height - tb.height), 'cùng kiểu/kích thước với nút theme').toBeLessThan(4);
  });

  test('AC16 mở/đóng menu Trợ giúp bằng chuột (bấm lại nút, click ra ngoài)', async ({ app }) => {
    await app.openReady();
    const help = app.tid('help-toggle');
    const menu = app.tid('help-menu');
    await help.click();
    await expect(menu).toBeVisible();
    await expect(help).toHaveAttribute('aria-expanded', 'true');
    await expectMenuContent(menu);

    await help.click();
    await expect(menu).toBeHidden();
    await expect(help).toHaveAttribute('aria-expanded', 'false');

    await help.click();
    await expect(menu).toBeVisible();
    await app.tid('list-title').click();
    await expect(menu).toBeHidden();
    await expect(app.dialog()).toBeHidden();
  });

  test('AC16 mở/đóng menu Trợ giúp bằng bàn phím, Esc đóng và trả focus về nút', async ({ app, page }) => {
    await app.openReady();
    const help = app.tid('help-toggle');
    const menu = app.tid('help-menu');
    await help.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toBeVisible();
    await expect(help).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(help).toBeFocused();

    await page.keyboard.press('Space');
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(help).toBeFocused();
    await expect(app.dialog(), 'Esc đóng menu không mở/đóng gì khác').toBeHidden();
  });
});

test.describe('Menu Trợ giúp ở 375px', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('AC17 nút Trợ giúp vừa topbar, popover trong khung, không cuộn ngang', async ({ app, page }) => {
    await app.openReady();
    const hb = (await app.tid('help-toggle').boundingBox())!;
    const tb = (await app.tid('theme-toggle').boundingBox())!;
    expect(hb.x + hb.width).toBeLessThanOrEqual(tb.x + 1);
    expect(Math.abs(hb.y - tb.y)).toBeLessThan(4);
    expect(tb.x + tb.width).toBeLessThanOrEqual(375.5);
    await app.tid('help-toggle').click();
    const menu = app.tid('help-menu');
    await expect(menu).toBeVisible();
    const mb = (await menu.boundingBox())!;
    expect(mb.x).toBeGreaterThanOrEqual(0);
    expect(mb.x + mb.width, 'popover nằm trong khung 375px').toBeLessThanOrEqual(375.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), 'không cuộn ngang').toBeLessThanOrEqual(375);
  });
});
