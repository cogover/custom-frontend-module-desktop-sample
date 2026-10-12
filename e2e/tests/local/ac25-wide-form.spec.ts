import { test, expect } from '../../support/local/fixtures';
import { T } from '../../support/local/dataset';
import type { TaskApp } from '../../support/ui';

/**
 * AC25 Form tạo/sửa rộng (CONTRACT mục 5 điểm 3e): vùng nội dung popup ≥ 920px → hai dòng thuộc tính dùng chung cột:
 * cạnh phải Người giao = cạnh phải Mức ưu tiên, cạnh trái Hạn chót = cạnh trái Người được giao, dòng 1 không xuống dòng.
 * Form tạo (review 2026-10-08): dòng 2 là Người giao · Người được giao · Người theo dõi cùng một hàng, ba ô rộng bằng nhau
 * (cột riêng, không thẳng cột dòng 1). Hẹp hơn: giữ bố cục cũ (không bắt buộc thẳng hàng) và không tràn ngang.
 */

type Rect = { left: number; right: number; top: number; bottom: number; width: number };
const rect = (app: TaskApp, id: string): Promise<Rect> =>
  app.tid(id).evaluate((el) => {
    const b = el.getBoundingClientRect();
    return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width };
  });

/** Bề rộng vùng nội dung của form (không tính padding). */
const contentWidth = (app: TaskApp) =>
  app.form().evaluate((el) => {
    const cs = getComputedStyle(el);
    return el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  });

async function expectWideAlignment(app: TaskApp, mode: 'create' | 'edit') {
  const width = await contentWidth(app);
  expect(width, `vùng nội dung popup ≥ 920px (đo được ${width})`).toBeGreaterThanOrEqual(920);
  const [st, pr, due, time, rep, asg] = await Promise.all(
    ['field-status', 'field-priority', 'field-due-date', 'field-due-time', 'field-reporter', 'field-assignee'].map((id) => rect(app, id)),
  );
  if (mode === 'edit') {
    expect(Math.abs(rep.right - pr.right), `cạnh phải Người giao (${rep.right}) = cạnh phải Mức ưu tiên (${pr.right})`).toBeLessThanOrEqual(1);
    expect(Math.abs(due.left - asg.left), `cạnh trái Hạn chót (${due.left}) = cạnh trái Người được giao (${asg.left})`).toBeLessThanOrEqual(1);
    await expect(app.tid('field-ccs'), 'form sửa không có Người theo dõi').toHaveCount(0);
  } else {
    const ccs = await rect(app, 'field-ccs');
    expect(Math.abs(ccs.top - rep.top), 'Người theo dõi cùng hàng với Người giao').toBeLessThanOrEqual(1);
    expect(asg.right).toBeLessThanOrEqual(ccs.left);
    for (const [name, r] of [['Người được giao', asg], ['Người theo dõi', ccs]] as const)
      expect(Math.abs(r.width - rep.width), `${name} rộng bằng Người giao (${r.width} / ${rep.width})`).toBeLessThanOrEqual(1);
  }
  // Dòng 1 không xuống dòng: Trạng thái · Mức ưu tiên · Hạn chót (ngày + giờ) cùng một hàng.
  for (const [name, r] of [['Mức ưu tiên', pr], ['Hạn chót (ngày)', due], ['Hạn chót (giờ)', time]] as const)
    expect(Math.abs(r.top - st.top), `${name} cùng hàng (top) với Trạng thái`).toBeLessThanOrEqual(1);
  expect(st.right).toBeLessThanOrEqual(pr.left);
  expect(pr.right).toBeLessThanOrEqual(due.left);
  expect(due.right).toBeLessThanOrEqual(time.left + 1);
  // Dòng 2 nằm dưới dòng 1, Người giao bên trái Người được giao.
  expect(rep.top).toBeGreaterThan(st.bottom - 1);
  expect(Math.abs(rep.top - asg.top), 'Người giao và Người được giao cùng hàng').toBeLessThanOrEqual(1);
  expect(rep.right).toBeLessThanOrEqual(asg.left);
  // Không tràn khỏi form.
  const form = await app.form().evaluate((el) => {
    const b = el.getBoundingClientRect();
    return { left: b.left, right: b.right, overflow: el.scrollWidth - el.clientWidth };
  });
  expect(form.overflow, 'form không cuộn ngang').toBeLessThanOrEqual(1);
  for (const r of [st, pr, due, time, rep, asg]) {
    expect(r.left).toBeGreaterThanOrEqual(form.left - 0.5);
    expect(r.right).toBeLessThanOrEqual(form.right + 0.5);
  }
}

test.describe('AC25 form rộng 1440×900', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('AC25 form tạo: dòng 1 một hàng; Người giao · Người được giao · Người theo dõi một hàng, rộng bằng nhau', async ({ app }) => {
    await app.openReady();
    await app.openCreate();
    await expectWideAlignment(app, 'create');
  });

  test('AC25 form sửa: Người giao kết thúc thẳng Mức ưu tiên, Hạn chót bắt đầu thẳng Người được giao', async ({ app }) => {
    await app.openReady();
    await app.openTask(T.T3);
    await app.tid('form-edit').click();
    await expect(app.form()).toBeVisible();
    await expectWideAlignment(app, 'edit');
  });
});

test.describe('AC25 form hẹp hơn (1000px)', () => {
  test.use({ viewport: { width: 1000, height: 800 } });

  test('AC25 viewport 1000px: bố cục không tràn ngang (không bắt buộc thẳng hàng)', async ({ app, page }) => {
    await app.openReady();
    await app.openCreate();
    const doc = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: window.innerWidth }));
    expect(doc.doc, 'trang không cuộn ngang').toBeLessThanOrEqual(doc.vw);
    const dlg = (await app.dialog().boundingBox())!;
    expect(dlg.x).toBeGreaterThanOrEqual(0);
    expect(dlg.x + dlg.width).toBeLessThanOrEqual(1000.5);
    const overflow = await app.form().evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow, 'form không cuộn ngang').toBeLessThanOrEqual(1);
    const formBox = await app.form().evaluate((el) => {
      const b = el.getBoundingClientRect();
      return { left: b.left, right: b.right };
    });
    for (const id of ['field-status', 'field-priority', 'field-due-date', 'field-due-time', 'field-reporter', 'field-assignee']) {
      const r = await rect(app, id);
      await expect(app.tid(id)).toBeVisible();
      expect(r.left, `${id} không tràn trái`).toBeGreaterThanOrEqual(formBox.left - 0.5);
      expect(r.right, `${id} không tràn phải`).toBeLessThanOrEqual(formBox.right + 0.5);
    }
  });
});
