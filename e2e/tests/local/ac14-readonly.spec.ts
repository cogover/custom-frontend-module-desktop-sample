import { test, expect } from '../../support/local/fixtures';
import { T } from '../../support/local/dataset';
import { MSG, ROLE_LABEL } from '../../support/model';
import { ALL_ROLES, expectDisabledOrAbsent, isDisabled } from '../../support/ui';

// Chỉ test bằng mock: fixture thật sẽ gửi thông báo cho người thật (CONTRACT AC14).
test.describe('AC14 task chỉ theo dõi → chỉ xem', () => {
  test('AC14 thẻ: data-readonly, nhãn "Theo dõi", checkbox/trạng thái/xoá/sửa nhanh vô hiệu', async ({ app, mock, page }) => {
    await app.openReady();
    // Task chỉ theo dõi chỉ hiện khi tick "Tôi theo dõi" (mặc định chỉ "Giao cho tôi").
    await expect(app.item(T.T5)).toHaveCount(0);
    await app.setRoles(ALL_ROLES);
    await expect(app.item(T.T5)).toHaveAttribute('data-readonly', 'true');
    for (const id of [T.T1, T.T2, T.T7]) await expect(app.item(id)).toHaveAttribute('data-readonly', 'false');
    await expect(app.inItem(T.T5, 'task-role')).toContainText(ROLE_LABEL.cc);

    expect(await isDisabled(app.inItem(T.T5, 'task-checkbox')), 'checkbox phải vô hiệu').toBe(true);
    expect(await isDisabled(app.inItem(T.T5, 'task-status')), 'chọn trạng thái phải vô hiệu').toBe(true);
    await app.item(T.T5).hover();
    // 2026-10-04: thẻ không còn nút xoá (xoá chỉ trong popup, task chỉ theo dõi không có nút này).
    await expect(app.inItem(T.T5, 'task-delete'), 'thẻ không có nút xoá').toHaveCount(0);

    await app.dblclickTitle(T.T5);
    await page.waitForTimeout(300);
    await expect(app.inItem(T.T5, 'title-edit'), 'không được sửa nhanh tiêu đề').toHaveCount(0);

    await app.inItem(T.T5, 'task-checkbox').click({ force: true }).catch(() => {});
    await page.waitForTimeout(800);
    await expect(app.item(T.T5)).toHaveAttribute('data-status', 'new');
    expect(mock.writes(), 'không có request ghi nào').toHaveLength(0);
  });

  test('AC14 popup: ghi chú "Bạn chỉ theo dõi công việc này", Sửa/Xoá vô hiệu', async ({ app, mock, page }) => {
    await app.openReady();
    await app.setRoles(['cc']);
    await app.openTask(T.T5);
    await expect(app.dialog()).toContainText(MSG.readonlyNote);
    await expectDisabledOrAbsent(app.tid('form-edit'), 'nút Sửa');
    await expectDisabledOrAbsent(app.tid('form-delete'), 'nút Xoá');
    await expect(app.form()).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(app.dialog()).toBeHidden();
    expect(mock.writes()).toHaveLength(0);
  });

  // Deep-link mở được cả task đang bị bộ lọc vai trò mặc định ẩn.
  test('AC14 deep-link tới task chỉ theo dõi cũng chỉ xem', async ({ app }) => {
    await app.openReady(`#/task/${T.T5}`);
    await expect(app.dialog()).toBeVisible();
    await expect(app.dialog()).toContainText(MSG.readonlyNote);
    await expectDisabledOrAbsent(app.tid('form-edit'), 'nút Sửa');
  });
});
