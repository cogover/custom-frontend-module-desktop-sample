import { test, expect } from '../../support/local/fixtures';
import { themeState } from '../../support/ui';

const isDark = (s: Awaited<ReturnType<typeof themeState>>) => s.dataTheme === 'dark' || s.ariaPressed === 'true';

test.describe('AC15 theme sáng/tối', () => {
  test('AC15 đổi theme, ảnh nền đổi theo và nhớ sau khi tải lại', async ({ app, page }) => {
    await app.openReady();
    const light = await themeState(page);
    expect(isDark(light), 'mặc định (hệ thống sáng) là giao diện sáng').toBe(false);
    expect(light.hasBgImage, 'có ảnh nền').toBe(true);

    await app.tid('theme-toggle').click();
    const dark = await themeState(page);
    expect(isDark(dark), 'sau khi bấm phải là giao diện tối').toBe(true);
    expect(dark.bgImage, 'ảnh nền phải đổi theo theme').not.toBe(light.bgImage);
    expect(dark.bgColor, 'màu nền phải đổi').not.toBe(light.bgColor);
    if (dark.luminance !== null && light.luminance !== null) expect(dark.luminance).toBeLessThan(light.luminance);
    await expect(app.tid('theme-toggle')).toHaveAccessibleName(/sáng/i);

    await page.reload();
    await app.ready();
    expect(isDark(await themeState(page)), 'nhớ giao diện tối sau khi tải lại').toBe(true);

    await app.tid('theme-toggle').click();
    expect(isDark(await themeState(page))).toBe(false);
    await page.reload();
    await app.ready();
    const back = await themeState(page);
    expect(isDark(back), 'nhớ giao diện sáng sau khi tải lại').toBe(false);
    expect(back.bgImage).toBe(light.bgImage);
  });
});
