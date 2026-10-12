import { test, expect } from '../../support/local/fixtures';
import { T } from '../../support/local/dataset';
import { STATUSES } from '../../support/model';
import { chooseOption, optionLabels, selectedOptionLabel } from '../../support/ui';

/**
 * AC9 đổi trạng thái bằng select trên thẻ. Mặc định mock giống Workspace (rule "Status", CONTRACT mục 4):
 * T8 Mới → Đang xử lý; T1 Đang xử lý → Đã xử lý (rời danh sách, không có bước ngược → không Hoàn tác).
 * Ca "không có quy trình" giữ hành vi đủ 7 trạng thái + Hoàn tác.
 */
test.describe('AC9 đổi trạng thái trên thẻ — quy trình Workspace', () => {
  test('AC9 đổi Mới → Đang xử lý → lưu server (chỉ status), vẫn ở danh sách "chưa xong"', async ({ app, mock, page }) => {
    await app.openReady();
    expect(await selectedOptionLabel(app.inItem(T.T8, 'task-status'))).toContain('Mới');
    await chooseOption(page, app.inItem(T.T8, 'task-status'), 'Đang xử lý');
    await expect(app.item(T.T8)).toHaveAttribute('data-status', 'in_progress');
    await expect.poll(() => mock.task(T.T8)?.status).toBe('in_progress');
    const data = mock.updates(T.T8).at(-1)!.body.data;
    expect(data).toMatchObject({ id: T.T8, status: 'in_progress' });
    for (const k of Object.keys(data)) expect(['id', 'object_type', 'workspace_id', 'status']).toContain(k);
    await page.waitForTimeout(1000);
    await expect(app.item(T.T8)).toBeVisible();
    expect(mock.violations).toEqual([]);
  });

  test('AC9 đổi Đang xử lý → Đã xử lý → rời danh sách sau ~600ms + toast (không có Hoàn tác vì không có bước ngược)', async ({ app, mock, page }) => {
    await app.openReady();
    await chooseOption(page, app.inItem(T.T1, 'task-status'), 'Đã xử lý');
    await expect.poll(() => mock.task(T.T1)?.status).toBe('resolved');
    await expect(app.item(T.T1)).toBeHidden({ timeout: 3000 });
    await expect(app.toast()).toBeVisible();
    await page.waitForTimeout(300);
    await expect(app.tid('toast-undo')).toHaveCount(0);
    expect(mock.updates(T.T1)).toHaveLength(1);
    expect(mock.violations).toEqual([]);
  });

  test('AC9 lỗi lưu (r ≠ 0) → hiện msg, thẻ không giữ trạng thái chưa lưu', async ({ app, mock, page, guard }) => {
    guard.allow(/console\.error/);
    await app.openReady();
    mock.failNext((r) => r.kind === 'update', { status: 200, body: { r: 4031, msg: 'Không có quyền sửa (giả lập E2E)' } });
    await chooseOption(page, app.inItem(T.T8, 'task-status'), 'Đang xử lý');
    await expect(page.getByText('Không có quyền sửa (giả lập E2E)').first()).toBeVisible();
    await expect(app.item(T.T8)).toHaveAttribute('data-status', 'new');
    expect(mock.task(T.T8)?.status).toBe('new');
  });
});

test.describe('AC9 đổi trạng thái trên thẻ — Workspace không có quy trình', () => {
  test.use({ transitionRule: 'none' });

  test('AC9 select trạng thái có đủ 7 lựa chọn theo thứ tự contract', async ({ app, page }) => {
    await app.openReady();
    expect(await optionLabels(page, app.inItem(T.T8, 'task-status'))).toEqual(STATUSES.map((s) => s.label));
    expect(await selectedOptionLabel(app.inItem(T.T8, 'task-status'))).toContain('Mới');
  });

  test('AC9 đổi sang trạng thái mở khác → lưu server, vẫn ở danh sách "chưa xong"', async ({ app, mock, page }) => {
    await app.openReady();
    await chooseOption(page, app.inItem(T.T8, 'task-status'), 'Đang chờ');
    await expect(app.item(T.T8)).toHaveAttribute('data-status', 'pending');
    await expect.poll(() => mock.task(T.T8)?.status).toBe('pending');
    const data = mock.updates(T.T8).at(-1)!.body.data;
    expect(data).toMatchObject({ id: T.T8, status: 'pending' });
    for (const k of Object.keys(data)) expect(['id', 'object_type', 'workspace_id', 'status']).toContain(k);
    await page.waitForTimeout(1000);
    await expect(app.item(T.T8)).toBeVisible();
    expect(mock.violations).toEqual([]);
  });

  test('AC9 đổi sang trạng thái xong → rời danh sách sau ~600ms + toast Hoàn tác', async ({ app, mock, page }) => {
    await app.openReady();
    await chooseOption(page, app.inItem(T.T8, 'task-status'), 'Đã đóng');
    await expect.poll(() => mock.task(T.T8)?.status).toBe('closed');
    await expect(app.item(T.T8)).toBeHidden({ timeout: 3000 });
    await expect(app.toast()).toBeVisible();
    await app.tid('toast-undo').click();
    await expect(app.item(T.T8)).toBeVisible();
    await expect.poll(() => mock.task(T.T8)?.status).toBe('new');
  });
});
