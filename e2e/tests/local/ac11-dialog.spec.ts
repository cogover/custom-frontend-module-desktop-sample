import { test, expect } from '../../support/local/fixtures';
import { NAME, P, T } from '../../support/local/dataset';
import { vn } from '../../support/model';
import { optionLabels } from '../../support/ui';

/** Hộp bao của nhãn thuộc tính (dt) trong chế độ xem. */
async function labelBox(view: import('@playwright/test').Locator, label: string) {
  const el = view.getByText(label, { exact: true }).first();
  await expect(el, `nhãn "${label}"`).toBeVisible();
  return (await el.boundingBox())!;
}


test.describe('AC11 popup xem / sửa', () => {
  test('AC11 click vùng trống thẻ → popup xem đủ thông tin', async ({ app }) => {
    await app.openReady();
    await app.openTask(T.T7);
    const v = app.view();
    await expect(v).toContainText('Đối soát công nợ quý 3');
    await expect(v).toContainText('Đối chiếu số dư với kế toán.');
    await expect(v).toContainText('Đang xử lý');
    await expect(v).toContainText('Khẩn cấp');
    await expect(v).toContainText(NAME[P.TUAN]);
    await expect(v).toContainText(NAME[P.ME]);
    // Người theo dõi nhiều người: avatar chồng + tên người đầu + "+N", title liệt kê đủ tên.
    const ccCell = v.locator(`[title*="${NAME[P.HOA]}"]`).first();
    await expect(ccCell, 'title liệt kê đủ người theo dõi').toHaveAttribute('title', new RegExp(NAME[P.ME].replace('.', '\\.')));
    await expect(v).toContainText('+1');
    // Task sửa được (3d, 2026-10-03): hạn chót là Date Picker dd/MM/yyyy + Select giờ, kèm chip quá hạn.
    await expect(app.tid('view-due-date')).toContainText('28/09/2026');
    await expect(app.tid('view-due-time')).toContainText('10:00');
    await expect(v).toContainText('Quá hạn 3 ngày');
    await expect(app.dialog()).toContainText('TAS-1007');
    await expect(app.dialog()).toContainText(/tạo/i);
    await expect(app.dialog()).toContainText(/cập nhật/i);
  });

  test('AC11 task chỉ theo dõi: hạn chót tĩnh dạng ngắn "<thứ>, dd/MM/yyyy HH:mm", ngày đầy đủ trong title', async ({ app }) => {
    await app.openReady();
    await app.setRoles(['cc']);
    await app.openTask(T.T5);
    const v = app.view();
    await expect(v, 'dạng ngắn (25/10/2026 là Chủ nhật)').toContainText('CN, 25/10/2026 17:00');
    await expect(v.locator('[title*="2026"]').filter({ hasText: '25/10/2026' }).first()).toHaveAttribute('title', /tháng\s*10/i);
  });

  test('AC11 chế độ xem không có chân popup: Sửa/Xoá là nút icon góc trên phải, cạnh trái nút đóng', async ({ app, page }) => {
    await app.openReady();
    await app.openTask(T.T3);
    await expect(app.tid('form-cancel'), 'chế độ xem không còn nút Đóng/Huỷ ở chân').toBeHidden();
    await expect(app.tid('form-submit')).toBeHidden();
    const edit = app.tid('form-edit');
    const del = app.tid('form-delete');
    const close = app.tid('dialog-close');
    await expect(edit).toHaveAccessibleName('Sửa');
    await expect(del).toHaveAccessibleName('Xoá công việc');
    const [e, d, c] = [(await edit.boundingBox())!, (await del.boundingBox())!, (await close.boundingBox())!];
    const mid = (b: { y: number; height: number }) => b.y + b.height / 2;
    expect(Math.abs(mid(e) - mid(c)), 'cùng hàng với nút đóng').toBeLessThan(4);
    expect(Math.abs(mid(d) - mid(c)), 'cùng hàng với nút đóng').toBeLessThan(4);
    expect(e.x + e.width, 'Sửa bên trái Xoá').toBeLessThanOrEqual(d.x + 1);
    expect(d.x + d.width, 'Xoá bên trái nút đóng').toBeLessThanOrEqual(c.x + 1);
    const dlg = (await app.dialog().boundingBox())!;
    expect(c.y - dlg.y, 'ở góc trên popup').toBeLessThan(80);

    // Chế độ sửa: ẩn hai icon, chân popup có Huỷ + Lưu.
    await edit.click();
    await expect(app.form()).toBeVisible();
    await expect(app.tid('form-edit')).toBeHidden();
    await expect(app.tid('form-delete')).toBeHidden();
    await expect(app.tid('form-cancel')).toBeVisible();
    await expect(app.tid('form-cancel')).toHaveText(/Huỷ/);
    await expect(app.tid('form-submit')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(app.view()).toBeVisible();

    // Popup tạo: không có icon Sửa/Xoá.
    await page.keyboard.press('Escape');
    await app.openCreate();
    await expect(app.tid('form-edit')).toBeHidden();
    await expect(app.tid('form-delete')).toBeHidden();
    await expect(app.tid('form-cancel')).toBeVisible();
  });

  test('AC11 task chỉ theo dõi: chế độ xem không hiện nút Sửa/Xoá', async ({ app }) => {
    await app.openReady();
    await app.setRoles(['cc']);
    await app.openTask(T.T5);
    await expect(app.tid('form-edit')).toHaveCount(0);
    await expect(app.tid('form-delete')).toHaveCount(0);
    await expect(app.tid('dialog-close')).toBeVisible();
  });

  test('AC11 đầu popup xem: không còn "Chi tiết công việc", tên dialog = tên task, task-meta ngắn cùng hàng nút icon', async ({ app, page }) => {
    await app.openReady();
    await app.openTask(T.T7);
    await expect(app.dialog().getByText('Chi tiết công việc'), 'bỏ tiêu đề "Chi tiết công việc"').toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Đối soát công nợ quý 3' }), 'accessible name của popup = tên task').toBeVisible();
    const meta = app.tid('task-meta');
    // Tạo/cập nhật 26/09/2026 09:00 (cùng năm hiện tại → không ghi năm).
    await expect(meta).toHaveText(/TAS-1007\s*·\s*Tạo 09:00 26\/09\s*·\s*Cập nhật 09:00 26\/09/);
    await expect(meta).not.toContainText('2026');
    const titles = await meta.evaluate((el) => [el, ...el.querySelectorAll('*')].map((e) => e.getAttribute('title') ?? '').join(' | '));
    expect(titles, 'thời gian đầy đủ trong title').toMatch(/2026/);
    const [mb, eb, cb] = [(await meta.boundingBox())!, (await app.tid('form-edit').boundingBox())!, (await app.tid('dialog-close').boundingBox())!];
    const mid = (b: { y: number; height: number }) => b.y + b.height / 2;
    expect(Math.abs(mid(mb) - mid(cb)), 'meta cùng hàng nút icon').toBeLessThan(8);
    expect(mb.x + mb.width, 'meta bên trái các nút').toBeLessThanOrEqual(eb.x + 1);

    // Popup tạo/sửa giữ tiêu đề riêng.
    await app.tid('form-edit').click();
    await expect(page.getByRole('dialog', { name: 'Sửa công việc' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(app.dialog()).toBeHidden();
    await app.openCreate();
    await expect(page.getByRole('dialog', { name: 'Tạo công việc' })).toBeVisible();
  });

  test('AC11 task-meta: tạo khác năm hiện tại thì kèm năm', async ({ app, mock }) => {
    mock.task(T.T3)!.created = vn(2025, 9, 30, 9, 12);
    mock.task(T.T3)!.updated = vn(2026, 9, 30, 9, 13);
    await app.openReady();
    await app.openTask(T.T3);
    await expect(app.tid('task-meta')).toHaveText(/TAS-1003\s*·\s*Tạo 09:12 30\/09\/2025\s*·\s*Cập nhật 09:13 30\/09(?!\/)/);
  });

  test('AC11 popup xem: không có người theo dõi → "Không có"', async ({ app }) => {
    await app.openReady();
    await app.openTask(T.T3);
    await expect(app.view()).toContainText('Không có');
  });

  test('AC11 bố cục xem (1440px): thuộc tính 2 hàng cùng lưới form, mô tả trải hết bề rộng', async ({ app }) => {
    await app.openReady();
    await app.openTask(T.T7);
    const v = app.view();
    const status = await labelBox(v, 'Trạng thái');
    const prio = await labelBox(v, 'Mức ưu tiên');
    const due = await labelBox(v, 'Hạn chót');
    const rep = await labelBox(v, 'Người giao');
    const asg = await labelBox(v, 'Người được giao');
    const cc = await labelBox(v, 'Người theo dõi');
    const mid = (b: { y: number; height: number }) => b.y + b.height / 2;
    // Hàng 1: Trạng thái · Mức ưu tiên · Hạn chót.
    for (const b of [prio, due]) expect(Math.abs(mid(b) - mid(status)), 'hàng 1 cùng hàng').toBeLessThan(8);
    expect(status.x).toBeLessThan(prio.x);
    expect(prio.x).toBeLessThan(due.x);
    // Hàng 2: Người giao · Người được giao · Người theo dõi, nằm dưới hàng 1.
    for (const b of [asg, cc]) expect(Math.abs(mid(b) - mid(rep)), 'hàng 2 cùng hàng').toBeLessThan(8);
    expect(rep.x).toBeLessThan(asg.x);
    expect(asg.x).toBeLessThan(cc.x);
    expect(mid(rep), 'hàng người nằm dưới hàng thuộc tính').toBeGreaterThan(mid(status) + 10);
    // Cùng lưới: cột nhãn đầu thẳng hàng.
    expect(Math.abs(rep.x - status.x), 'cột nhãn đầu thẳng hàng').toBeLessThan(4);

    expect(await v.getByText(/Cập nhật lúc/).count(), 'không còn dòng "Cập nhật lúc" trong bảng thuộc tính').toBe(0);

    // Mô tả trải hết bề rộng nội dung popup (không giới hạn 80ch).
    const desc = (await v.getByText('Đối chiếu số dư với kế toán.').boundingBox())!;
    const vb = (await v.boundingBox())!;
    expect(desc.width, 'mô tả rộng gần bằng nội dung popup').toBeGreaterThanOrEqual(vb.width * 0.9);
  });

  test('AC11 popup desktop (1440×900): cách mép cửa sổ 64px trên/dưới, ≥32px hai bên, nằm trong khung app', async ({ app, page }) => {
    await app.openReady();
    const vp = page.viewportSize()!;
    const board = (await page.getByRole('main').first().boundingBox())!;
    for (const open of ['view', 'create'] as const) {
      if (open === 'view') await app.openTask(T.T7);
      else await app.openCreate();
      const b = (await app.dialog().boundingBox())!;
      expect(Math.abs(b.y - 64), `${open}: cách mép trên 64px (thực tế ${b.y})`).toBeLessThanOrEqual(4);
      expect(Math.abs(vp.height - (b.y + b.height) - 64), `${open}: cách mép dưới 64px`).toBeLessThanOrEqual(4);
      expect(b.x, `${open}: cách mép trái ≥ 32px`).toBeGreaterThanOrEqual(32 - 1);
      expect(vp.width - (b.x + b.width), `${open}: cách mép phải ≥ 32px`).toBeGreaterThanOrEqual(32 - 1);
      expect(b.x >= board.x - 1 && b.x + b.width <= board.x + board.width + 1, `${open}: nằm trong khung app theo chiều ngang`).toBe(true);
      expect(b.y >= board.y - 1 && b.y + b.height <= board.y + board.height + 1, `${open}: nằm trong khung app theo chiều dọc`).toBe(true);
      await page.keyboard.press('Escape');
      await expect(app.dialog()).toBeHidden();
    }
  });

  test('AC11 Sửa → Lưu: server cập nhật (chỉ gửi field đổi), quay về chế độ xem', async ({ app, mock }) => {
    await app.openReady();
    await app.openTask(T.T3);
    await app.tid('form-edit').click();
    await expect(app.form()).toBeVisible();
    await expect(app.tid('field-title')).toHaveValue('Nghiên cứu ứng dụng đối thủ');
    await app.tid('field-title').fill('Nghiên cứu ứng dụng đối thủ (bản 2)');
    await app.pickPriority('high');
    await app.tid('form-submit').click();

    await expect(app.view()).toBeVisible();
    await expect(app.dialog()).toBeVisible();
    await expect(app.view()).toContainText('Nghiên cứu ứng dụng đối thủ (bản 2)');
    await expect(app.view()).toContainText('Cao');
    await expect.poll(() => mock.task(T.T3)?.subject).toBe('Nghiên cứu ứng dụng đối thủ (bản 2)');
    expect(mock.task(T.T3)?.priority).toBe('high');

    const upd = mock.updates(T.T3).at(-1)!;
    expect(upd.headers['x-req-service']).toBe('10201');
    expect(upd.body.data).toMatchObject({ id: T.T3, subject: 'Nghiên cứu ứng dụng đối thủ (bản 2)', priority: 'high' });
    for (const k of Object.keys(upd.body.data))
      expect(['id', 'object_type', 'workspace_id', 'subject', 'priority'], `chỉ gửi field đổi, thừa "${k}"`).toContain(k);
    await expect(app.inItem(T.T3, 'task-title')).toContainText('(bản 2)');
    expect(mock.violations).toEqual([]);
  });

  test('AC11 sửa hạn bằng Date Picker + Select giờ → chỉ gửi due_date theo UTC+7', async ({ app, mock }) => {
    await app.openReady();
    await app.openTask(T.T3);
    await app.tid('form-edit').click();
    await expect(app.tid('field-due-date')).toContainText('30/09/2026');
    await expect(app.tid('field-due-time')).toContainText('17:00');
    await app.pickDate(app.tid('field-due-date'), '2026-10-05');
    await app.pickTime(app.tid('field-due-time'), '08:00');
    await app.tid('form-submit').click();
    await expect(app.view()).toBeVisible();
    await expect.poll(() => mock.updates(T.T3).length).toBe(1);
    const data = mock.updates(T.T3)[0].body.data;
    expect(data.due_date).toBe(vn(2026, 10, 5, 8, 0));
    for (const k of Object.keys(data)) expect(['id', 'object_type', 'workspace_id', 'due_date'], `chỉ gửi field đổi, thừa "${k}"`).toContain(k);
  });

  test('AC11 giờ lẻ có sẵn (14:28) hiện như 1 option; lưu không đổi hạn thì không gửi due_date', async ({ app, mock, page }) => {
    mock.task(T.T3)!.due_date = vn(2026, 9, 30, 14, 28);
    await app.openReady();
    await app.openTask(T.T3);
    await expect(app.view()).toContainText('14:28');
    await app.tid('form-edit').click();
    await expect(app.tid('field-due-time')).toContainText('14:28');
    const labels = await optionLabels(page, app.tid('field-due-time'));
    expect(labels, 'giờ lẻ có sẵn là 1 option').toContain('14:28');
    expect(labels.filter((l) => /^\d{2}:(00|30)$/.test(l))).toHaveLength(48);
    await expect(app.tid('field-due-time')).toContainText('14:28');
    await app.tid('field-title').fill('Nghiên cứu ứng dụng đối thủ (giờ lẻ)');
    await app.tid('form-submit').click();
    await expect(app.view()).toBeVisible();
    await expect.poll(() => mock.updates(T.T3).length).toBe(1);
    expect(mock.updates(T.T3)[0].body.data, 'không gửi due_date khi không đổi').not.toHaveProperty('due_date');
    expect(mock.task(T.T3)!.due_date).toBe(vn(2026, 9, 30, 14, 28));
  });

  test('AC11 Huỷ khi sửa → về chế độ xem, không lưu', async ({ app, mock }) => {
    await app.openReady();
    await app.openTask(T.T3);
    await app.tid('form-edit').click();
    await app.tid('field-title').fill('Không được lưu');
    await app.tid('form-cancel').click();
    await expect(app.view()).toBeVisible();
    await expect(app.view()).toContainText('Nghiên cứu ứng dụng đối thủ');
    await expect(app.view()).not.toContainText('Không được lưu');
    expect(mock.updates()).toHaveLength(0);
  });

  test('AC11 Esc khi sửa → về xem không lưu; Esc khi xem → đóng', async ({ app, mock, page }) => {
    await app.openReady();
    await app.openTask(T.T3);
    await app.tid('form-edit').click();
    await app.tid('field-title').fill('Không được lưu (Esc)');
    await page.keyboard.press('Escape');
    await expect(app.view()).toBeVisible();
    await expect(app.dialog()).toBeVisible();
    await expect(app.view()).not.toContainText('Không được lưu (Esc)');
    await page.keyboard.press('Escape');
    await expect(app.dialog()).toBeHidden();
    expect(mock.updates()).toHaveLength(0);
  });

  test('AC11 nút đóng popup', async ({ app }) => {
    await app.openReady();
    await app.openTask(T.T1);
    await app.tid('dialog-close').click();
    await expect(app.dialog()).toBeHidden();
  });
});

test.describe('AC11 bố cục xem ở 375px', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('AC11 popup hẹp: thuộc tính 1 cột theo thứ tự, không cuộn ngang', async ({ app, page }) => {
    await app.openReady();
    await app.openTask(T.T7);
    const v = app.view();
    const order = ['Trạng thái', 'Mức ưu tiên', 'Hạn chót', 'Người giao', 'Người được giao', 'Người theo dõi'];
    const boxes = [];
    for (const l of order) boxes.push(await labelBox(v, l));
    for (const b of boxes) expect(Math.abs(b.x - boxes[0].x), 'một cột: cùng lề trái').toBeLessThan(4);
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].y, `${order[i]} nằm dưới ${order[i - 1]}`).toBeGreaterThan(boxes[i - 1].y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), 'không cuộn ngang').toBeLessThanOrEqual(375);
    const dlg = (await app.dialog().boundingBox())!;
    expect(dlg.x + dlg.width).toBeLessThanOrEqual(375.5);
  });
});
