import { test, expect } from '../../support/local/fixtures';
import { P } from '../../support/local/dataset';
import type { TaskApp } from '../../support/ui';

/**
 * AC45 / review 2026-10-12: bấm chip người trên thanh tiêu đề danh sách (`person-chip`) mở hộp `person-filter` với ba ô tick
 * `person-rel-reporter` / `person-rel-assignee` / `person-rel-cc` (tick nhiều, nhiều người): danh sách chỉ còn việc khớp
 * một trong các ô đã tick; chip đang lọc có `data-on`; các chip giữ nguyên (tính trước khi lọc người); "Bỏ lọc người này"
 * hoặc bỏ hết tick → hết lọc. Không gọi thêm API.
 */

const chip = (app: TaskApp, personId: string) => app.page.locator(`[data-testid="person-chip"][data-person-id="${personId}"]`);

test('AC45 lọc theo người giao / được giao / theo dõi qua chip; nhiều ô tick, bỏ lọc', async ({ app, mock, page }) => {
  await app.openReady();
  const all = await app.visibleIds();
  const tasks = all.map((id) => mock.task(id)!);
  const expected = (pred: (t: (typeof tasks)[number]) => boolean) => tasks.filter(pred).map((t) => t.id);
  const chipsBefore = await app.page.getByTestId('person-chip').allTextContents();
  const lists = mock.taskLists().length;

  await chip(app, P.LAN).click();
  await expect(app.tid('person-filter')).toBeVisible();
  await app.tid('person-rel-reporter').click();
  await app.expectIds(expected((t) => t.reporter === P.LAN), { ordered: true });
  await expect(chip(app, P.LAN)).toHaveAttribute('data-on', 'true');
  expect(await app.page.getByTestId('person-chip').allTextContents(), 'chip giữ nguyên khi đang lọc').toEqual(chipsBefore);

  await app.tid('person-rel-assignee').click();
  await app.tid('person-rel-cc').click();
  await expect(chip(app, P.LAN)).toHaveAttribute('data-rels', 'reporter assignee cc');
  await app.expectIds(expected((t) => t.reporter === P.LAN || t.assignee === P.LAN || (t.ccs ?? []).includes(P.LAN)), { ordered: true });

  await app.tid('person-filter-clear').click();
  await expect(app.tid('person-filter')).toHaveCount(0);
  await expect(chip(app, P.LAN)).not.toHaveAttribute('data-on', 'true');
  await app.expectIds(all, { ordered: true });
  expect(mock.taskLists().length, 'lọc tại chỗ, không gọi API').toBe(lists);
  expect(mock.violations).toEqual([]);
  await page.keyboard.press('Escape');
});
