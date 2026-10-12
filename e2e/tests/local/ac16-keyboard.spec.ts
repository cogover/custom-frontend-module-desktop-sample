import { test, expect } from '../../support/local/fixtures';

import { optionLabels, selectedOptionLabel } from '../../support/ui';

const activeTestId = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);
const focusInDialog = (page: import('@playwright/test').Page) =>
  page.evaluate(() => !!document.activeElement?.closest('[data-testid="task-dialog"]'));

test.describe('AC16 bàn phím', () => {
  test('AC16 Tab tới thẻ, Enter mở popup, focus nằm trong popup, Esc đóng', async ({ app, page }) => {
    await app.openReady();
    await page.locator('body').click({ position: { x: 2, y: 2 } });
    let reached = false;
    for (let i = 0; i < 80 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = (await activeTestId(page)) === 'task-item';
    }
    expect(reached, 'Tab phải tới được thẻ công việc').toBe(true);
    const focusedId = await page.evaluate(() => document.activeElement?.getAttribute('data-task-id'));
    expect(focusedId).toBeTruthy();

    await page.keyboard.press('Enter');
    await expect(app.dialog()).toBeVisible();
    await expect(app.view()).toBeVisible();
    await expect.poll(() => focusInDialog(page), { message: 'focus phải nằm trong popup' }).toBe(true);

    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(await focusInDialog(page), `Tab lần ${i + 1}: focus phải bị giữ trong popup`).toBe(true);
    }
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await focusInDialog(page)).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(app.dialog()).toBeHidden();
  });

  test('AC16 trong chế độ sửa: Esc về xem, Esc lần nữa đóng (dùng bàn phím)', async ({ app, page }) => {
    await app.openReady();
    const first = app.items().first();
    await first.focus();
    await page.keyboard.press('Enter');
    await expect(app.view()).toBeVisible();
    await app.tid('form-edit').focus();
    await page.keyboard.press('Enter');
    await expect(app.form()).toBeVisible();
    await expect.poll(() => focusInDialog(page)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(app.view()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(app.dialog()).toBeHidden();
  });

  test('AC16 Select (shadcn) dùng được bằng bàn phím: Enter mở, mũi tên chọn, Enter xác nhận, Esc huỷ', async ({ app, page }) => {
    await app.openReady();
    const trigger = app.tid('sort-by');
    const labels = await optionLabels(page, trigger);
    expect(labels.length).toBeGreaterThanOrEqual(5);
    const before = await selectedOptionLabel(trigger);
    const i = labels.findIndex((l) => before.includes(l));
    expect(i, 'giá trị hiện tại là 1 option').toBeGreaterThanOrEqual(0);
    // Chờ focus thật sự nằm trên option (như người dùng nhìn thấy) trước khi bấm phím tiếp theo.
    const focusedOption = () =>
      page.evaluate(() => {
        const a = document.activeElement;
        return a?.getAttribute('role') === 'option' ? (a.textContent ?? '').replace(/\s+/g, ' ').trim() : null;
      });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox')).toBeVisible();
    await expect.poll(focusedOption, { message: 'mở bằng Enter → focus vào option đang chọn' }).toBe(labels[i]);
    await page.keyboard.press('ArrowDown');
    await expect.poll(focusedOption, { message: 'mũi tên xuống → option kế tiếp' }).toBe(labels[(i + 1) % labels.length]);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(trigger).toContainText(labels[(i + 1) % labels.length]);
    await expect(trigger, 'focus trả về trigger').toBeFocused();

    const now = await selectedOptionLabel(trigger);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox')).toBeVisible();
    await expect.poll(focusedOption).not.toBeNull();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    expect(await selectedOptionLabel(trigger), 'Esc không đổi giá trị').toBe(now);
  });

  test('AC16 Date Picker dùng được bằng bàn phím: mũi tên đổi ngày, Enter chọn, Esc chỉ đóng lịch', async ({ app, page }) => {
    await app.openReady();
    await app.openCreate();
    const trigger = app.tid('field-due-date');
    await expect(trigger).toContainText('01/10/2026');
    await trigger.focus();
    await page.keyboard.press('Enter');
    const cal = app.calendar();
    await expect(cal).toBeVisible();
    const inGrid = () =>
      page.evaluate(() => !!document.activeElement?.closest('[data-testid="calendar"]') && !!document.activeElement?.closest('[role="grid"], table'));
    for (let k = 0; k < 6 && !(await inGrid()); k++) await page.keyboard.press('Tab');
    expect(await inGrid(), 'focus phải tới được ô ngày bằng bàn phím').toBe(true);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(trigger).toContainText('02/10/2026');
    if (await cal.isVisible()) {
      await page.keyboard.press('Escape');
      await expect(cal).toBeHidden();
    }
    await expect(app.dialog(), 'Esc trên lịch không đóng popup tạo việc').toBeVisible();

    // Mở lại rồi Esc: không đổi ngày.
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(cal).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(cal).toBeHidden();
    await expect(app.dialog()).toBeVisible();
    await expect(trigger).toContainText('02/10/2026');
  });
});
