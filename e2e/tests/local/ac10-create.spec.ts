import { test, expect } from '../../support/local/fixtures';
import { NAME, P, PEOPLE } from '../../support/local/dataset';
import { MSG, normalizeHtml, OBJECT_TYPE, vn, WORKSPACE_ID } from '../../support/model';
import { chooseOption, findDayButton, optionLabels, selectedOptionLabel } from '../../support/ui';

test.describe('AC10 tạo công việc', () => {
  test('AC10 giá trị mặc định: hạn hôm nay 17:00 (trước 17h), Trung bình, Mới, người giao/được giao = tôi', async ({ app, page }) => {
    await app.openReady();
    await app.openCreate();
    await expect(app.tid('field-title')).toBeFocused();
    await expect(app.tid('field-due-date'), 'nút Date Picker hiện dd/MM/yyyy').toContainText('01/10/2026');
    await expect(app.tid('field-due-time')).toContainText('17:00');
    expect(await selectedOptionLabel(app.tid('field-priority')), 'ưu tiên mặc định').toContain('Trung bình');
    expect(await optionLabels(page, app.tid('field-priority')), 'Select Mức ưu tiên có 4 option').toEqual(['Khẩn cấp', 'Cao', 'Trung bình', 'Thấp']);
    expect(await selectedOptionLabel(app.tid('field-status'))).toContain('Mới');
    await expect(app.tid('field-reporter')).toContainText(NAME[P.ME]);
    await expect(app.tid('field-assignee')).toContainText(NAME[P.ME]);
    await expect(page.getByText('Không có hạn')).toHaveCount(0);
  });

  test('AC10 bố cục form: thuộc tính 2 hàng (Trạng thái · Mức ưu tiên · Hạn chót / Người giao · Người được giao)', async ({ app }) => {
    await app.openReady();
    await app.openCreate();
    const box = async (id: string) => (await app.tid(id).boundingBox())!;
    const mid = (b: { y: number; height: number }) => b.y + b.height / 2;
    const [st, pr, du, rp, as] = await Promise.all(
      ['field-status', 'field-priority', 'field-due-date', 'field-reporter', 'field-assignee'].map(box),
    );
    for (const b of [pr, du]) expect(Math.abs(mid(b) - mid(st)), 'hàng 1 cùng hàng').toBeLessThan(8);
    expect(st.x).toBeLessThan(pr.x);
    expect(pr.x).toBeLessThan(du.x);
    expect(Math.abs(mid(as) - mid(rp)), 'hàng 2 cùng hàng').toBeLessThan(8);
    expect(rp.x).toBeLessThan(as.x);
    expect(mid(rp), 'Người giao ở hàng dưới').toBeGreaterThan(mid(st) + 10);
    for (const b of [st, pr, rp, as]) expect(Math.abs(b.height - 36), 'ô cao 36px').toBeLessThanOrEqual(2);
  });

  test('AC10 validate tiêu đề bắt buộc (rỗng/chỉ khoảng trắng) → không gửi API', async ({ app, mock }) => {
    await app.openReady();
    await app.openCreate();
    await app.tid('form-submit').click();
    await expect(app.tid('field-title-error')).toBeVisible();
    await app.tid('field-title').fill('    ');
    await app.tid('form-submit').click();
    await expect(app.tid('field-title-error')).toBeVisible();
    await expect(app.dialog()).toBeVisible();
    expect(mock.creates()).toHaveLength(0);
  });

  test('AC10 giờ là Select mốc 30 phút 00:00–23:30', async ({ app, page }) => {
    await app.openReady();
    await app.openCreate();
    const labels = await optionLabels(page, app.tid('field-due-time'));
    const expected = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
    expect(labels).toEqual(expected);
    await app.pickTime(app.tid('field-due-time'), '08:30');
    await expect(app.dialog(), 'chọn giờ không đóng popup').toBeVisible();
  });

  test('AC10 hạn chót bắt buộc: Date Picker luôn có ngày, hoặc báo lỗi nếu bỏ chọn được', async ({ app, mock, page }) => {
    await app.openReady();
    await app.openCreate();
    await app.tid('field-title').fill('Việc kiểm tra hạn bắt buộc');
    // Bấm lại đúng ngày đang chọn (react-day-picker mode single có thể bỏ chọn nếu app không đặt required).
    await app.tid('field-due-date').click();
    const cal = app.calendar();
    await expect(cal).toBeVisible();
    const idx = await findDayButton(cal, 2026, 10, 1);
    expect(idx, 'lịch mở ở tháng của ngày đang chọn').toBeGreaterThanOrEqual(0);
    await cal.locator('button').nth(idx).click();
    if (await cal.isVisible()) await page.keyboard.press('Escape');
    await expect(app.dialog()).toBeVisible();
    const stillHasDate = /\d{2}\/\d{2}\/\d{4}/.test(await app.tid('field-due-date').innerText());
    await app.tid('form-submit').click();
    await page.waitForTimeout(600);
    if (stillHasDate) {
      await expect.poll(() => mock.creates().length).toBe(1);
      expect(typeof mock.creates()[0].body.data.due_date, 'luôn gửi due_date dạng số ms').toBe('number');
    } else {
      expect(mock.creates(), 'không được tạo khi thiếu hạn').toHaveLength(0);
      await expect(app.dialog()).toBeVisible();
      await expect
        .poll(
          async () =>
            (await app.tid('field-due-date').getAttribute('aria-invalid')) === 'true' ||
            (await app.form().locator('[role="alert"], [aria-live]').filter({ hasText: /hạn|ngày/i }).count()) > 0 ||
            (await app.form().getByText(/(chọn|nhập|cần|thiếu|bắt buộc).{0,20}(hạn|ngày)|(hạn|ngày).{0,20}(bắt buộc|không hợp lệ)/i).count()) > 0,
          { message: 'phải báo lỗi hạn chót' },
        )
        .toBe(true);
    }
  });

  test('AC10 validate người: phải là người giao hoặc người được giao', async ({ app, mock }) => {
    await app.openReady();
    await app.openCreate();
    await app.tid('field-title').fill('Việc giao chéo');
    await app.pickPerson('field-reporter', P.MINH, 'minh');
    await app.pickPerson('field-assignee', P.TUAN, 'tuan');
    await expect(app.tid('field-reporter')).toContainText(NAME[P.MINH]);
    await expect(app.tid('field-assignee')).toContainText(NAME[P.TUAN]);
    await app.tid('form-submit').click();
    await expect(app.tid('field-people-error')).toBeVisible();
    await expect(app.tid('field-people-error')).toContainText(MSG.peopleError);
    expect(mock.creates()).toHaveLength(0);

    await app.pickPerson('field-assignee', P.ME);
    await app.tid('form-submit').click();
    await expect.poll(() => mock.creates().length).toBe(1);
    expect(mock.creates()[0].body.data).toMatchObject({ reporter: P.MINH, assignee: P.ME });
  });

  test('AC10 ô chọn nhân sự: chỉ ACTIVE, tìm không dấu, chọn bằng bàn phím, tải lười', async ({ app, mock, page }) => {
    await app.openReady();
    const personnelLists = () =>
      mock.byKind('list').filter((r) => r.body?.object_slug === 'personnel' && r.body.filters?.some((f: any) => f.field === 'status'));
    expect(personnelLists(), 'danh sách nhân sự chỉ tải khi mở form').toHaveLength(0);
    await app.openCreate();
    await app.tid('field-assignee').click();
    await expect(page.getByTestId('person-option').first()).toBeVisible();
    const ids = await page.getByTestId('person-option').evaluateAll((els) => els.map((e) => e.getAttribute('data-person-id')));
    expect(ids.sort()).toEqual(PEOPLE.filter((p) => p.status === 'ACTIVE').map((p) => p.id).sort());
    const req = personnelLists()[0].body;
    expect(req.filters).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'status', op: '=', params: 'ACTIVE' })]));

    await app.typeInPeopleSearch('tuan');
    await expect(page.getByTestId('person-option').filter({ visible: true })).toHaveCount(1);
    await expect(page.locator(`[data-testid="person-option"][data-person-id="${P.TUAN}"]`)).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(app.tid('field-assignee')).toContainText(NAME[P.TUAN]);
  });

  test('AC10 mô tả rich-text: toolbar In đậm + Danh sách chấm → HTML ngữ nghĩa sạch (<strong>, <ul><li>)', async ({ app, mock, page }) => {
    await app.openReady();
    await app.openCreate();
    await expect(app.tid('rte-toolbar')).toBeVisible();
    for (const b of ['bold', 'italic', 'underline', 'strike', 'code', 'h1', 'h2', 'h3', 'ul', 'ol', 'quote', 'link', 'undo', 'redo'])
      await expect(app.tid(`rte-${b}`), `nút rte-${b}`).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Mô tả' })).toBeVisible();
    await app.tid('field-title').fill('Việc có mô tả định dạng');
    await app.focusDesc();
    await page.keyboard.type('Ưu tiên ');
    await app.rte('bold');
    await page.keyboard.type('quan trọng');
    await app.rte('bold');
    await page.keyboard.type(' trong tuần');
    await page.keyboard.press('Enter');
    await app.settle();
    await app.rte('ul');
    await page.keyboard.type('Mục một');
    await page.keyboard.press('Enter');
    await app.settle();
    await page.keyboard.type('Mục hai');
    await app.settle();
    await app.tid('form-submit').click();
    await expect.poll(() => mock.creates().length).toBe(1);
    const html = normalizeHtml(mock.creates()[0].body.data.description);
    expect(html).toContain('<strong>quan trọng</strong>');
    expect(html).toMatch(/<p>Ưu tiên <strong>quan trọng<\/strong> trong tuần<\/p>/);
    expect(html).toMatch(/<ul><li>(<p>)?Mục một(<\/p>)?<\/li><li>(<p>)?Mục hai(<\/p>)?<\/li><\/ul>/);
    expect(html, 'không class/style/data-* riêng của Plate').not.toMatch(/\s(class|style|data-[\w-]+)=/);
  });

  test('AC10 mô tả: phím tắt Ctrl/Cmd+B/I và gõ tắt Markdown ("- ", "# ")', async ({ app, mock, page }) => {
    await app.openReady();
    await app.openCreate();
    await app.tid('field-title').fill('Việc dùng phím tắt');
    await app.focusDesc();
    await page.keyboard.type('# Tiêu đề lớn');
    await page.keyboard.press('Enter');
    await app.settle();
    await page.keyboard.press('ControlOrMeta+b');
    await page.keyboard.type('đậm');
    await page.keyboard.press('ControlOrMeta+b');
    await page.keyboard.type(' và ');
    await page.keyboard.press('ControlOrMeta+i');
    await page.keyboard.type('nghiêng');
    await page.keyboard.press('ControlOrMeta+i');
    await page.keyboard.press('Enter');
    await app.settle();
    await page.keyboard.type('- Gạch đầu dòng');
    await app.settle();
    await app.tid('form-submit').click();
    await expect.poll(() => mock.creates().length).toBe(1);
    const html = normalizeHtml(mock.creates()[0].body.data.description);
    expect(html).toContain('<h1>Tiêu đề lớn</h1>');
    expect(html).toContain('<strong>đậm</strong>');
    expect(html).toContain('<em>nghiêng</em>');
    expect(html).toMatch(/<ul><li>(<p>)?Gạch đầu dòng(<\/p>)?<\/li><\/ul>/);
  });

  test('AC10 việc mới bị bộ lọc hiện tại ẩn → tự nới bộ lọc để hiện', async ({ app, mock }) => {
    await app.openReady();
    await app.quick('done');
    await app.due('overdue');
    await app.search('không khớp gì cả');
    await app.openCreate();
    await app.tid('field-title').fill('Việc mới cần thấy ngay');
    await app.pickDate(app.tid('field-due-date'), '2026-10-03');
    await app.tid('form-submit').click();
    await expect.poll(() => mock.creates().length).toBe(1);
    const newId = mock.creates()[0].response.data.id as string;
    await expect(app.item(newId)).toBeVisible();
  });

  test('AC10 tiêu đề quá 255 ký tự không được gửi lên server', async ({ app, mock, page }) => {
    await app.openReady();
    await app.openCreate();
    await app.tid('field-title').fill('a'.repeat(300));
    await app.tid('form-submit').click();
    await page.waitForTimeout(800);
    for (const c of mock.creates()) expect(c.body.data.subject.length).toBeLessThanOrEqual(255);
  });
});

test.describe('AC10 sau 17:00 hạn mặc định là ngày mai', () => {
  test.use({ now: vn(2026, 10, 1, 18, 0) });
  test('AC10 18:00 → hạn mặc định 02/10 17:00', async ({ app }) => {
    await app.openReady();
    await app.openCreate();
    await expect(app.tid('field-due-date')).toContainText('02/10/2026');
    await expect(app.tid('field-due-time')).toContainText('17:00');
  });
});

test.describe('AC10 bố cục form ở 375px', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  test('AC10 popup hẹp: các ô thuộc tính xếp 1 cột theo thứ tự', async ({ app, page }) => {
    await app.openReady();
    await app.openCreate();
    const ids = ['field-status', 'field-priority', 'field-due-date', 'field-reporter', 'field-assignee'];
    // Đo cùng một thời điểm (không cuộn giữa chừng) để so sánh vị trí tương đối.
    const rects = await page.evaluate((list) =>
      list.map((id) => {
        const r = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
        return { x: r.x, y: r.y };
      }), ids);
    for (let i = 1; i < ids.length; i++) expect(rects[i].y, `${ids[i]} nằm dưới ${ids[i - 1]}`).toBeGreaterThan(rects[i - 1].y);
    for (const i of [1, 3, 4]) expect(Math.abs(rects[i].x - rects[0].x), `${ids[i]}: một cột, cùng lề trái`).toBeLessThan(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  });
});

// Chọn trạng thái khác "Mới" khi tạo chỉ có được khi Workspace không có quy trình trạng thái (CONTRACT mục 4);
// ca có quy trình (form tạo chỉ "Mới") ở ac26-status-flow.spec.ts.
test.describe('AC10 tạo công việc — Workspace không có quy trình', () => {
  test.use({ transitionRule: 'none' });

  test('AC10 tạo thành công → gửi đủ 7 field đúng kiểu, đọc lại record, hiện trong danh sách', async ({ app, mock, page }) => {
    await app.openReady();
    await app.openCreate();
    await app.tid('field-title').fill('Chuẩn bị báo cáo tuần');
    await app.typeDescription(['Dòng 1', 'Dòng <2>']);
    await expect.poll(() => app.descText(), { message: 'editor hiện đúng nội dung vừa gõ' }).toBe('Dòng 1\nDòng <2>');
    await app.pickDate(app.tid('field-due-date'), '2026-10-03');
    await app.pickTime(app.tid('field-due-time'), '09:30');
    await app.pickPriority('urgent');
    await chooseOption(page, app.tid('field-status'), 'Đang xử lý');
    await expect.poll(() => app.descText(), { message: 'mô tả vẫn còn sau khi chọn ngày/giờ/ưu tiên/trạng thái' }).toBe('Dòng 1\nDòng <2>');
    await app.tid('form-submit').click();

    await expect.poll(() => mock.creates().length).toBe(1);
    const c = mock.creates()[0];
    expect(c.headers['x-req-service']).toBe('10200');
    expect(c.body).toMatchObject({ workspace_id: WORKSPACE_ID, object_type: OBJECT_TYPE, client_time_zone: 'Asia/Saigon' });
    const d = c.body.data;
    expect(d).toMatchObject({
      object_type: OBJECT_TYPE,
      workspace_id: WORKSPACE_ID,
      subject: 'Chuẩn bị báo cáo tuần',
      due_date: vn(2026, 10, 3, 9, 30),
      priority: 'urgent',
      status: 'in_progress',
      reporter: P.ME,
      assignee: P.ME,
    });
    expect(normalizeHtml(d.description)).toBe('<p>Dòng 1</p><p>Dòng &lt;2&gt;</p>');
    expect(d).not.toHaveProperty('ccs');
    expect(d).not.toHaveProperty('project');

    const newId = c.response.data.id as string;
    await expect.poll(() => mock.readById(newId).length, { message: 'phải đọc lại record vừa tạo theo id' }).toBeGreaterThan(0);
    await expect(app.dialog()).toBeHidden();
    await expect(app.item(newId)).toBeVisible();
    await expect(app.inItem(newId, 'task-title')).toContainText('Chuẩn bị báo cáo tuần');
    await expect(app.item(newId)).toHaveAttribute('data-status', 'in_progress');
    expect(mock.violations).toEqual([]);
  });
});

/**
 * CONTRACT mục 5 điểm 2 + mục 4 "Ghi dữ liệu" (2026-10-04, bố cục 2026-10-08): form tạo có ô "Người theo dõi" (`field-ccs`,
 * chọn nhiều) cùng hàng với Người giao / Người được giao, rộng bằng ô Người giao; trống hiện "Mặc định của Workspace" và KHÔNG gửi `ccs` (Workspace tự áp người theo dõi mặc
 * định); có chọn → gửi `ccs` = mảng ID. Form sửa không có hàng này.
 */
test.describe('AC10 Người theo dõi khi tạo', () => {
  test('AC10 ô "Người theo dõi": trống "Mặc định của Workspace", cùng hàng và rộng bằng ô Người giao, sau Người được giao; để trống → không gửi ccs (Workspace áp mặc định)', async ({ app, mock }) => {
    await app.openReady();
    await app.openCreate();
    const ccs = app.tid('field-ccs');
    await expect(ccs).toContainText('Mặc định của Workspace');
    await expect(ccs).toHaveAttribute('data-count', '0');
    await expect(app.form().getByText('Người theo dõi', { exact: true })).toBeVisible();
    const rp = (await app.tid('field-reporter').boundingBox())!;
    const as = (await app.tid('field-assignee').boundingBox())!;
    const cc = (await ccs.boundingBox())!;
    expect(Math.abs(cc.y - rp.y), 'cùng hàng với ô Người giao').toBeLessThanOrEqual(1);
    expect(cc.x, 'sau ô Người được giao').toBeGreaterThanOrEqual(as.x + as.width - 1);
    expect(Math.abs(cc.width - rp.width), 'rộng bằng ô Người giao').toBeLessThanOrEqual(1);

    await app.tid('field-title').fill('Việc không chọn người theo dõi');
    await app.tid('form-submit').click();
    await expect.poll(() => mock.taskCreates().length).toBe(1);
    const c = mock.taskCreates()[0];
    expect(c.body.data, 'trống → không gửi ccs').not.toHaveProperty('ccs');
    const id = c.response.data.id as string;
    expect(mock.task(id)?.ccs, 'Workspace tự áp người theo dõi mặc định').toEqual([P.HOA]);
    expect(mock.violations).toEqual([]);
  });

  test('AC10 chọn 2 người theo dõi (ô chọn nhiều, tick giữ danh sách mở) → 10200 có ccs = mảng ID; đọc lại / popup xem khớp; form sửa không có hàng này', async ({ app, mock, page }) => {
    await app.openReady();
    await app.openCreate();
    await app.tid('field-title').fill('Việc có người theo dõi');
    await app.tid('field-ccs').click();
    await expect(app.personOption(P.ME), 'danh sách có cả tôi').toBeVisible();
    await app.personOption(P.LAN).click();
    await expect(app.personOption(P.LAN), 'tick không đóng danh sách').toHaveAttribute('data-checked', 'true');
    await app.personOption(P.MINH).click();
    await expect(app.personOption(P.MINH)).toHaveAttribute('data-checked', 'true');
    await page.keyboard.press('Escape');
    await expect(app.form(), 'Esc chỉ đóng danh sách').toBeVisible();
    await expect(app.tid('field-ccs')).toHaveAttribute('data-count', '2');
    await expect(app.tid('field-ccs')).toContainText(/\+1/);
    await expect(app.tid('field-ccs')).not.toContainText('Mặc định của Workspace');
    expect(mock.taskCreates(), 'chọn người chưa gửi gì').toHaveLength(0);

    await app.tid('form-submit').click();
    await expect.poll(() => mock.taskCreates().length).toBe(1);
    const c = mock.taskCreates()[0];
    expect([...c.body.data.ccs].sort(), 'ccs = mảng ID đã chọn').toEqual([P.LAN, P.MINH].sort());
    const id = c.response.data.id as string;
    await expect.poll(() => mock.readById(id).length).toBeGreaterThan(0);
    expect([...(mock.task(id)?.ccs ?? [])].sort(), 'không thêm người mặc định').toEqual([P.LAN, P.MINH].sort());
    await expect(app.dialog()).toBeHidden();

    await app.openTask(id);
    await expect(app.tid('view-ccs')).toHaveAttribute('data-count', '2');
    await app.tid('form-edit').click();
    await expect(app.form()).toBeVisible();
    await expect(app.tid('field-ccs'), 'form sửa không có hàng Người theo dõi').toHaveCount(0);
    expect(mock.violations).toEqual([]);
  });
});
