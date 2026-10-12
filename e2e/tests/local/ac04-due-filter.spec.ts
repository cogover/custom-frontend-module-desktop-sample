import { test, expect } from '../../support/local/fixtures';
import { ASSIGNEE_OPEN, P, T } from '../../support/local/dataset';
import type { MockTask } from '../../support/local/mock-api';
import { vn } from '../../support/model';
import { ALL_ROLES, expectSelected } from '../../support/ui';

// "Bây giờ" = 01/10/2026 10:00 (UTC+7), trình duyệt ở Asia/Ho_Chi_Minh.
test.describe('AC4 lọc hạn theo UTC+7', () => {
  test('AC4 Quá hạn = hạn < bây giờ và chưa xong (kể cả ở bộ lọc Tất cả)', async ({ app }) => {
    await app.openReady();
    await app.due('overdue');
    await expectSelected(app.tid('due-filter-overdue'));
    await app.expectIds([T.T3, T.T7, T.T8]);
    await app.quick('all');
    await app.expectIds([T.T3, T.T7, T.T8], { timeout: 8000 });
  });

  test('AC4 Hôm nay / Ngày mai theo ngày VN (biên 23:30 và 00:30)', async ({ app }) => {
    await app.openReady();
    await app.due('today');
    await app.expectIds([T.T1, T.T8]);
    await app.due('tomorrow');
    await app.expectIds([T.T4]);
    await app.due('all');
    await app.expectIds(ASSIGNEE_OPEN);
  });

  test('AC4 Tháng này (tháng 10/2026 theo VN)', async ({ app }) => {
    await app.openReady();
    await app.setRoles(ALL_ROLES);
    await app.due('month');
    await app.expectIds([T.T1, T.T2, T.T4, T.T5, T.T8]);
  });

  test('AC4 khoảng tuỳ chọn từ–đến bao gồm hai đầu, theo ngày VN', async ({ app }) => {
    await app.openReady();
    await app.setRoles(ALL_ROLES);
    // Date Picker (contract 3a): chỉ chọn được ngày, không xoá → đi từ "chỉ có từ" tới khoảng đủ hai đầu.
    await app.dueRange('2026-11-01');
    await app.expectIds([T.T6]);
    await app.dueRange('2026-10-02', '2026-10-06');
    await app.expectIds([T.T4, T.T2]);
    await expect(app.tid('due-from')).toContainText('02/10/2026');
    await expect(app.tid('due-to')).toContainText('06/10/2026');
    await app.dueRange('2026-10-01', '2026-10-01');
    await app.expectIds([T.T1, T.T8]);
  });

  test('AC4 khoảng tuỳ chọn chỉ có "đến" (lịch lùi về tháng trước)', async ({ app }) => {
    await app.openReady();
    await app.setRoles(ALL_ROLES);
    await app.dueRange(undefined, '2026-09-30');
    await app.expectIds([T.T3, T.T7]);
  });

  test('AC4 lịch: tiếng Việt, tuần bắt đầu Thứ Hai, nút hiển thị dd/MM/yyyy', async ({ app, page }) => {
    await app.openReady();
    await app.due('custom');
    await app.tid('due-from').click();
    const cal = app.calendar();
    await expect(cal).toBeVisible();
    const head = await cal.evaluate((root) => {
      const grid = root.querySelector('[role="grid"], table');
      const th = grid ? [...grid.querySelectorAll('thead th, [role="columnheader"]')] : [];
      return th.map((e) => ((e.getAttribute('aria-label') || e.textContent) ?? '').trim());
    });
    expect(head.length, 'có hàng tiêu đề thứ').toBe(7);
    expect(head[0], 'tuần bắt đầu Thứ Hai').toMatch(/thứ hai|^T2$|^th 2$|^2$/i);
    expect(head[6]).toMatch(/chủ nhật|^CN$/i);
    await expect(cal, 'tên tháng tiếng Việt').toContainText(/tháng/i);
    await page.keyboard.press('Escape');
    await expect(cal).toBeHidden();
    await app.pickDate(app.tid('due-from'), '2026-10-05');
    await expect(app.tid('due-from')).toContainText('05/10/2026');
  });

  test('AC4 nhãn hạn trên thẻ: Quá hạn N ngày / Hôm nay / Ngày mai / D thg M[, YYYY]', async ({ app }) => {
    await app.openReady();
    await app.setRoles(ALL_ROLES);
    await expect(app.inItem(T.T3, 'task-due')).toContainText('Quá hạn 1 ngày');
    await expect(app.inItem(T.T7, 'task-due')).toContainText('Quá hạn 3 ngày');
    await expect(app.inItem(T.T1, 'task-due')).toContainText('Hôm nay');
    await expect(app.inItem(T.T4, 'task-due')).toContainText('Ngày mai');
    await expect(app.inItem(T.T2, 'task-due')).toContainText('6 thg 10');
    await expect(app.inItem(T.T2, 'task-due')).not.toContainText('2026');
    await expect(app.inItem(T.T6, 'task-due')).toContainText('12 thg 1, 2027');
    await app.quick('done');
    await expect(app.inItem(T.D2, 'task-due')).toContainText('29 thg 9');
    await expect(app.inItem(T.D2, 'task-due'), 'việc đã xong không hiện quá hạn').not.toContainText('Quá hạn');
  });

  test('AC4 popup hiện cả giờ hạn chót', async ({ app }) => {
    await app.openReady();
    // Task sửa được (3d, 2026-10-03): hạn chót là Date Picker (dd/MM/yyyy) + Select giờ, chip theo UTC+7.
    await app.openTask(T.T3);
    await expect(app.tid('view-due-date')).toContainText('30/09/2026');
    await expect(app.tid('view-due-time')).toContainText('17:00');
    await expect(app.view()).toContainText('Quá hạn 1 ngày');
    await app.page.keyboard.press('Escape');
    await app.openTask(T.T4);
    await expect(app.tid('view-due-date'), 'biên 00:30 ngày 02/10 theo VN').toContainText('02/10/2026');
    await expect(app.tid('view-due-time')).toContainText('00:30');
    await app.page.keyboard.press('Escape');
    // Task chỉ theo dõi hiển thị tĩnh như cũ (contract "Chế độ xem"): "<thứ>, dd/MM/yyyy HH:mm".
    await app.setRoles(['cc']);
    await app.openTask(T.T5);
    await expect(app.view(), '25/10/2026 là Chủ nhật').toContainText('CN, 25/10/2026 17:00');
  });
});

/**
 * Trình duyệt ở Los Angeles: 02/10 06:00 VN = 01/10 16:00 PDT.
 * Tính theo giờ máy sẽ ra sai ngày; contract yêu cầu mọi phép tính theo UTC+7.
 */
test.describe('AC4 vẫn theo UTC+7 khi trình duyệt ở múi giờ khác', () => {
  test.use({ timezoneId: 'America/Los_Angeles', now: vn(2026, 10, 2, 6, 0) });

  const mk = (id: string, subject: string, due: number): MockTask => ({
    id,
    name: `TAS-${id.slice(-4)}`,
    subject,
    description: '',
    due_date: due,
    priority: 'medium',
    status: 'new',
    reporter: P.ME,
    assignee: P.ME,
    ccs: [],
    created: vn(2026, 9, 1, 9),
    updated: vn(2026, 9, 1, 9),
  });

  test('AC4 Hôm nay/Ngày mai, nhãn thẻ và giá trị form tính theo UTC+7', async ({ app, mock }) => {
    mock.setTasks([
      mk('TASTZ00000000A', 'Hạn chiều nay giờ VN', vn(2026, 10, 2, 17, 0)),
      mk('TASTZ00000000B', 'Hạn sáng mai giờ VN', vn(2026, 10, 3, 10, 0)),
      mk('TASTZ00000000C', 'Quá hạn sáng nay giờ VN', vn(2026, 10, 2, 5, 0)),
    ]);
    await app.openReady();
    await expect(app.inItem('TASTZ00000000A', 'task-due')).toContainText('Hôm nay');
    await expect(app.inItem('TASTZ00000000B', 'task-due')).toContainText('Ngày mai');
    await app.due('today');
    await app.expectIds(['TASTZ00000000A', 'TASTZ00000000C']);
    await app.due('tomorrow');
    await app.expectIds(['TASTZ00000000B']);
    await app.due('overdue');
    await app.expectIds(['TASTZ00000000C']);
    await app.dueRange('2026-10-02', '2026-10-02');
    await app.expectIds(['TASTZ00000000A', 'TASTZ00000000C']);

    await app.openCreate();
    await expect(app.tid('field-due-date'), 'hôm nay theo VN (06:00 < 17:00)').toContainText('02/10/2026');
    await expect(app.tid('field-due-time')).toContainText('17:00');
    await app.tid('field-title').fill('Tạo khi máy ở múi giờ khác');
    await app.pickDate(app.tid('field-due-date'), '2026-10-03');
    await app.pickTime(app.tid('field-due-time'), '09:30');
    await app.tid('form-submit').click();
    await expect.poll(() => mock.creates().length).toBe(1);
    expect(mock.creates()[0].body.data.due_date, 'due_date = 03/10/2026 09:30 UTC+7').toBe(vn(2026, 10, 3, 9, 30));
  });
});
