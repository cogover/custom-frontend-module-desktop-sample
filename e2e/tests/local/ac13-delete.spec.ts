import { test, expect } from '../../support/local/fixtures';
import { T } from '../../support/local/dataset';
import { OBJECT_TYPE, WORKSPACE_ID } from '../../support/model';

/**
 * Contract mục 5 #5: xoá qua hộp xác nhận, không còn xoá trễ 5 giây / Hoàn tác / pagehide.
 * 2026-10-04: thẻ việc không còn nút xoá — chỉ xoá từ popup xem (`form-delete`).
 */
const T6_NAME = 'Cập nhật tài liệu bàn giao cho đội dev';
const T8_NAME = 'Gọi lại khách hàng Phú Thành';

test.describe('AC13 xoá có xác nhận (từ popup xem)', () => {
  test('AC13 thẻ không có nút xoá; "Xoá công việc" trong popup → hộp xác nhận (tiêu đề, tên task, Huỷ focus mặc định); Huỷ → không gọi API, popup vẫn mở', async ({ app, mock, page }) => {
    await app.openReady();
    await app.item(T.T6).hover();
    await expect(app.page.getByTestId('task-delete'), 'thẻ không còn nút xoá (2026-10-04)').toHaveCount(0);
    await expect(app.item(T.T6).getByRole('button', { name: /xoá/i }), 'thẻ không có nút nào tên "Xoá"').toHaveCount(0);

    await app.openTask(T.T6);
    await expect(app.tid('form-delete')).toHaveAccessibleName('Xoá công việc');
    await app.openDeleteConfirm(T.T6);
    const box = app.tid('confirm-delete');
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(box).toContainText('Xoá công việc?');
    await expect(box).toContainText(T6_NAME);
    await expect(box).toContainText('sẽ bị xoá vĩnh viễn khỏi Cogover');
    await expect(app.tid('confirm-delete-cancel')).toHaveText(/Huỷ/);
    await expect(app.tid('confirm-delete-ok')).toHaveText(/Xoá/);
    await expect(app.tid('confirm-delete-cancel'), 'Huỷ được focus mặc định').toBeFocused();

    await app.tid('confirm-delete-cancel').click();
    await expect(box).toBeHidden();
    await expect(app.dialog(), 'Huỷ chỉ đóng hộp xác nhận').toBeVisible();
    await expect(app.view()).toBeVisible();
    await page.waitForTimeout(600);
    expect(mock.deletes(), 'Huỷ → không gọi API xoá').toHaveLength(0);
    expect(mock.task(T.T6)).toBeDefined();
    await page.keyboard.press('Escape');
    await expect(app.dialog()).toBeHidden();
    await expect(app.item(T.T6)).toBeVisible();
  });

  test('AC13 Enter ngay khi hộp xác nhận mở (focus ở Huỷ) → không xoá', async ({ app, mock, page }) => {
    await app.openReady();
    await app.openDeleteConfirm(T.T6);
    await page.keyboard.press('Enter');
    await expect(app.tid('confirm-delete')).toBeHidden();
    await page.waitForTimeout(600);
    expect(mock.deletes()).toHaveLength(0);
    await expect(app.view()).toBeVisible();
    expect(mock.task(T.T6)).toBeDefined();
  });

  test('AC13 Esc trên hộp xác nhận → không xoá, popup chi tiết vẫn mở', async ({ app, mock, page }) => {
    await app.openReady();
    await app.openDeleteConfirm(T.T4);
    await expect(app.tid('confirm-delete')).toContainText('Kiến trúc thông tin cho mục Thư viện');
    await page.keyboard.press('Escape');
    await expect(app.tid('confirm-delete')).toBeHidden();
    await expect(app.dialog(), 'Esc chỉ đóng hộp xác nhận').toBeVisible();
    await expect(app.view()).toBeVisible();
    await page.waitForTimeout(600);
    expect(mock.deletes(), 'Esc → không gọi API xoá').toHaveLength(0);
  });

  test('AC13 xác nhận → gọi API xoá ngay, đóng popup, task biến mất, toast "Đã xoá" không có Hoàn tác', async ({ app, mock, page }) => {
    await app.openReady();
    await app.expectCounts({ open: 6 });
    await app.openDeleteConfirm(T.T8);
    const t0 = Date.now();
    await app.tid('confirm-delete-ok').click();
    await expect.poll(() => mock.deletes().length, { timeout: 2000 }).toBe(1);
    expect(Date.now() - t0, 'gọi API ngay, không trễ 5 giây').toBeLessThan(2000);
    const del = mock.deletes()[0];
    expect(del.headers['x-req-service']).toBe('218');
    expect(del.body).toEqual({ workspace_id: WORKSPACE_ID, object_type: OBJECT_TYPE, ids: [T.T8] });
    await expect(app.tid('confirm-delete')).toBeHidden();
    await expect(app.dialog(), 'xoá xong thì đóng popup').toBeHidden();
    await expect(app.item(T.T8)).toBeHidden();
    expect(mock.task(T.T8)).toBeUndefined();
    await expect(app.toast()).toBeVisible();
    await expect(app.toast()).toContainText('Đã xoá');
    await expect(app.toast()).toContainText(T8_NAME);
    await expect(app.tid('toast-undo'), 'không còn Hoàn tác khi xoá').toBeHidden();
    await app.expectCounts({ open: 5 });
    await page.waitForTimeout(1000);
    expect(mock.deletes(), 'chỉ gọi xoá 1 lần').toHaveLength(1);
    expect(mock.violations).toEqual([]);
  });

  test('AC13 lỗi API khi xoá → task vẫn còn + báo lỗi', async ({ app, mock, page, guard }) => {
    guard.allow(/console\.error/);
    await app.openReady();
    mock.failNext((r) => r.kind === 'delete', { status: 200, body: { r: 4032, msg: 'Không xoá được (giả lập E2E)' } });
    await app.openDeleteConfirm(T.T8);
    await app.tid('confirm-delete-ok').click();
    await expect.poll(() => mock.deletes().length).toBe(1);
    await expect(page.getByText('Không xoá được (giả lập E2E)').first()).toBeVisible();
    expect(mock.task(T.T8)).toBeDefined();
    if (await app.dialog().isVisible()) await page.keyboard.press('Escape');
    await expect(app.item(T.T8), 'lỗi → giữ task').toBeVisible();
    await app.expectCounts({ open: 6 });
  });
});
