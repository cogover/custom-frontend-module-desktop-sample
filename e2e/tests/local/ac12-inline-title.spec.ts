import { test, expect } from '../../support/local/fixtures';
import { T } from '../../support/local/dataset';

const OLD = 'Gọi lại khách hàng Phú Thành';

test.describe('AC12 sửa nhanh tiêu đề bằng double-click', () => {
  test('AC12 Enter lưu (chỉ gửi subject), không mở popup', async ({ app, mock }) => {
    await app.openReady();
    await app.dblclickTitle(T.T8);
    const input = app.inItem(T.T8, 'title-edit');
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue(OLD);
    await input.fill('Gọi lại khách hàng Phú Thành — chốt lịch');
    await input.press('Enter');
    await expect(app.inItem(T.T8, 'title-edit')).toBeHidden();
    await expect(app.inItem(T.T8, 'task-title')).toContainText('chốt lịch');
    await expect(app.dialog()).toBeHidden();
    await expect.poll(() => mock.task(T.T8)?.subject).toBe('Gọi lại khách hàng Phú Thành — chốt lịch');
    const data = mock.updates(T.T8).at(-1)!.body.data;
    for (const k of Object.keys(data)) expect(['id', 'object_type', 'workspace_id', 'subject']).toContain(k);
    expect(mock.violations).toEqual([]);
  });

  test('AC12 blur (click ra ngoài) lưu', async ({ app, mock }) => {
    await app.openReady();
    await app.dblclickTitle(T.T8);
    await app.inItem(T.T8, 'title-edit').fill('Tên mới khi blur');
    await app.tid('list-title').click();
    await expect(app.inItem(T.T8, 'task-title')).toContainText('Tên mới khi blur');
    await expect.poll(() => mock.task(T.T8)?.subject).toBe('Tên mới khi blur');
    expect(mock.updates(T.T8)).toHaveLength(1);
  });

  test('AC12 Esc huỷ, không gửi API', async ({ app, mock, page }) => {
    await app.openReady();
    await app.dblclickTitle(T.T8);
    await app.inItem(T.T8, 'title-edit').fill('Không lưu');
    await page.keyboard.press('Escape');
    await expect(app.inItem(T.T8, 'title-edit')).toBeHidden();
    await expect(app.inItem(T.T8, 'task-title')).toHaveText(OLD);
    await page.waitForTimeout(300);
    expect(mock.updates()).toHaveLength(0);
  });

  test('AC12 rỗng hoặc chỉ khoảng trắng → giữ tên cũ, không gửi API', async ({ app, mock, page }) => {
    await app.openReady();
    for (const v of ['', '    ']) {
      await app.dblclickTitle(T.T8);
      await app.inItem(T.T8, 'title-edit').fill(v);
      await app.inItem(T.T8, 'title-edit').press('Enter');
      await expect(app.inItem(T.T8, 'title-edit')).toBeHidden();
      await expect(app.inItem(T.T8, 'task-title')).toHaveText(OLD);
    }
    await page.waitForTimeout(300);
    expect(mock.updates()).toHaveLength(0);
  });

  for (const where of ['cùng thẻ', 'thẻ khác'] as const) {
    test(`AC12 đang sửa nhanh, bấm vùng trống ${where} → chỉ lưu + thoát sửa, không mở popup; bấm lần 2 mới mở`, async ({ app, mock, page }) => {
      await app.openReady();
      const other = where === 'cùng thẻ' ? T.T8 : T.T3;
      await app.dblclickTitle(T.T8);
      await app.inItem(T.T8, 'title-edit').fill('Gọi lại khách hàng — bấm ra ngoài');
      await app.clickCardBlank(other);
      await expect(app.inItem(T.T8, 'title-edit')).toBeHidden();
      await expect(app.inItem(T.T8, 'task-title')).toContainText('bấm ra ngoài');
      await expect.poll(() => mock.updates(T.T8).length).toBe(1);
      await page.waitForTimeout(500);
      await expect(app.dialog(), 'cú bấm thoát sửa không được mở popup').toBeHidden();
      expect(mock.updates(T.T8), 'request đổi tên gửi đúng 1 lần').toHaveLength(1);
      expect(mock.updates(T.T8)[0].body.data.subject).toBe('Gọi lại khách hàng — bấm ra ngoài');

      await app.clickCardBlank(other);
      await expect(app.dialog(), 'cú bấm sau mở popup bình thường').toBeVisible();
      await expect(app.view()).toContainText(other === T.T8 ? 'bấm ra ngoài' : 'Nghiên cứu ứng dụng đối thủ');
      expect(mock.updates(T.T8)).toHaveLength(1);
    });
  }

  test('AC12 con trỏ: đang sửa nhanh → vùng thẻ và tiêu đề thẻ khác là mũi tên mặc định, điều khiển giữ con trỏ riêng; thoát sửa → bàn tay/chữ I', async ({ app, page }) => {
    await app.openReady();
    /** Con trỏ người dùng thấy tại một điểm (phần tử trúng điểm đó, cursor đã kế thừa). */
    const cursorAt = (p: { x: number; y: number }) =>
      page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return el ? getComputedStyle(el).cursor : null;
      }, p);
    const blankOf = async (id: string) => {
      const b = (await app.item(id).boundingBox())!;
      return { x: b.x + Math.round(b.width * 0.55), y: b.y + 4 };
    };
    const titleTextOf = (id: string) =>
      app.inItem(id, 'task-title').evaluate((el) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let n: Node | null;
        while ((n = walker.nextNode())) if (n.textContent?.trim()) break;
        const r = document.createRange();
        r.selectNodeContents(n ?? el);
        const b = r.getClientRects()[0] ?? r.getBoundingClientRect();
        return { x: b.left + Math.min(b.width / 2, 30), y: b.top + b.height / 2 };
      });
    const centerOf = async (id: string, testId: string) => {
      await app.item(id).hover();
      const b = (await app.inItem(id, testId).boundingBox())!;
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };

    // Trước khi sửa: thẻ = bàn tay, tiêu đề = chữ I.
    expect(await cursorAt(await blankOf(T.T3)), 'vùng thẻ (bình thường)').toBe('pointer');
    expect(await cursorAt(await titleTextOf(T.T3)), 'tiêu đề (bình thường)').toBe('text');

    // Đang sửa nhanh T8.
    await app.dblclickTitle(T.T8);
    await expect(app.inItem(T.T8, 'title-edit')).toBeFocused();
    await expect.poll(async () => cursorAt(await blankOf(T.T3)), { message: 'vùng trống thẻ khác khi đang sửa', timeout: 2000 }).toBe('default');
    expect(await cursorAt(await titleTextOf(T.T3)), 'tiêu đề thẻ khác khi đang sửa').toBe('default');
    expect(await cursorAt(await blankOf(T.T8)), 'vùng trống chính thẻ đang sửa').toBe('default');
    // 2026-10-04: thẻ không còn nút xoá → điều khiển còn lại là checkbox và chọn trạng thái.
    for (const testId of ['task-checkbox', 'task-status']) {
      // Rê chuột lên điều khiển sẽ blur ô sửa nếu click; ở đây chỉ đo con trỏ tại điểm, không click.
      const c = await cursorAt(await centerOf(T.T3, testId));
      expect(c, `${testId} giữ con trỏ riêng khi đang sửa`).not.toBe('default');
      expect(c, `${testId} vẫn là điều khiển bấm được`).toBe('pointer');
    }
    await expect(app.inItem(T.T8, 'title-edit'), 'rê chuột không làm thoát sửa').toBeVisible();

    // Thoát sửa (Esc) → trở lại bàn tay / chữ I.
    await page.keyboard.press('Escape');
    await expect(app.inItem(T.T8, 'title-edit')).toBeHidden();
    // Con trỏ cập nhật theo lần render kế tiếp → chờ trạng thái ổn định (vài khung hình).
    await expect.poll(async () => cursorAt(await blankOf(T.T3)), { message: 'vùng thẻ sau khi thoát sửa', timeout: 2000 }).toBe('pointer');
    await expect.poll(async () => cursorAt(await titleTextOf(T.T3)), { message: 'tiêu đề sau khi thoát sửa', timeout: 2000 }).toBe('text');
    await expect.poll(async () => cursorAt(await blankOf(T.T8)), { timeout: 2000 }).toBe('pointer');
  });
});
