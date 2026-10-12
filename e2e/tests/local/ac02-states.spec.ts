import { test, expect } from '../../support/local/fixtures';
import { ASSIGNEE_OPEN, T } from '../../support/local/dataset';
import type { RecordedRequest } from '../../support/local/mock-api';

const isOpenList = (r: RecordedRequest) =>
  r.kind === 'list' &&
  r.body?.object_slug === 'task' &&
  (r.body.filters ?? []).some((f: any) => f.field === 'status' && Array.isArray(f.params) && f.params.includes('new'));
const isAnyList = (r: RecordedRequest) => r.kind === 'list';

test.describe('AC2 trạng thái tải / rỗng / lỗi / phiên hết hạn', () => {
  test('AC2 hiện loading khi đang tải rồi hiện danh sách', async ({ app, mock }) => {
    const gate = mock.hold(isOpenList);
    await app.open();
    await expect(app.tid('app-loading')).toBeVisible();
    await expect(app.items()).toHaveCount(0);
    gate.release();
    await app.ready();
    await app.expectIds(ASSIGNEE_OPEN);
  });

  test('AC2 lỗi API (r ≠ 0) → app-error hiện msg + Thử lại tải lại thành công', async ({ app, mock, guard }) => {
    guard.allow(/console\.error/);
    mock.failNext(isOpenList, { status: 200, body: { r: 500, msg: 'Lỗi giả lập máy chủ E2E' } });
    await app.open();
    await expect(app.tid('app-error')).toBeVisible();
    await expect(app.tid('app-error')).toContainText('Lỗi giả lập máy chủ E2E');
    await app.tid('app-retry').click();
    await app.ready();
    await expect(app.tid('app-error')).toBeHidden();
    await app.expectIds(ASSIGNEE_OPEN);
  });

  test('AC2 lỗi HTTP 500 → app-error + Thử lại', async ({ app, mock, guard }) => {
    guard.allow(/HTTP 500/, /console\.error/);
    mock.failNext(isOpenList, { status: 500, body: { r: 500, msg: 'Internal Server Error' } });
    await app.open();
    await expect(app.tid('app-error')).toBeVisible();
    await expect(app.tid('app-retry')).toBeVisible();
    await app.tid('app-retry').click();
    await app.ready();
    await app.expectIds(ASSIGNEE_OPEN);
  });

  for (const status of [401, 403]) {
    test(`AC2 HTTP ${status} → session-expired + link đăng nhập lại mở /`, async ({ app, mock, guard, page }) => {
      guard.allow(new RegExp(`HTTP ${status}`), /console\.error/);
      mock.failNext(isAnyList, { status, body: { r: status, msg: 'Unauthorized' } }, 20);
      await app.open();
      const box = app.tid('session-expired');
      await expect(box).toBeVisible();
      await expect(box).toContainText(/phiên đăng nhập đã hết hạn/i);
      const link = box.getByRole('link').first();
      await expect(link).toBeVisible();
      const href = await link.getAttribute('href');
      expect(new URL(href ?? '', page.url()).pathname, 'link đăng nhập lại phải mở "/"').toBe('/');
      await expect(app.tid('app-error')).toBeHidden();
    });
  }

  test('AC2 401 khi đang thao tác ghi → session-expired', async ({ app, mock, guard }) => {
    guard.allow(/HTTP 401/, /console\.error/);
    await app.openReady();
    mock.failNext((r) => r.kind === 'update', { status: 401, body: { r: 401, msg: 'Unauthorized' } }, 5);
    // T1 Đang xử lý → tick hợp lệ theo quy trình.
    await app.inItem(T.T1, 'task-checkbox').click();
    await expect(app.tid('session-expired')).toBeVisible();
  });

  test('AC2 rỗng khi không có việc nào (không có nút Đặt lại bộ lọc)', async ({ app, mock }) => {
    mock.setTasks([]);
    await app.openReady();
    await expect(app.tid('empty-state')).toBeVisible();
    await expect(app.tid('empty-reset')).toBeHidden();
    await app.expectCounts({ open: 0, all: 0, done: 0 });
  });

  test('AC2 rỗng khi đang lọc → có "Đặt lại bộ lọc", bấm thì hiện lại việc', async ({ app }) => {
    await app.openReady();
    // Không có việc "Giao cho tôi" nào hạn 10–20/10/2026.
    await app.dueRange('2026-10-10', '2026-10-20');
    await expect(app.tid('empty-state')).toBeVisible();
    await expect(app.tid('empty-reset')).toBeVisible();
    await expect(app.tid('empty-reset')).toHaveText(/đặt lại bộ lọc/i);
    await app.tid('empty-reset').click();
    await expect(app.tid('empty-state')).toBeHidden();
    await expect(app.items().first()).toBeVisible();
  });
});
