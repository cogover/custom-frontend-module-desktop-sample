import { test, expect } from '../../support/local/fixtures';
import { T } from '../../support/local/dataset';
import { WORKSPACE_STATUS_FLOWS } from '../../support/local/mock-api';
import { hasStrike, isChecked } from '../../support/ui';

const WRITE_ENVELOPE = ['id', 'object_type', 'workspace_id'];

/**
 * AC8 tick hoàn thành (+ AC26 "Quy trình trạng thái", CONTRACT mục 4):
 *  - Mặc định mock giống Workspace (rule "Status"): tick hợp lệ in_progress → resolved; không có bước ngược → toast không có Hoàn tác.
 *  - Rule có bước ngược (resolved → in_progress): Hoàn tác / bỏ tick về trạng thái trước được.
 *  - Không có rule (Workspace không cấu hình / không đọc được): hành vi tự do như contract gốc (Hoàn tác, bỏ tick → trước/new).
 */

test.describe('AC8 tick hoàn thành — quy trình Workspace', () => {
  test('AC8 tick in_progress → resolved: gạch ngang, rời "chưa xong" sau ~600ms, server resolved; không có bước ngược → toast không có Hoàn tác', async ({ app, mock, page }) => {
    await app.openReady();
    const item = app.item(T.T1);
    expect(await hasStrike(app.inItem(T.T1, 'task-title'))).toBe(false);

    const t0 = Date.now();
    await app.inItem(T.T1, 'task-checkbox').click();
    await expect(item).toHaveAttribute('data-status', 'resolved', { timeout: 1000 });
    expect(await isChecked(app.inItem(T.T1, 'task-checkbox')), 'checkbox phải được tick').toBe(true);
    await expect.poll(() => hasStrike(app.inItem(T.T1, 'task-title')), { timeout: 1000, message: 'tiêu đề gạch ngang' }).toBe(true);
    await expect(item).toBeHidden({ timeout: 3000 });
    expect(Date.now() - t0, 'thẻ phải ở lại ~600ms trước khi rời bộ lọc').toBeGreaterThanOrEqual(450);

    await expect.poll(() => mock.task(T.T1)?.status).toBe('resolved');
    const upd = mock.updates(T.T1).at(-1)!;
    expect(upd.body.data.status).toBe('resolved');
    for (const k of Object.keys(upd.body.data)) expect([...WRITE_ENVELOPE, 'status'], `field ghi "${k}"`).toContain(k);

    await expect(app.toast()).toBeVisible();
    await expect(app.toast()).toContainText('Viết nội dung cho 4 màn hình onboarding');
    await page.waitForTimeout(300);
    await expect(app.tid('toast-undo'), 'resolved → in_progress không có trong quy trình → không có Hoàn tác').toHaveCount(0);
    expect(mock.updates(T.T1)).toHaveLength(1);
    expect(mock.violations).toEqual([]);
  });

  test('AC8 checkbox được tick khi trạng thái thuộc nhóm xong', async ({ app }) => {
    await app.openReady();
    await app.quick('done');
    const cb = app.inItem(T.D1, 'task-checkbox');
    await expect(cb).toBeVisible();
    expect(await isChecked(cb)).toBe(true);
    await app.quick('open');
    expect(await isChecked(app.inItem(T.T1, 'task-checkbox')), 'việc mở không được tick').toBe(false);
    // Thẻ đã xong gạch ngang ở "Tất cả"; trong "Đã xong" hiển thị như thẻ thường (ac03-done-look.spec.ts).
    await app.quick('all');
    expect(await isChecked(app.inItem(T.D1, 'task-checkbox'))).toBe(true);
    expect(await hasStrike(app.inItem(T.D1, 'task-title'))).toBe(true);
  });

  test('AC8 tick ở bộ lọc "Tất cả" thì việc vẫn ở lại danh sách', async ({ app, mock }) => {
    await app.openReady();
    await app.quick('all');
    await expect(app.item(T.D1)).toBeVisible();
    await app.inItem(T.T1, 'task-checkbox').click();
    await expect(app.item(T.T1)).toHaveAttribute('data-status', 'resolved');
    await app.page.waitForTimeout(1200);
    await expect(app.item(T.T1)).toBeVisible();
    await expect.poll(() => mock.task(T.T1)?.status).toBe('resolved');
  });
});

test.describe('AC8 tick hoàn thành — quy trình có bước ngược (resolved → in_progress)', () => {
  test('AC8 tick rồi Hoàn tác: toast có Hoàn tác vì bước ngược được phép, khôi phục cả server; bỏ tick → trạng thái trước', async ({ app, mock }) => {
    mock.statusFlows = [...WORKSPACE_STATUS_FLOWS, { from: 'resolved', to: 'in_progress' }];
    await app.openReady();
    await app.inItem(T.T1, 'task-checkbox').click();
    await expect(app.item(T.T1)).toBeHidden({ timeout: 3000 });
    await expect.poll(() => mock.task(T.T1)?.status).toBe('resolved');
    await app.tid('toast-undo').click();
    await expect(app.item(T.T1)).toBeVisible();
    await expect(app.item(T.T1)).toHaveAttribute('data-status', 'in_progress');
    await expect.poll(() => mock.task(T.T1)?.status, { message: 'Hoàn tác phải khôi phục trên server' }).toBe('in_progress');

    // T7 (Đang xử lý): tick → resolved, ở "Tất cả" bỏ tick → về trạng thái trước (in_progress).
    await app.inItem(T.T7, 'task-checkbox').click();
    await expect(app.item(T.T7)).toBeHidden({ timeout: 3000 });
    await expect.poll(() => mock.task(T.T7)?.status).toBe('resolved');
    await app.quick('all');
    await expect(app.item(T.T7)).toHaveAttribute('data-status', 'resolved');
    await app.inItem(T.T7, 'task-checkbox').click();
    await expect(app.item(T.T7)).toHaveAttribute('data-status', 'in_progress');
    await expect.poll(() => mock.task(T.T7)?.status).toBe('in_progress');
    expect(mock.violations).toEqual([]);
  });
});

test.describe('AC8 tick hoàn thành — Workspace không có quy trình', () => {
  test.use({ transitionRule: 'none' });

  test('AC8 tick → resolved, gạch ngang, rời "chưa xong" sau ~600ms + toast Hoàn tác khôi phục cả server', async ({ app, mock }) => {
    await app.openReady();
    const item = app.item(T.T8);
    const t0 = Date.now();
    await app.inItem(T.T8, 'task-checkbox').click();
    await expect(item).toHaveAttribute('data-status', 'resolved', { timeout: 1000 });
    await expect.poll(() => hasStrike(app.inItem(T.T8, 'task-title')), { timeout: 1000, message: 'tiêu đề gạch ngang' }).toBe(true);
    await expect(item).toBeHidden({ timeout: 3000 });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(450);
    await expect.poll(() => mock.task(T.T8)?.status).toBe('resolved');
    await app.tid('toast-undo').click();
    await expect(item).toBeVisible();
    await expect(item).toHaveAttribute('data-status', 'new');
    await expect.poll(() => mock.task(T.T8)?.status, { message: 'Hoàn tác phải khôi phục trên server' }).toBe('new');
    expect(mock.violations).toEqual([]);
  });

  test('AC8 bỏ tick → trở về trạng thái trước đó nếu vừa đổi trong phiên', async ({ app, mock }) => {
    await app.openReady();
    await app.inItem(T.T7, 'task-checkbox').click();
    await expect(app.item(T.T7)).toBeHidden({ timeout: 3000 });
    await expect.poll(() => mock.task(T.T7)?.status).toBe('resolved');
    await app.quick('all');
    await expect(app.item(T.T7)).toHaveAttribute('data-status', 'resolved');
    await app.inItem(T.T7, 'task-checkbox').click();
    await expect(app.item(T.T7)).toHaveAttribute('data-status', 'in_progress');
    await expect.poll(() => mock.task(T.T7)?.status).toBe('in_progress');
  });

  test('AC8 bỏ tick việc đã xong từ server (không có lịch sử) → new', async ({ app, mock }) => {
    await app.openReady();
    await app.quick('done');
    await app.inItem(T.D1, 'task-checkbox').click();
    await expect.poll(() => mock.task(T.D1)?.status).toBe('new');
    await expect(app.item(T.D1)).toBeHidden({ timeout: 3000 });
    expect(mock.updates(T.D1).at(-1)!.body.data.status).toBe('new');
  });
});
