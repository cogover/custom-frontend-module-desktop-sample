import { test, expect } from '../../support/local/fixtures';
import { NAME, P, T } from '../../support/local/dataset';
import type { MockCogover, RecordedRequest } from '../../support/local/mock-api';
import { MSG, OBJECT_TYPE, vn, WORKSPACE_ID } from '../../support/model';
import { chooseOption, selectedOptionLabel, type TaskApp } from '../../support/ui';

/**
 * AC24 Sửa nhanh trong popup xem (CONTRACT mục 5 điểm 3d, mục 4 "Ghi dữ liệu" — ccs ghi được):
 *  - view-status / view-priority / view-due-date + view-due-time / view-reporter / view-assignee / view-ccs là điều khiển,
 *    chọn xong lưu ngay: đúng 1 request 10201 chỉ chứa field đổi; thẻ cập nhật; toast "Đã lưu".
 *  - Lỗi → giá trị cũ + toast lỗi. Vi phạm quy tắc người giao/được giao → không gửi, toast.
 *  - view-ccs: tick không gửi ngay, đóng danh sách (Esc/bấm ra ngoài) gửi 1 lần nếu đổi; bỏ hết → null; Esc chỉ đóng danh sách.
 *  - Task chỉ theo dõi: không có các điều khiển.
 * Dữ liệu: T1 (người giao Lan, được giao tôi, Đang xử lý, Cao, hạn 01/10 23:30), T2 (tôi giao cho Minh), T8 (tôi/tôi, ccs rỗng), T5 (chỉ theo dõi).
 */

const VIEW_CONTROLS = ['view-status', 'view-priority', 'view-due-date', 'view-due-time', 'view-reporter', 'view-assignee', 'view-ccs'];

/** Request 10201 chỉ chứa field đổi (+ id/object_type/workspace_id). */
function expectOnly(req: RecordedRequest, id: string, changed: Record<string, unknown>) {
  const d = req.body.data;
  expect(req.headers['x-req-service']).toBe('10201');
  expect(req.body).toMatchObject({ workspace_id: WORKSPACE_ID, object_type: OBJECT_TYPE });
  expect(Object.keys(d).sort(), 'chỉ field đổi').toEqual(['id', 'object_type', 'workspace_id', ...Object.keys(changed)].sort());
  expect(d).toMatchObject({ id, object_type: OBJECT_TYPE, workspace_id: WORKSPACE_ID, ...changed });
}

/** Thực hiện một thay đổi và chờ đúng 1 request 10201 mới cho task; trả request đó. */
async function oneUpdate(mock: MockCogover, page: import('@playwright/test').Page, id: string, act: () => Promise<void>) {
  const before = mock.updates(id).length;
  await act();
  await expect.poll(() => mock.updates(id).length, { message: 'có request 10201' }).toBe(before + 1);
  await page.waitForTimeout(400);
  expect(mock.updates(id), 'đúng 1 request cho mỗi thay đổi').toHaveLength(before + 1);
  return mock.updates(id).at(-1)!;
}

async function openView(app: TaskApp, id: string) {
  await app.openTask(id);
  await expect(app.tid('view-status')).toBeVisible();
}

/** Bấm ra ngoài danh sách nhưng vẫn trong popup (dòng meta đầu popup). */
async function clickInsideDialogOutsideList(app: TaskApp) {
  const meta = app.dialog().getByTestId('task-meta');
  const box = (await meta.boundingBox())!;
  await app.page.mouse.click(box.x + 4, box.y + box.height / 2);
}

test.describe('AC24 sửa nhanh trong popup xem', () => {
  test('AC24 trạng thái (mở → mở): view-status là Select, chọn → 1 request {status}, thẻ cập nhật, toast "Đã lưu", popup vẫn mở; nút Sửa vẫn mở form đầy đủ', async ({ app, mock, page }) => {
    await app.openReady();
    await openView(app, T.T1);
    expect(await selectedOptionLabel(app.tid('view-status'))).toContain('Đang xử lý');
    const req = await oneUpdate(mock, page, T.T1, () => chooseOption(page, app.tid('view-status'), 'Đang chờ'));
    expectOnly(req, T.T1, { status: 'pending' });
    // soft: vẫn kiểm các ý sau (thẻ cập nhật, nút Sửa) khi thiếu toast.
    await expect.soft(app.toast(), 'đổi trạng thái (mở → mở) trong popup → toast "Đã lưu" (3d)').toContainText(MSG.saved);
    await expect(app.tid('view-status')).toContainText('Đang chờ');
    await expect(app.dialog()).toBeVisible();
    await expect(app.item(T.T1)).toHaveAttribute('data-status', 'pending');
    expect(mock.task(T.T1)!.status).toBe('pending');

    await app.tid('form-edit').click();
    await expect(app.form()).toBeVisible();
    await expect(app.tid('field-title')).toBeVisible();
    await expect(app.tid('field-desc')).toBeVisible({ timeout: 15_000 });
    await expect(app.tid('attach-button')).toBeVisible();
    expect(mock.violations).toEqual([]);
  });

  test('AC24 trạng thái sang nhóm xong (Đang xử lý → Đã xử lý) → 1 request {status: resolved}, toast; quy trình không có bước ngược → không Hoàn tác', async ({ app, mock, page }) => {
    await app.openReady();
    await openView(app, T.T1);
    const req = await oneUpdate(mock, page, T.T1, () => chooseOption(page, app.tid('view-status'), 'Đã xử lý'));
    expectOnly(req, T.T1, { status: 'resolved' });
    await expect(app.toast()).toBeVisible();
    await page.waitForTimeout(1200);
    await expect(app.tid('toast-undo'), 'resolved → in_progress không có trong quy trình').toHaveCount(0);
    expect(mock.updates(T.T1)).toHaveLength(1);
    expect(mock.violations).toEqual([]);
  });

  test('AC24 mức ưu tiên: view-priority → 1 request {priority}, thẻ hiện nhãn mới, toast "Đã lưu"', async ({ app, mock, page }) => {
    await app.openReady();
    await openView(app, T.T1);
    expect(await selectedOptionLabel(app.tid('view-priority'))).toContain('Cao');
    const req = await oneUpdate(mock, page, T.T1, () => chooseOption(page, app.tid('view-priority'), 'Khẩn cấp'));
    expectOnly(req, T.T1, { priority: 'urgent' });
    await expect(app.toast()).toContainText(MSG.saved);
    await expect(app.tid('view-priority')).toContainText('Khẩn cấp');
    await expect(app.inItem(T.T1, 'task-priority')).toContainText('Khẩn cấp');
    expect(mock.violations).toEqual([]);
  });

  test('AC24 hạn chót: view-due-date đổi ngày giữ giờ, view-due-time đổi giờ giữ ngày; mỗi lần 1 request {due_date}; thẻ cập nhật', async ({ app, mock, page }) => {
    await app.openReady();
    await openView(app, T.T1);
    await expect(app.tid('view-due-date')).toContainText('01/10/2026');
    await expect(app.tid('view-due-time')).toContainText('23:30');
    await expect(app.inItem(T.T1, 'task-due')).toContainText('Hôm nay');

    let req = await oneUpdate(mock, page, T.T1, () => app.pickDate(app.tid('view-due-date'), '2026-10-02'));
    expectOnly(req, T.T1, { due_date: vn(2026, 10, 2, 23, 30) });
    await expect(app.toast()).toContainText(MSG.saved);
    await expect(app.inItem(T.T1, 'task-due')).toContainText('Ngày mai');
    await expect(app.dialog()).toBeVisible();

    req = await oneUpdate(mock, page, T.T1, () => app.pickTime(app.tid('view-due-time'), '09:00'));
    expectOnly(req, T.T1, { due_date: vn(2026, 10, 2, 9, 0) });
    await expect(app.tid('view-due-date')).toContainText('02/10/2026');
    await expect(app.tid('view-due-time')).toContainText('09:00');
    expect(mock.task(T.T1)!.due_date).toBe(vn(2026, 10, 2, 9, 0));
    await expect(app.dialog()).toBeVisible();
    expect(mock.violations).toEqual([]);
  });

  test('AC24 người giao: view-reporter (Combobox) → 1 request {reporter}, ô Người giao trên thẻ cập nhật', async ({ app, mock, page }) => {
    await app.openReady();
    await openView(app, T.T1);
    await expect(app.tid('view-reporter')).toContainText(NAME[P.LAN]);
    const req = await oneUpdate(mock, page, T.T1, () => app.pickViewPerson('view-reporter', P.HA, 'ha'));
    expectOnly(req, T.T1, { reporter: P.HA });
    await expect(app.toast()).toContainText(MSG.saved);
    await expect(app.tid('view-reporter')).toContainText(NAME[P.HA]);
    await expect(app.dialog()).toBeVisible();
    const cell = app.inItem(T.T1, 'task-reporter');
    await expect
      .poll(() => cell.evaluate((el) => [el, ...el.querySelectorAll('*')].map((n) => n.getAttribute('aria-label') || n.getAttribute('title') || '').find(Boolean) ?? ''))
      .toBe(`Người giao: ${NAME[P.HA]}`);
  });

  test('AC24 người được giao: view-assignee trên task tôi vừa giao vừa được giao → 1 request {assignee}, không hỏi theo dõi (3g)', async ({ app, mock, page }) => {
    await app.openReady();
    await openView(app, T.T8);
    await expect(app.tid('view-assignee')).toContainText(NAME[P.ME]);
    const req = await oneUpdate(mock, page, T.T8, () => app.pickViewPerson('view-assignee', P.TUAN, 'tuan'));
    expectOnly(req, T.T8, { assignee: P.TUAN });
    await expect(app.tid('confirm-follow'), 'người được giao cũ là người giao → không hỏi').toHaveCount(0);
    await expect(app.toast()).toContainText(MSG.saved);
    await expect(app.tid('view-assignee')).toContainText(NAME[P.TUAN]);
    expect(mock.task(T.T8)!.assignee).toBe(P.TUAN);
  });

  // Đổi người được giao khi tôi đang được giao = giao lại (3g, ac30-hand-over.spec.ts); chỉ đổi người giao mới bị chặn.
  test('AC24 đổi người giao khiến tôi không còn là một trong hai → không gửi, toast "Bạn cần là người giao hoặc người được giao", giữ giá trị cũ', async ({ app, mock, page }) => {
    await app.openReady();
    // T2: tôi giao cho Minh → đổi người giao sang Hà.
    await app.setRoles(['reporter', 'assignee']);
    await openView(app, T.T2);
    await app.pickViewPerson('view-reporter', P.HA, 'ha');
    await expect(app.toast().filter({ hasText: MSG.peopleError })).toBeVisible();
    await page.waitForTimeout(500);
    expect(mock.updates(T.T2), 'không gửi request').toHaveLength(0);
    await expect(app.tid('view-reporter')).toContainText(NAME[P.ME]);
    expect(mock.task(T.T2)!.reporter).toBe(P.ME);
  });

  test('AC24 người theo dõi: tick nhiều người không gửi cho tới khi đóng danh sách; Esc chỉ đóng danh sách → 1 request ccs:[ids]; bỏ hết + bấm ra ngoài danh sách → ccs:null; mở/đóng không đổi → không gửi', async ({ app, mock, page }) => {
    await app.openReady();
    await openView(app, T.T8);
    const cc = app.tid('view-ccs');
    await expect(cc).toHaveAttribute('data-count', '0');
    await expect(cc).toContainText(MSG.noCcs);

    await cc.click();
    await expect(app.personOption(P.LAN)).toBeVisible();
    await expect(app.personOption(P.LAN)).toHaveAttribute('data-checked', 'false');
    await app.personOption(P.LAN).click();
    await expect(app.personOption(P.LAN)).toHaveAttribute('data-checked', 'true');
    await app.personOption(P.MINH).click();
    await expect(app.personOption(P.MINH)).toHaveAttribute('data-checked', 'true');
    await expect(app.personOption(P.LAN), 'tick không đóng danh sách').toBeVisible();
    await page.waitForTimeout(500);
    expect(mock.updates(T.T8), 'đang tick → chưa gửi').toHaveLength(0);

    let req = await oneUpdate(mock, page, T.T8, () => page.keyboard.press('Escape'));
    await expect(app.personOption(P.LAN), 'Esc đóng danh sách').toBeHidden();
    await expect(app.dialog(), 'Esc chỉ đóng danh sách, popup vẫn mở').toBeVisible();
    expectOnly(req, T.T8, { ccs: req.body.data.ccs });
    expect([...req.body.data.ccs].sort()).toEqual([P.LAN, P.MINH].sort());
    await expect(app.toast()).toContainText(MSG.saved);
    await expect(cc).toHaveAttribute('data-count', '2');
    await expect(cc).toContainText('+1');
    await expect(cc).toContainText(new RegExp(`${NAME[P.LAN]}|${NAME[P.MINH]}`));
    expect([...mock.task(T.T8)!.ccs].sort()).toEqual([P.LAN, P.MINH].sort());

    // Bỏ hết rồi bấm ra ngoài danh sách (vẫn trong popup) → ccs: null.
    await cc.click();
    await expect(app.personOption(P.LAN)).toHaveAttribute('data-checked', 'true');
    await expect(app.personOption(P.MINH)).toHaveAttribute('data-checked', 'true');
    await app.personOption(P.LAN).click();
    await app.personOption(P.MINH).click();
    await expect(app.personOption(P.MINH)).toHaveAttribute('data-checked', 'false');
    req = await oneUpdate(mock, page, T.T8, () => clickInsideDialogOutsideList(app));
    await expect(app.personOption(P.LAN)).toBeHidden();
    await expect(app.dialog()).toBeVisible();
    expectOnly(req, T.T8, { ccs: null });
    await expect(cc).toHaveAttribute('data-count', '0');
    await expect(cc).toContainText(MSG.noCcs);

    // Mở rồi đóng không đổi; tick rồi bỏ tick cùng một người → không gửi.
    await cc.click();
    await expect(app.personOption(P.LAN)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(app.personOption(P.LAN)).toBeHidden();
    await cc.click();
    await app.personOption(P.TUAN).click();
    await app.personOption(P.TUAN).click();
    await expect(app.personOption(P.TUAN)).toHaveAttribute('data-checked', 'false');
    await page.keyboard.press('Escape');
    await expect(app.personOption(P.TUAN)).toBeHidden();
    await page.waitForTimeout(600);
    expect(mock.updates(T.T8), 'không đổi → không gửi thêm').toHaveLength(2);
    await expect(app.dialog()).toBeVisible();
    expect(mock.violations).toEqual([]);
  });

  test('AC24 lỗi server → trả giá trị cũ + toast lỗi (ưu tiên và người theo dõi)', async ({ app, mock, page, guard }) => {
    guard.allow(/console\.error/);
    await app.openReady();
    await openView(app, T.T1);
    mock.failNext((r) => r.kind === 'update', { body: { r: 4031, msg: 'Không có quyền sửa (giả lập E2E)' } });
    await chooseOption(page, app.tid('view-priority'), 'Thấp');
    await expect(app.toast().filter({ hasText: 'Không có quyền sửa (giả lập E2E)' })).toBeVisible();
    await expect(app.tid('view-priority')).toContainText('Cao');
    await expect(app.inItem(T.T1, 'task-priority')).toContainText('Cao');
    expect(mock.task(T.T1)!.priority).toBe('high');

    // T1 có ccs = [Hoa]: bỏ Hoa, thêm Tuấn → lỗi → trở về [Hoa].
    const cc = app.tid('view-ccs');
    await expect(cc).toHaveAttribute('data-count', '1');
    await expect(cc).toContainText(NAME[P.HOA]);
    mock.failNext((r) => r.kind === 'update', { body: { r: 4031, msg: 'Không lưu được người theo dõi (giả lập E2E)' } });
    await cc.click();
    await expect(app.personOption(P.HOA)).toHaveAttribute('data-checked', 'true');
    await app.personOption(P.HOA).click();
    await app.personOption(P.TUAN).click();
    await page.keyboard.press('Escape');
    await expect(app.toast().filter({ hasText: 'Không lưu được người theo dõi (giả lập E2E)' })).toBeVisible();
    await expect(cc).toHaveAttribute('data-count', '1');
    await expect(cc).toContainText(NAME[P.HOA]);
    expect(mock.task(T.T1)!.ccs).toEqual([P.HOA]);
    await expect(app.dialog()).toBeVisible();
  });

  test('AC24 task chỉ theo dõi: không có điều khiển sửa nhanh, hiển thị tĩnh', async ({ app, mock, page }) => {
    await app.openReady();
    await app.setRoles(['cc']);
    await app.openTask(T.T5);
    await expect(app.dialog()).toContainText(MSG.readonlyNote);
    for (const id of VIEW_CONTROLS) await expect(app.tid(id), `${id} không có ở task chỉ theo dõi`).toHaveCount(0);
    await expect(app.view()).toContainText('Mới');
    await expect(app.view()).toContainText('Thấp');
    await expect(app.view()).toContainText(NAME[P.HA]);
    await expect(app.view()).toContainText(NAME[P.TUAN]);
    await page.waitForTimeout(300);
    expect(mock.updates()).toHaveLength(0);
  });
});

test.describe('AC24 sửa nhanh trong popup xem — Workspace không có quy trình', () => {
  test.use({ transitionRule: 'none' });

  test('AC24 trạng thái sang nhóm xong → 1 request {status: resolved} + toast Hoàn tác; Hoàn tác khôi phục trên server', async ({ app, mock, page }) => {
    await app.openReady();
    await openView(app, T.T8);
    const req = await oneUpdate(mock, page, T.T8, () => chooseOption(page, app.tid('view-status'), 'Đã xử lý'));
    expectOnly(req, T.T8, { status: 'resolved' });
    await expect(app.tid('toast-undo')).toBeVisible();
    await app.tid('toast-undo').click();
    await expect.poll(() => mock.task(T.T8)!.status, { message: 'Hoàn tác → server new' }).toBe('new');
    expectOnly(mock.updates(T.T8).at(-1)!, T.T8, { status: 'new' });
  });
});
