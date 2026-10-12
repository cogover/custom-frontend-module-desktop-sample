import type { Locator } from '@playwright/test';
import { test, expect } from '../../support/local/fixtures';
import { NAME, P, T } from '../../support/local/dataset';
import { vn } from '../../support/model';
import type { MockTask } from '../../support/local/mock-api';
import { ALL_ROLES } from '../../support/ui';

/**
 * AC40 / CONTRACT mục 5 "Người", điểm 5, mục 6 (2026-10-04): thẻ việc không còn nút xoá; cột Người giao / Giao cho
 * chỉ avatar (tên ở tên truy cập + Hover Card), Ưu tiên chỉ cờ (nhãn ẩn), Hạn chót tối đa 2 dòng trong cột 84px;
 * dòng meta xuống hàng (container ≤ 980px) → nhãn vai trò + tên, nhãn ưu tiên, hạn một dòng.
 */

/** Việc giao cho không ai (để kiểm ô "Giao cho" trống). */
const UNASSIGNED: MockTask = {
  id: 'TASMOCKNOBODY1',
  name: 'TAS-1099',
  subject: 'Việc chưa giao cho ai',
  description: '',
  due_date: vn(2026, 10, 3, 17, 0),
  priority: 'low',
  status: 'new',
  reporter: P.ME,
  assignee: null,
  ccs: [],
  created: vn(2026, 9, 29, 9, 0),
  updated: vn(2026, 9, 29, 9, 0),
};

/** Số dòng chữ đang hiển thị của một khối (theo chiều cao / line-height). */
const lines = (l: Locator) =>
  l.evaluate((el) => {
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
    return Math.round(el.getBoundingClientRect().height / lh);
  });

/** Chữ đang hiển thị trong ô, bỏ chữ cái của avatar (avatar chữ cái là hình, không phải nhãn). */
const visibleText = (l: Locator) =>
  l.evaluate((root) => {
    const out: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement!;
      if (!n.textContent?.trim() || el.closest('.avatar') || el.getClientRects().length === 0) continue;
      if (getComputedStyle(el).visibility === 'hidden') continue;
      out.push(n.textContent.trim());
    }
    return out.join(' ');
  });

/** Hover Card mở ngay khi rê chuột (openDelay 0): đo thời gian từ lúc rê tới lúc card hiện. */
async function hoverOpensFast(target: Locator, card: Locator) {
  await target.hover();
  const t0 = Date.now();
  await expect(card).toBeVisible({ timeout: 2000 });
  return Date.now() - t0;
}

test.describe('AC40 thẻ việc 1440×900 (bố cục cột)', () => {
  test('AC40 không có nút xoá; Người giao / Giao cho chỉ avatar, tên ở tên truy cập; Ưu tiên chỉ cờ "Ưu tiên: <nhãn>"; không còn title gốc', async ({ app, page }) => {
    await app.openReady();
    await expect(page.getByTestId('task-delete')).toHaveCount(0);
    await app.item(T.T1).hover();
    await expect(app.item(T.T1).getByRole('button', { name: /xoá/i })).toHaveCount(0);

    const reporter = app.inItem(T.T1, 'task-reporter');
    const assignee = app.inItem(T.T1, 'task-assignee');
    const prio = app.inItem(T.T1, 'task-priority');
    await expect(reporter).toHaveAccessibleName(`Người giao: ${NAME[P.LAN]}`);
    await expect(assignee).toHaveAccessibleName(`Giao cho: ${NAME[P.ME]}`);
    await expect(prio).toHaveAccessibleName('Ưu tiên: Cao');
    await expect(app.inItem(T.T7, 'task-priority')).toHaveAccessibleName('Ưu tiên: Khẩn cấp');

    for (const [what, cell] of [['Người giao', reporter], ['Giao cho', assignee], ['Ưu tiên', prio]] as const) {
      // chỉ hình: không có chữ hiển thị (tên / nhãn ẩn ở bố cục cột)
      expect(await visibleText(cell), `${what}: không có chữ hiển thị (ngoài chữ cái avatar)`).toBe('');
      // không dùng title gốc (Hover Card thay thế)
      expect(await cell.evaluate((el) => [el, ...el.querySelectorAll('*')].filter((e) => e.hasAttribute('title')).length), `${what}: không có title`).toBe(0);
    }
    await expect(reporter.locator('.avatar, img').first(), 'Người giao: có avatar').toBeVisible();
    await expect(assignee.locator('.avatar, img').first(), 'Giao cho: có avatar').toBeVisible();
    await expect(prio.locator('svg'), 'Ưu tiên: icon cờ').toBeVisible();
    // cờ có màu theo mức
    const urgentColor = await app.inItem(T.T7, 'task-priority').evaluate((el) => getComputedStyle(el).color);
    const highColor = await app.inItem(T.T1, 'task-priority').evaluate((el) => getComputedStyle(el).color);
    expect(urgentColor, 'màu cờ theo mức ưu tiên').not.toBe(highColor);
    // cột Giao cho = assignee (khác người giao): việc tôi giao cho Minh
    await app.setRoles(ALL_ROLES);
    await expect(app.inItem(T.T2, 'task-reporter')).toHaveAccessibleName(`Người giao: ${NAME[P.ME]}`);
    await expect(app.inItem(T.T2, 'task-assignee')).toHaveAccessibleName(`Giao cho: ${NAME[P.MINH]}`);
  });

  test('AC40 rê chuột lên Người giao / Giao cho / Ưu tiên → Hover Card hiện ngay (avatar + họ tên + vai trò; "Mức ưu tiên" + nhãn)', async ({ app, page }) => {
    await app.openReady();
    const repCard = page.getByTestId('task-reporter-card');
    const asgCard = page.getByTestId('task-assignee-card');
    const prioCard = page.getByTestId('task-priority-card');

    const t1 = await hoverOpensFast(app.inItem(T.T1, 'task-reporter'), repCard);
    expect(t1, 'Hover Card người giao mở ngay (không chờ)').toBeLessThan(500);
    await expect(repCard).toContainText(NAME[P.LAN]);
    await expect(repCard).toContainText('Người giao');
    await expect(repCard.locator('.avatar, img').first()).toBeVisible();

    const t2 = await hoverOpensFast(app.inItem(T.T1, 'task-assignee'), asgCard);
    expect(t2).toBeLessThan(500);
    await expect(asgCard).toContainText(NAME[P.ME]);
    await expect(asgCard).toContainText('Giao cho');
    await expect(repCard, 'rời ô người giao thì card cũ đóng').toBeHidden();

    const t3 = await hoverOpensFast(app.inItem(T.T1, 'task-priority'), prioCard);
    expect(t3).toBeLessThan(500);
    await expect(prioCard).toContainText('Mức ưu tiên');
    await expect(prioCard).toContainText('Cao');

    // rời hẳn thẻ → card đóng (closeDelay 100ms)
    await page.mouse.move(5, 5);
    await expect(prioCard).toBeHidden();
  });

  test('AC40 ô Giao cho trống: "Chưa giao cho ai" (tên truy cập + Hover Card), gạch "—"', async ({ app, mock, page }) => {
    mock.addTasks(UNASSIGNED);
    await app.openReady();
    await app.setRoles(['reporter']);
    const cell = app.inItem(UNASSIGNED.id, 'task-assignee');
    await expect(cell).toHaveAccessibleName('Chưa giao cho ai');
    await expect(cell).toHaveText('—', { useInnerText: true });
    await cell.hover();
    await expect(page.getByTestId('task-assignee-card')).toBeVisible();
    await expect(page.getByTestId('task-assignee-card')).toHaveText('Chưa giao cho ai');
  });

  test('AC40 Hạn chót tối đa 2 dòng trong cột hẹp; "Quá hạn hôm nay" xuống 2 dòng; cột meta đúng thứ tự Trạng thái · Người giao · Giao cho · Ưu tiên · Hạn chót', async ({ app }) => {
    await app.openReady();
    const due8 = app.inItem(T.T8, 'task-due');
    await expect(due8).toContainText(/Quá hạn\s*hôm nay/i);
    const text8 = app.item(T.T8).locator('[data-testid="task-due"] .due-text');
    expect(await lines(text8), '"Quá hạn hôm nay" chiếm 2 dòng').toBe(2);
    expect((await due8.boundingBox())!.width, 'cột hạn chót hẹp (≤ 84px)').toBeLessThanOrEqual(84.5);
    for (const id of await app.visibleIds()) {
      const t = app.item(id).locator('[data-testid="task-due"] .due-text');
      expect(await lines(t), `hạn chót của ${id} tối đa 2 dòng`).toBeLessThanOrEqual(2);
    }
    // thứ tự cột (trái → phải) trên cùng một hàng
    const xs = await Promise.all(
      ['task-status', 'task-reporter', 'task-assignee', 'task-priority', 'task-due'].map(async (tid) => (await app.inItem(T.T1, tid).boundingBox())!.x),
    );
    expect([...xs].sort((a, b) => a - b), 'thứ tự cột meta').toEqual(xs);
  });
});

test.describe('AC40 thẻ việc khi dòng meta xuống hàng (cột nội dung ≤ 980px)', () => {
  test.use({ viewport: { width: 1100, height: 900 } });

  test('AC40 ≤980px: nhãn vai trò + tên ở Người giao / Giao cho, nhãn ưu tiên hiện, hạn chót một dòng', async ({ app, page }) => {
    await app.openReady();
    const contentWidth = await page.locator('.content').first().evaluate((el) => el.getBoundingClientRect().width);
    expect(contentWidth, 'cột nội dung ≤ 980px để dòng meta xuống hàng').toBeLessThanOrEqual(980);

    const reporter = app.inItem(T.T1, 'task-reporter');
    const assignee = app.inItem(T.T1, 'task-assignee');
    await expect(reporter).toContainText('Người giao', { useInnerText: true });
    await expect(reporter).toContainText(NAME[P.LAN], { useInnerText: true });
    await expect(assignee).toContainText('Giao cho', { useInnerText: true });
    await expect(assignee).toContainText(NAME[P.ME], { useInnerText: true });
    await expect(app.inItem(T.T1, 'task-priority')).toHaveText('Cao', { useInnerText: true });
    const due = app.item(T.T8).locator('[data-testid="task-due"]');
    const h = (await due.boundingBox())!.height;
    const lh = await due.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight) || 20);
    expect(h, 'hạn chót một dòng khi xuống hàng').toBeLessThan(lh * 1.8);
    // vẫn không có title, vẫn có hover card
    await reporter.hover();
    await expect(page.getByTestId('task-reporter-card')).toBeVisible();
  });
});
