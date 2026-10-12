import { test, expect } from '../../support/local/fixtures';
import { ASSIGNEE_OPEN, T } from '../../support/local/dataset';
import { QUICK_TITLE, SORT_LABEL } from '../../support/model';
import { expectSelected, selectedOptionLabel } from '../../support/ui';

test.describe('AC19 refresh + deep-link', () => {
  test('AC19 refresh giữ bộ lọc nhanh, lọc hạn, vai trò và sắp xếp', async ({ app, page }) => {
    await app.openReady();
    await app.quick('all');
    await app.due('month');
    await app.setRoles(['reporter', 'assignee']);
    await app.sort('due', 'desc');
    // Tôi giao HOẶC giao cho tôi, hạn trong tháng 10/2026 (VN), cả mở lẫn đã xong.
    const expected = [T.T2, T.T4, T.T1, T.T8];
    await app.expectIds(expected, { ordered: true, timeout: 8000 });

    await page.reload();
    await app.ready();
    await expect(app.tid('list-title')).toHaveText(QUICK_TITLE.all);
    await expectSelected(app.tid('quick-all'));
    await expectSelected(app.tid('due-filter-month'));
    await expectSelected(app.tid('role-filter-reporter'));
    await expectSelected(app.tid('role-filter-assignee'));
    await expectSelected(app.tid('role-filter-cc'), false);
    expect(await selectedOptionLabel(app.tid('sort-by'))).toMatch(SORT_LABEL.due);
    await expectSelected(app.tid('sort-dir-desc'));
    await app.expectIds(expected, { ordered: true, timeout: 8000 });
  });

  test('AC19 deep-link #/task/<id> mở popup task đó', async ({ app }) => {
    await app.openReady(`#/task/${T.T3}`);
    await expect(app.dialog()).toBeVisible();
    await expect(app.view()).toContainText('Nghiên cứu ứng dụng đối thủ');
    await expect(app.dialog()).toContainText('TAS-1003');
  });

  test('AC19 deep-link tới việc đã xong (chưa tải) → đọc theo id rồi mở popup', async ({ app, mock }) => {
    await app.openReady(`#/task/${T.D1}`);
    await expect(app.dialog()).toBeVisible();
    await expect(app.view()).toContainText('Chuẩn hoá bảng màu và typography');
    expect(mock.readById(T.D1).length, 'phải đọc 1 record theo id').toBeGreaterThan(0);
    const r = mock.readById(T.D1)[0].body;
    expect(r.size).toBe(1);
    expect(r.fields).toContain('id');
  });

  test('AC19 deep-link id không tồn tại → trang vẫn dùng được', async ({ app, page }) => {
    await app.open('#/task/TASKHONGTONTAI1');
    await app.ready();
    await expect(app.view()).toBeHidden();
    await app.expectIds(ASSIGNEE_OPEN);
    await expect(page.getByTestId('app-error')).toBeHidden();
  });
});
