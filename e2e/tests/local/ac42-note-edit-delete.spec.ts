import { test, expect } from '../../support/local/fixtures';
import { A, ACT_TASK, manyNoteId } from '../../support/local/dataset';
import { ACTIVITY_OBJECT_TYPE, WORKSPACE_ID } from '../../support/model';
import type { TaskApp } from '../../support/ui';

/**
 * AC42 / CONTRACT mục 5 điểm 3c (2026-10-08): sửa / xoá ghi chú của chính mình trong timeline.
 *  - Chỉ ghi chú (`note`) do tôi tạo có nút `activity-edit` / `activity-delete`; của người khác, loại khác thì không.
 *  - Sửa: trình soạn tại chỗ (`activity-edit-composer`), lưu → 10201 trên activity chỉ `id` + `content`; không đổi → không gửi.
 *  - Xoá: hộp "Xoá ghi chú?" (`confirm-note-delete`) → 218 trên activity `ids: [id]`; Huỷ không gửi; số đếm giảm.
 */

async function openTimeline(app: TaskApp, taskId: string) {
  await app.openTask(taskId);
  await expect(app.tid('activities')).toBeVisible();
  await expect(app.tid('activities-loading')).toBeHidden({ timeout: 10_000 });
}

const editEditor = (app: TaskApp) =>
  app.page.locator('[data-testid="activity-edit-content-editor"][contenteditable="true"], [data-testid="activity-edit-content-editor"] [contenteditable="true"]');

test.describe('AC42 sửa / xoá ghi chú của tôi', () => {
  test('AC42 nút Sửa / Xoá chỉ ở ghi chú của tôi', async ({ app }) => {
    await app.openReady();
    await openTimeline(app, ACT_TASK.MIXED);
    await expect(app.activityItem(A.NOTE_PLAIN).getByTestId('activity-edit')).toHaveCount(1); // của tôi
    await expect(app.activityItem(A.NOTE_PLAIN).getByTestId('activity-delete')).toHaveCount(1);
    for (const id of [A.NOTE_FULL, A.TASK_FILES, A.CALL_OLD]) {
      await expect(app.activityItem(id).getByTestId('activity-edit'), `${id} không phải ghi chú của tôi`).toHaveCount(0);
      await expect(app.activityItem(id).getByTestId('activity-delete')).toHaveCount(0);
    }
  });

  test('AC42 sửa: không đổi → không gửi; đổi nội dung → 10201 chỉ id + content, hiện nội dung mới, toast "Đã sửa ghi chú"', async ({ app, mock, page }) => {
    await app.openReady();
    await openTimeline(app, ACT_TASK.MANY);
    const item = app.activityItem(manyNoteId(18));
    await item.hover();
    await item.getByTestId('activity-edit').click();
    await expect(editEditor(app)).toBeVisible({ timeout: 15_000 });
    await expect(editEditor(app)).toContainText('Nội dung ghi chú số 18');
    await app.tid('activity-edit-submit').click();
    await expect(app.tid('activity-edit-composer')).toHaveCount(0);
    expect(mock.activityUpdates(), 'không đổi → không gửi').toHaveLength(0);

    await item.hover();
    await item.getByTestId('activity-edit').click();
    await expect(editEditor(app)).toBeVisible({ timeout: 15_000 });
    // mở sửa → con trỏ ở cuối nội dung, gõ tiếp được ngay
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-testid="activity-edit-content-editor"]'))).toBe(true);
    await app.settleSelection();
    await page.keyboard.type(' — đã cập nhật');
    await app.tid('activity-edit-submit').click();
    await expect(app.toast()).toContainText('Đã sửa ghi chú');
    await expect(item.getByTestId('activity-content')).toContainText('Nội dung ghi chú số 18 — đã cập nhật');
    const [req] = mock.activityUpdates();
    expect(req.headers['x-req-service']).toBe('10201');
    expect(req.body.object_type).toBe(ACTIVITY_OBJECT_TYPE);
    expect(Object.keys(req.body.data).sort()).toEqual(['content', 'id', 'object_type', 'workspace_id']);
    expect(req.body.data).toMatchObject({ id: manyNoteId(18), workspace_id: WORKSPACE_ID, content: '<p>Nội dung ghi chú số 18 — đã cập nhật</p>' });
    expect(mock.violations).toEqual([]);
  });

  test('AC42 xoá: Huỷ không gửi; Xoá → 218 ids [id], mục biến mất, "Hoạt động · 17", toast "Đã xoá ghi chú"', async ({ app, mock }) => {
    await app.openReady();
    await openTimeline(app, ACT_TASK.MANY);
    const id = manyNoteId(17);
    const item = app.activityItem(id);
    await item.hover();
    await item.getByTestId('activity-delete').click();
    await expect(app.tid('confirm-note-delete')).toContainText('Xoá ghi chú?');
    await app.tid('confirm-note-delete-cancel').click();
    await expect(app.tid('confirm-note-delete')).toHaveCount(0);
    await expect(app.dialog()).toBeVisible();
    expect(mock.activityDeletes()).toHaveLength(0);

    await item.hover();
    await item.getByTestId('activity-delete').click();
    await app.tid('confirm-note-delete-ok').click();
    await expect(app.toast()).toContainText('Đã xoá ghi chú');
    await expect(item).toHaveCount(0);
    await expect(app.tid('activities')).toContainText(/Hoạt động\s*·\s*17(?!\d)/);
    const [req] = mock.activityDeletes();
    expect(req.headers['x-req-service']).toBe('218');
    expect(req.body).toMatchObject({ workspace_id: WORKSPACE_ID, object_type: ACTIVITY_OBJECT_TYPE, ids: [id] });
    expect(mock.violations).toEqual([]);
  });
});
