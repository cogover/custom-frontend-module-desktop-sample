import { test, expect } from '../../support/local/fixtures';
import { T } from '../../support/local/dataset';
import type { TaskApp } from '../../support/ui';

/**
 * AC44 / review 2026-10-08: cột của danh sách việc.
 *  - Cột "Mã" (TAS-xxxx, `task-code`) đầu tiên sau ô tick: link xanh `#/task/<id>`, bấm mở popup việc.
 *  - Nút `list-columns` (trước Làm mới) mở `columns-menu`: tick ẩn/hiện cột (Công việc luôn hiện), lên/xuống đổi thứ tự,
 *    "Mặc định" khôi phục; tiêu đề và thẻ đổi theo ngay.
 *  - Kéo đường giữa hai tiêu đề cột (`col-resize-<id>`) đổi độ rộng; tiêu đề và thẻ cùng cột.
 *  - Mọi thay đổi lưu localStorage `cong-viec.columns`, giữ sau khi tải lại trang.
 */

const headCols = (app: TaskApp) => app.tid('list-head').locator('[data-col]').evaluateAll((els) => els.map((e) => e.getAttribute('data-col')));
const headBox = (app: TaskApp, id: string) => app.tid('list-head').locator(`[data-col="${id}"]`).boundingBox();

test.describe('AC44 cột danh sách', () => {
  test('AC44 mặc định: Mã · Công việc · Trạng thái · Người giao · Giao cho · Ưu tiên · Hạn chót; mã TAS hiện thẳng cột', async ({ app, mock }) => {
    await app.openReady();
    expect(await headCols(app)).toEqual(['code', 'main', 'status', 'reporter', 'assignee', 'priority', 'due']);
    const code = app.inItem(T.T1, 'task-code');
    await expect(code).toHaveText(mock.task(T.T1)!.name);
    const h = (await headBox(app, 'code'))!;
    const c = (await code.boundingBox())!;
    expect(Math.abs(c.x - h.x), 'mã thẳng cột tiêu đề Mã').toBeLessThanOrEqual(1);
    // mã là link xanh tới task: bấm → mở popup việc đó
    await expect(code).toHaveAttribute('href', `#/task/${T.T1}`);
    const [color, accent] = await code.evaluate((el) => [getComputedStyle(el).color, getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()]);
    expect(color, `màu chữ = --accent (${accent})`).toBe(await code.evaluate((_, a) => {
      const probe = document.createElement('span');
      probe.style.color = a;
      document.body.append(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    }, accent));
    await code.click();
    await expect(app.dialog()).toBeVisible();
    await expect(app.view()).toContainText(mock.task(T.T1)!.subject);
  });

  test('AC44 ẩn Ưu tiên, đưa Hạn chót lên trước Trạng thái → tiêu đề + thẻ đổi; giữ sau tải lại; Mặc định khôi phục', async ({ app, page }) => {
    await app.openReady();
    await app.tid('list-columns').click();
    const menu = app.tid('columns-menu');
    await expect(menu).toBeVisible();
    await expect(menu.locator('[data-column="main"] [role="checkbox"]'), 'Công việc luôn hiện').toBeDisabled();
    await menu.locator('[data-column="priority"] [role="checkbox"]').click();
    await app.tid('column-up-due').click();
    await app.tid('column-up-due').click();
    await app.tid('column-up-due').click();
    await app.tid('column-up-due').click();
    expect(await headCols(app)).toEqual(['code', 'main', 'due', 'status', 'reporter', 'assignee']);
    await expect(app.inItem(T.T1, 'task-priority')).toBeHidden();
    const due = (await app.inItem(T.T1, 'task-due').boundingBox())!;
    const status = (await app.inItem(T.T1, 'task-status').boundingBox())!;
    expect(due.x, 'Hạn chót trước Trạng thái trên thẻ').toBeLessThan(status.x);
    await page.keyboard.press('Escape');

    await page.reload();
    await app.ready();
    expect(await headCols(app), 'giữ sau khi tải lại').toEqual(['code', 'main', 'due', 'status', 'reporter', 'assignee']);
    await app.tid('list-columns').click();
    await app.tid('columns-reset').click();
    expect(await headCols(app)).toEqual(['code', 'main', 'status', 'reporter', 'assignee', 'priority', 'due']);
    await expect(app.inItem(T.T1, 'task-priority')).toBeVisible();
  });

  test('AC44 kéo đường sau Trạng thái +40px, đường sau Công việc sang trái 30px (Trạng thái là cột kế) → lưu, thẻ thẳng cột; double-click về mặc định', async ({ app, page }) => {
    await app.openReady();
    const w0 = (await headBox(app, 'status'))!.width;
    const drag = async (id: string, dx: number) => {
      const h = (await app.tid(`col-resize-${id}`).boundingBox())!;
      const x = h.x + h.width / 2;
      const y = h.y + h.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx / 2, y, { steps: 3 });
      await page.mouse.move(x + dx, y, { steps: 3 });
      await page.mouse.up();
    };
    await drag('status', 40);
    await expect.poll(async () => Math.round((await headBox(app, 'status'))!.width)).toBe(Math.round(w0 + 40));
    await drag('main', -30); // "Công việc" co lại, Trạng thái (cột sau) rộng thêm
    await expect.poll(async () => Math.round((await headBox(app, 'status'))!.width)).toBe(Math.round(w0 + 70));
    const head = (await headBox(app, 'reporter'))!;
    const card = (await app.inItem(T.T1, 'task-reporter').boundingBox())!;
    expect(Math.abs(card.x + card.width / 2 - (head.x + head.width / 2)), 'avatar Người giao vẫn giữa cột').toBeLessThanOrEqual(1.5);
    const saved = JSON.parse((await page.evaluate(() => localStorage.getItem('cong-viec.columns'))) ?? 'null');
    expect(saved.widths.status).toBe(Math.round(w0 + 70));

    await page.reload();
    await app.ready();
    expect(Math.round((await headBox(app, 'status'))!.width), 'giữ sau khi tải lại').toBe(Math.round(w0 + 70));
    await app.tid('col-resize-status').dblclick();
    await expect.poll(async () => Math.round((await headBox(app, 'status'))!.width)).toBe(Math.round(w0));
  });
});
