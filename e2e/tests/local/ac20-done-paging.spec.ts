import { test, expect } from '../../support/local/fixtures';
import { bulkTasks } from '../../support/local/dataset';

test.describe('AC20 đã xong tải theo trang', () => {
  test.beforeEach(({ mock }) => {
    mock.setTasks([
      ...bulkTasks(2, { prefix: 'O', status: 'in_progress' }),
      ...bulkTasks(230, { prefix: 'D', status: 'resolved' }),
    ]);
  });

  test('AC20 không tải danh sách đã xong khi đang ở "chưa xong" (chỉ đếm size 1)', async ({ app, mock }) => {
    await app.openReady();
    await app.expectCounts({ open: 2, done: 230, all: 232 });
    for (const r of mock.taskLists('done')) expect(r.body.size).toBe(1);
  });

  test('AC20 "Đã xong": trang 100, sort updated desc, "Tải thêm" tới khi hết', async ({ app, mock }) => {
    await app.openReady();
    await app.quick('done');
    await expect(app.items()).toHaveCount(100);
    await expect(app.tid('done-progress')).toContainText('100/230');
    await expect(app.tid('load-more')).toBeVisible();

    await app.tid('load-more').click();
    await expect(app.items()).toHaveCount(200);
    await expect(app.tid('done-progress')).toContainText('200/230');

    await app.tid('load-more').click();
    await expect(app.items()).toHaveCount(230);
    await expect(app.tid('done-progress')).toContainText('230/230');
    await expect(app.tid('load-more')).toBeHidden();

    const pages = mock.taskLists('done').filter((r) => r.body.size > 1);
    expect(pages).toHaveLength(3);
    expect(pages[0].body.search_after ?? []).toEqual([]);
    for (const p of pages) {
      expect(p.body.size).toBe(100);
      expect(p.body.sorts?.[0], 'sort updated desc').toEqual({ updated: { order: 'desc' } });
    }
    expect(pages[1].body.search_after, 'gửi lại nguyên văn search_after').toEqual(pages[0].response.data.search_after);
    expect(pages[2].body.search_after).toEqual(pages[1].response.data.search_after);
    expect(mock.violations).toEqual([]);

    // Thứ tự hiển thị trong "Đã xong" mặc định theo ưu tiên → kiểm tra tập hợp đầy đủ, không trùng.
    const ids = await app.visibleIds();
    expect(new Set(ids).size).toBe(230);
  });

  test('AC20 "Tất cả" cũng tải trang đã xong và có "Tải thêm"', async ({ app }) => {
    await app.openReady();
    await app.quick('all');
    await expect(app.items()).toHaveCount(102);
    await expect(app.tid('done-progress')).toContainText('100/230');
    await app.tid('load-more').click();
    await expect(app.items()).toHaveCount(202);
  });
});
