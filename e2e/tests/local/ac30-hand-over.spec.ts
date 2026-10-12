import type { Page } from '@playwright/test';
import { test, expect } from '../../support/local/fixtures';
import { NAME, P, T } from '../../support/local/dataset';
import type { MockCogover, RecordedRequest } from '../../support/local/mock-api';
import { MSG, OBJECT_TYPE, WORKSPACE_ID } from '../../support/model';
import type { TaskApp } from '../../support/ui';

/**
 * AC30 Giao lại (CONTRACT mục 5 điểm 2, 3d, 3g — 2026-10-04).
 * Dữ liệu: T1 "Viết nội dung cho 4 màn hình onboarding" (Lan giao cho tôi, ccs [Hoa]);
 * T2 "Triển khai giao diện màn hình Trang chủ" (tôi giao cho Minh, ccs [Hoa]); T7 (Tuấn giao cho tôi, ccs [tôi, Hoa]);
 * T8 (tôi giao cho tôi, ccs []).
 * Hộp hỏi mở sau khi danh sách chọn người đóng hẳn → luôn chờ bằng expect.
 */

const SUBJECT = {
  [T.T1]: 'Viết nội dung cho 4 màn hình onboarding',
  [T.T2]: 'Triển khai giao diện màn hình Trang chủ',
  [T.T7]: 'Đối soát công nợ quý 3',
} as Record<string, string>;
const TITLE = 'Thêm vào người theo dõi?';
const NOT_IN_LIST = 'Nếu không, công việc sẽ không còn trong danh sách của bạn.';
const confirm = (app: TaskApp) => app.tid('confirm-follow');
const sortedCcs = (r: RecordedRequest) => [...(r.body.data.ccs ?? [])].sort();

/** Request 10201 chỉ chứa các field `changed` (+ id/object_type/workspace_id). */
function expectOnly(req: RecordedRequest, id: string, changed: string[]) {
  expect(req.headers['x-req-service']).toBe('10201');
  expect(req.body).toMatchObject({ workspace_id: WORKSPACE_ID, object_type: OBJECT_TYPE });
  expect(Object.keys(req.body.data).sort(), 'chỉ gửi field đổi').toEqual(['id', 'object_type', 'workspace_id', ...changed].sort());
  expect(req.body.data.id).toBe(id);
}

async function openView(app: TaskApp, id: string) {
  await app.openTask(id);
  await expect(app.tid('view-assignee')).toBeVisible();
}

/** Hộp hỏi mở, tiêu đề đúng, focus mặc định ở "Thêm vào theo dõi". */
async function expectConfirm(app: TaskApp, ...texts: string[]) {
  await expect(confirm(app)).toBeVisible();
  await expect(confirm(app)).toContainText(TITLE);
  for (const t of texts) await expect(confirm(app)).toContainText(t);
  await expect(app.tid('confirm-follow-yes')).toBeFocused();
  await expect(app.tid('confirm-follow-yes')).toHaveText(/Thêm vào theo dõi/);
  await expect(app.tid('confirm-follow-no')).toHaveText(/Không/);
  await expect(app.tid('confirm-follow-cancel')).toHaveText(/Huỷ/);
}

/**
 * Popup xem đang ở chế độ chỉ xem: không còn điều khiển sửa. `followOnly` = chỉ còn theo dõi → ghi chú
 * "Bạn chỉ theo dõi công việc này" (contract không quy định ghi chú khi không còn vai trò nào).
 */
async function expectReadonlyView(app: TaskApp, followOnly = false) {
  await expect(app.dialog()).toBeVisible();
  if (followOnly) await expect(app.dialog()).toContainText(MSG.readonlyNote);
  for (const id of ['view-status', 'view-priority', 'view-assignee', 'view-reporter', 'view-ccs', 'form-edit'])
    await expect(app.tid(id), `${id} không còn ở chế độ chỉ xem`).toHaveCount(0);
}

const noUpdateFor = async (mock: MockCogover, page: Page, id: string, n = 0) => {
  await page.waitForTimeout(500);
  expect(mock.updates(id), 'không gửi 10201').toHaveLength(n);
};

test.describe('AC30 giao lại trong popup xem', () => {
  test('AC30 tôi được giao đổi người được giao → hộp hỏi (focus Thêm vào theo dõi); Esc / Huỷ → không gửi gì, giữ người cũ, popup còn, focus về ô người được giao', async ({ app, mock, page }) => {
    await app.openReady();
    await openView(app, T.T1);
    await app.pickViewPerson('view-assignee', P.MINH, 'minh');
    await expectConfirm(app, `Bạn giao “${SUBJECT[T.T1]}” cho ${NAME[P.MINH]}.`, 'Thêm bạn vào người theo dõi để vẫn thấy công việc này?', NOT_IN_LIST);
    await page.keyboard.press('Escape');
    await expect(confirm(app)).toHaveCount(0);
    await expect(app.dialog(), 'Esc chỉ đóng hộp hỏi').toBeVisible();
    await expect(app.tid('view-assignee')).toContainText(NAME[P.ME]);
    await expect(app.tid('view-assignee'), 'focus về ô người được giao').toBeFocused();
    await noUpdateFor(mock, page, T.T1);

    await app.pickViewPerson('view-assignee', P.MINH, 'minh');
    await expect(confirm(app)).toBeVisible();
    await app.tid('confirm-follow-cancel').click();
    await expect(confirm(app)).toHaveCount(0);
    await expect(app.dialog()).toBeVisible();
    await expect(app.tid('view-assignee')).toContainText(NAME[P.ME]);
    await expect(app.tid('view-assignee'), 'Huỷ → focus về ô người được giao').toBeFocused();
    await noUpdateFor(mock, page, T.T1);
    expect(mock.task(T.T1)!.assignee).toBe(P.ME);
    await expect(app.item(T.T1)).toBeVisible();
  });

  test('AC30 Thêm vào theo dõi → đúng 1 request 10201 assignee + ccs (danh sách cũ + tôi); toast "Đã lưu"; popup chuyển chỉ xem', async ({ app, mock, page }) => {
    await app.openReady();
    await openView(app, T.T1);
    await app.pickViewPerson('view-assignee', P.MINH, 'minh');
    await expectConfirm(app);
    await app.tid('confirm-follow-yes').click();
    await expect.poll(() => mock.updates(T.T1).length).toBe(1);
    await page.waitForTimeout(500);
    expect(mock.updates(T.T1), 'một request duy nhất').toHaveLength(1);
    const req = mock.updates(T.T1)[0];
    expectOnly(req, T.T1, ['assignee', 'ccs']);
    expect(req.body.data.assignee).toBe(P.MINH);
    expect(sortedCcs(req), 'ccs = danh sách cũ (Hoa) + tôi').toEqual([P.HOA, P.ME].sort());
    await expect(app.toast()).toContainText(MSG.saved);
    await expectReadonlyView(app, true);
    expect(mock.task(T.T1)!.assignee).toBe(P.MINH);
    expect(mock.violations).toEqual([]);
  });

  test('AC30 Không → 10201 chỉ assignee (không ccs); thẻ rời danh sách; toast "Đã giao “…”. Việc này không còn trong danh sách của bạn."; popup còn ở chế độ chỉ xem', async ({ app, mock, page }) => {
    await app.openReady();
    await openView(app, T.T1);
    await app.pickViewPerson('view-assignee', P.MINH, 'minh');
    await expectConfirm(app);
    await app.tid('confirm-follow-no').click();
    await expect.poll(() => mock.updates(T.T1).length).toBe(1);
    const req = mock.updates(T.T1)[0];
    expectOnly(req, T.T1, ['assignee']);
    expect(req.body.data.assignee).toBe(P.MINH);
    await expect(app.toast()).toContainText(`Đã giao “${SUBJECT[T.T1]}”. Việc này không còn trong danh sách của bạn.`);
    await expect(app.item(T.T1), 'thẻ rời danh sách').toHaveCount(0, { timeout: 5000 });
    await expectReadonlyView(app);
    await noUpdateFor(mock, page, T.T1, 1);
  });

  test('AC30 tôi là người giao đổi người được giao → hỏi thêm người cũ "(người được giao trước)"; Thêm → assignee + ccs có người cũ; Không → chỉ assignee', async ({ app, mock, page }) => {
    await app.openReady();
    await app.setRoles(['reporter', 'assignee']);
    await openView(app, T.T2);
    await app.pickViewPerson('view-assignee', P.TUAN, 'tuan');
    await expectConfirm(app, `“${SUBJECT[T.T2]}” được giao lại cho ${NAME[P.TUAN]}. Thêm ${NAME[P.MINH]} (người được giao trước) vào người theo dõi?`);
    await expect(confirm(app), 'tôi vẫn là người giao → không có câu "không còn trong danh sách"').not.toContainText(NOT_IN_LIST);
    await app.tid('confirm-follow-yes').click();
    await expect.poll(() => mock.updates(T.T2).length).toBe(1);
    let req = mock.updates(T.T2)[0];
    expectOnly(req, T.T2, ['assignee', 'ccs']);
    expect(req.body.data.assignee).toBe(P.TUAN);
    expect(sortedCcs(req), 'ccs = Hoa + Minh (người được giao trước)').toEqual([P.HOA, P.MINH].sort());
    await expect(app.toast()).toContainText(MSG.saved);
    await expect(app.tid('view-assignee'), 'tôi vẫn là người giao → popup vẫn sửa được').toContainText(NAME[P.TUAN]);
    await expect(app.item(T.T2)).toBeVisible();

    // Đổi tiếp Tuấn → Lan: Tuấn chưa theo dõi → hỏi; Không → chỉ assignee.
    await app.pickViewPerson('view-assignee', P.LAN, 'lan');
    await expectConfirm(app, `Thêm ${NAME[P.TUAN]} (người được giao trước)`);
    await app.tid('confirm-follow-no').click();
    await expect.poll(() => mock.updates(T.T2).length).toBe(2);
    req = mock.updates(T.T2)[1];
    expectOnly(req, T.T2, ['assignee']);
    expect(req.body.data.assignee).toBe(P.LAN);
    await expect(app.toast()).toContainText(MSG.saved);
    await expect(app.item(T.T2)).toBeVisible();
    expect(mock.violations).toEqual([]);
  });

  test('AC30 không hỏi khi người cũ là người giao (tôi vừa giao vừa được giao) hoặc đã theo dõi', async ({ app, mock, page }) => {
    await app.openReady();
    // T8: tôi giao cho tôi → đổi người được giao, người cũ (tôi) là người giao → không hỏi.
    await openView(app, T.T8);
    await app.pickViewPerson('view-assignee', P.TUAN, 'tuan');
    await expect.poll(() => mock.updates(T.T8).length).toBe(1);
    await expect(confirm(app)).toHaveCount(0);
    expectOnly(mock.updates(T.T8)[0], T.T8, ['assignee']);
    await expect(app.toast()).toContainText(MSG.saved);
    await app.tid('dialog-close').click();

    // T7: tôi đã theo dõi → không hỏi; sau khi giao chỉ còn theo dõi → popup chỉ xem.
    await openView(app, T.T7);
    await app.pickViewPerson('view-assignee', P.LAN, 'lan');
    await expect.poll(() => mock.updates(T.T7).length).toBe(1);
    await page.waitForTimeout(400);
    await expect(confirm(app)).toHaveCount(0);
    expectOnly(mock.updates(T.T7)[0], T.T7, ['assignee']);
    expect(mock.updates(T.T7)[0].body.data.assignee).toBe(P.LAN);
    await expect(app.toast()).toContainText(MSG.saved);
    await expectReadonlyView(app, true);
  });

  test('AC30 đổi người giao làm tôi không còn vai trò → vẫn báo "Bạn cần là người giao hoặc người được giao", không gửi', async ({ app, mock, page }) => {
    await app.openReady();
    await app.setRoles(['reporter', 'assignee']);
    await openView(app, T.T2);
    await app.pickViewPerson('view-reporter', P.HA, 'ha');
    await expect(app.toast().filter({ hasText: MSG.peopleError })).toBeVisible();
    await expect(confirm(app)).toHaveCount(0);
    await noUpdateFor(mock, page, T.T2);
    await expect(app.tid('view-reporter')).toContainText(NAME[P.ME]);
  });
});

test.describe('AC30 giao lại trong form sửa', () => {
  test('AC30 form: đổi người được giao + Lưu → hỏi; Huỷ / Esc ở lại form, không gửi, focus về nút Lưu; Thêm → lưu assignee + ccs, toast "Đã lưu “…”", popup chỉ xem', async ({ app, mock, page }) => {
    await app.openReady();
    await openView(app, T.T1);
    await app.tid('form-edit').click();
    await expect(app.form()).toBeVisible();
    await app.pickPerson('field-assignee', P.MINH, 'minh');
    await expect(app.tid('field-assignee')).toContainText(NAME[P.MINH]);
    await app.tid('form-submit').click();
    await expectConfirm(app, `Bạn giao “${SUBJECT[T.T1]}” cho ${NAME[P.MINH]}.`, NOT_IN_LIST);
    await expect(app.tid('field-people-error'), 'giao lại không phải lỗi người').toHaveCount(0);

    await app.tid('confirm-follow-cancel').click();
    await expect(confirm(app)).toHaveCount(0);
    await expect(app.form(), 'Huỷ ở lại form').toBeVisible();
    // soft: vẫn kiểm các bước sau khi lệch focus (contract 3g: đóng hộp hỏi → focus về nút Lưu).
    await expect.soft(app.tid('form-submit'), 'Huỷ hộp hỏi trong form → focus về nút Lưu').toBeFocused();
    await noUpdateFor(mock, page, T.T1);

    await app.tid('form-submit').click();
    await expect(confirm(app)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(confirm(app)).toHaveCount(0);
    await expect(app.form(), 'Esc chỉ đóng hộp hỏi, vẫn ở form').toBeVisible();
    await expect.soft(app.tid('form-submit'), 'Esc hộp hỏi trong form → focus về nút Lưu').toBeFocused();
    await expect(app.tid('field-assignee')).toContainText(NAME[P.MINH]);
    await noUpdateFor(mock, page, T.T1);

    await app.tid('form-submit').click();
    await expectConfirm(app);
    await app.tid('confirm-follow-yes').click();
    await expect.poll(() => mock.updates(T.T1).length).toBe(1);
    await page.waitForTimeout(500);
    expect(mock.updates(T.T1)).toHaveLength(1);
    const req = mock.updates(T.T1)[0];
    expectOnly(req, T.T1, ['assignee', 'ccs']);
    expect(req.body.data.assignee).toBe(P.MINH);
    expect(sortedCcs(req)).toEqual([P.HOA, P.ME].sort());
    await expect(app.toast()).toContainText(`Đã lưu “${SUBJECT[T.T1]}”`);
    await expect(app.form()).toHaveCount(0);
    await expectReadonlyView(app, true);
    expect(mock.violations).toEqual([]);
  });

  test('AC30 form: Không → chỉ assignee; toast "Đã lưu “…”. Việc này không còn trong danh sách của bạn.", thẻ rời danh sách', async ({ app, mock }) => {
    await app.openReady();
    await openView(app, T.T1);
    await app.tid('form-edit').click();
    await app.pickPerson('field-assignee', P.MINH, 'minh');
    await app.tid('field-title').fill(`${SUBJECT[T.T1]} (bàn giao)`);
    await app.tid('form-submit').click();
    await expectConfirm(app);
    await app.tid('confirm-follow-no').click();
    await expect.poll(() => mock.updates(T.T1).length).toBe(1);
    const req = mock.updates(T.T1)[0];
    expectOnly(req, T.T1, ['assignee', 'subject']);
    expect(req.body.data).toMatchObject({ assignee: P.MINH, subject: `${SUBJECT[T.T1]} (bàn giao)` });
    await expect(app.toast()).toContainText(`Đã lưu “${SUBJECT[T.T1]} (bàn giao)”. Việc này không còn trong danh sách của bạn.`);
    await expect(app.item(T.T1)).toHaveCount(0, { timeout: 5000 });
    await expectReadonlyView(app);
  });

  test('AC30 form: đổi người giao làm tôi không còn vai trò → lỗi "Bạn cần là người giao hoặc người được giao", không hỏi, không gửi', async ({ app, mock, page }) => {
    await app.openReady();
    await app.setRoles(['reporter', 'assignee']);
    await openView(app, T.T2);
    await app.tid('form-edit').click();
    await app.pickPerson('field-reporter', P.HA, 'ha');
    await app.tid('form-submit').click();
    await expect(app.tid('field-people-error')).toContainText(MSG.peopleError);
    await expect(confirm(app)).toHaveCount(0);
    await noUpdateFor(mock, page, T.T2);
    await expect(app.form()).toBeVisible();
  });
});
