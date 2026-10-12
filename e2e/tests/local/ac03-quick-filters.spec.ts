import { test, expect } from '../../support/local/fixtures';
import { ASSIGNEE_DONE, ASSIGNEE_OPEN, DONE_IDS, OPEN_IDS, REPORTER_DONE, REPORTER_OPEN, T } from '../../support/local/dataset';
import { isDoneStatus, QUICK_TITLE } from '../../support/model';
import { expectSelected } from '../../support/ui';

test.describe('AC3 bộ lọc nhanh + số đếm', () => {
  test('AC3 số đếm đúng (vai trò mặc định) và tiêu đề danh sách đổi theo bộ lọc nhanh', async ({ app }) => {
    await app.openReady();
    // Mặc định chỉ "Giao cho tôi": mở 6, đã xong 2.
    await app.expectCounts({ open: 6, done: 2, all: 8 });
    await expect(app.tid('list-title')).toHaveText(QUICK_TITLE.open);

    await app.quick('all');
    await expect(app.tid('list-title')).toHaveText(QUICK_TITLE.all);
    await expectSelected(app.tid('quick-all'));
    await expectSelected(app.tid('quick-open'), false);
    await app.expectIds([...ASSIGNEE_OPEN, ...ASSIGNEE_DONE], { timeout: 8000 });
    await expect(app.tid('list-count')).toContainText('8');

    await app.quick('done');
    await expect(app.tid('list-title')).toHaveText(QUICK_TITLE.done);
    await app.expectIds(ASSIGNEE_DONE);
    for (const s of await app.items().evaluateAll((els) => els.map((e) => e.getAttribute('data-status') ?? ''))) {
      expect(isDoneStatus(s), `data-status "${s}" phải thuộc nhóm xong`).toBe(true);
    }
    await expect(app.tid('done-progress')).toContainText('2/2');

    await app.quick('open');
    await expect(app.tid('list-title')).toHaveText(QUICK_TITLE.open);
    await app.expectIds(ASSIGNEE_OPEN);
  });

  test('AC3 số đếm tính theo vai trò đang tick, không theo lọc hạn/tìm kiếm', async ({ app }) => {
    await app.openReady();
    await app.toggleRole('reporter');
    const open2 = new Set([...ASSIGNEE_OPEN, ...REPORTER_OPEN]).size;
    const done2 = new Set([...ASSIGNEE_DONE, ...REPORTER_DONE]).size;
    await app.expectCounts({ open: open2, done: done2, all: open2 + done2 });
    await app.toggleRole('cc');
    await app.expectCounts({ open: OPEN_IDS.length, done: DONE_IDS.length, all: OPEN_IDS.length + DONE_IDS.length });
    await app.setRoles(['reporter']);
    await app.expectCounts({ open: REPORTER_OPEN.length, done: REPORTER_DONE.length, all: REPORTER_OPEN.length + REPORTER_DONE.length });

    // Lọc hạn và tìm kiếm không đổi số đếm.
    await app.due('overdue');
    await app.search('không khớp gì');
    await app.expectCounts({ open: REPORTER_OPEN.length, done: REPORTER_DONE.length });
  });

  test('AC3 số đếm cập nhật sau khi tick xong một việc', async ({ app }) => {
    await app.openReady();
    // T1 Đang xử lý → tick hợp lệ theo quy trình (in_progress → resolved).
    await app.inItem(T.T1, 'task-checkbox').click();
    await app.expectCounts({ open: 5, done: 3, all: 8 });
  });
});
