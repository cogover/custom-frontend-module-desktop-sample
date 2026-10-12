import type { Locator } from '@playwright/test';
import { test, expect } from '../../support/local/fixtures';
import { T } from '../../support/local/dataset';
import { WORKSPACE_STATUS_FLOWS, type StatusFlowStep } from '../../support/local/mock-api';
import { STATUSES, statusLabel, statusRefused } from '../../support/model';
import { checkboxTitle, chooseOption, isChecked, isDisabled, optionLabels, selectedOptionLabel } from '../../support/ui';

/**
 * AC26 Quy trình trạng thái (CONTRACT mục 4 "Quy trình trạng thái", 2026-10-03). Mock mặc định trả rule "Status"
 * như Workspace: tạo chỉ ở new; new→in_progress|cancelled; in_progress→pending|on_hold|resolved;
 * pending→in_progress|resolved|cancelled; on_hold→in_progress|cancelled; resolved→closed.
 * Dữ liệu: T8 Mới, T1/T7 Đang xử lý, T3 Đang chờ, T4 Tạm dừng, D1 Đã xử lý, D3 Đã huỷ.
 */

/** Nhãn lựa chọn mong đợi: hiện tại + các bước được phép, theo thứ tự danh sách trạng thái. */
function expectedChoices(current: string, flows: StatusFlowStep[] = WORKSPACE_STATUS_FLOWS) {
  const allowed = new Set([current, ...flows.filter((f) => f.from === current).map((f) => f.to)]);
  return STATUSES.filter((s) => allowed.has(s.slug)).map((s) => s.label);
}
const refused = statusRefused;

/**
 * Có nét đứt (border/outline dashed hoặc stroke-dasharray) trên ô tick nhìn thấy: chính phần tử, label bao ngoài
 * (input ẩn + ô vẽ bên cạnh) và các phần tử con.
 */
const looksDashed = (cb: Locator) =>
  cb.evaluate((el) => {
    const root = el.closest('label') ?? el.parentElement ?? el;
    return [el, root, ...root.querySelectorAll('*')].some((n) => {
      const cs = getComputedStyle(n);
      return cs.borderTopStyle === 'dashed' || cs.outlineStyle === 'dashed' || (cs.strokeDasharray && cs.strokeDasharray !== 'none');
    });
  });

async function expectLockedCheckbox(cb: Locator, from: string, to: string) {
  expect(await isDisabled(cb), `checkbox (${from}) phải khoá`).toBe(true);
  await expect.poll(() => checkboxTitle(cb), { message: 'title giải thích lý do' }).toBe(refused(from, to));
  // Contract: khoá = `disabled` + vẽ nét đứt, cả khi bỏ tick (ô đã tick) bị chặn.
  expect(await looksDashed(cb), `checkbox khoá (${from} → ${to}) vẽ nét đứt`).toBe(true);
}

test.describe('AC26 có quy trình (rule "Status" như Workspace)', () => {
  test('AC26 đọc rule 1 lần khi tải: GET ?objectSlug=task, cookie + CSRF, không x-req-*', async ({ app, mock }) => {
    await app.openReady();
    await expect.poll(() => mock.ruleReads().length).toBe(1);
    const r = mock.ruleReads()[0];
    expect(r.method).toBe('GET');
    expect(r.path).toBe('/api/v1/object_security/transition_rule');
    expect(r.query).toEqual({ objectSlug: 'task' });
    expect(r.headers['x-csrf-token']).toBe(mock.xsrf);
    expect(r.headers['x-xsrf-token']).toBe(mock.xsrf);
    expect(r.headers['x-req-service']).toBeUndefined();
    expect(r.headers['x-req-type']).toBeUndefined();
    await app.openTask(T.T1);
    await app.tid('dialog-close').click();
    await app.openCreate();
    await app.tid('form-cancel').click();
    expect(mock.ruleReads(), 'không đọc lại khi mở popup/form').toHaveLength(1);
    expect(mock.violations).toEqual([]);
  });

  test('AC26 Select trạng thái trên thẻ chỉ có trạng thái hiện tại + bước được phép (theo thứ tự danh sách)', async ({ app, page }) => {
    await app.openReady();
    for (const [id, cur] of [
      [T.T8, 'new'],
      [T.T1, 'in_progress'],
      [T.T3, 'pending'],
      [T.T4, 'on_hold'],
    ] as const) {
      expect(await optionLabels(page, app.inItem(id, 'task-status')), `thẻ ${statusLabel(cur)}`).toEqual(expectedChoices(cur));
      expect(await selectedOptionLabel(app.inItem(id, 'task-status'))).toContain(statusLabel(cur));
    }
    await app.quick('done');
    expect(await optionLabels(page, app.inItem(T.D1, 'task-status')), 'thẻ Đã xử lý').toEqual(expectedChoices('resolved'));
    // Đã huỷ không đi tiếp: chỉ còn chính nó (hoặc Select bị khoá).
    const cancelled = app.inItem(T.D3, 'task-status');
    if (!(await isDisabled(cancelled))) expect(await optionLabels(page, cancelled), 'thẻ Đã huỷ').toEqual(['Đã huỷ']);
  });

  test('AC26 popup xem (view-status) và form sửa (field-status) chỉ có hiện tại + bước được phép; form tạo chỉ "Mới"', async ({ app, mock, page }) => {
    await app.openReady();
    await app.openTask(T.T1);
    expect(await optionLabels(page, app.tid('view-status')), 'popup xem Đang xử lý').toEqual(expectedChoices('in_progress'));
    await app.tid('dialog-close').click();
    await app.openTask(T.T3);
    expect(await optionLabels(page, app.tid('view-status')), 'popup xem Đang chờ').toEqual(expectedChoices('pending'));
    await app.tid('form-edit').click();
    await expect(app.form()).toBeVisible();
    expect(await optionLabels(page, app.tid('field-status')), 'form sửa Đang chờ').toEqual(expectedChoices('pending'));
    // Lưu bước hợp lệ từ form sửa: Đang chờ → Đang xử lý.
    await chooseOption(page, app.tid('field-status'), 'Đang xử lý');
    await app.tid('form-submit').click();
    await expect(app.view()).toBeVisible();
    await expect.poll(() => mock.task(T.T3)?.status).toBe('in_progress');
    await app.tid('dialog-close').click();

    await app.openCreate();
    expect(await optionLabels(page, app.tid('field-status')), 'form tạo chỉ các trạng thái từ _initial').toEqual(['Mới']);
    expect(await selectedOptionLabel(app.tid('field-status'))).toContain('Mới');
    await app.tid('field-title').fill('Việc tạo theo quy trình');
    await app.tid('form-submit').click();
    await expect.poll(() => mock.creates().length).toBe(1);
    expect(mock.creates()[0].body.data.status).toBe('new');
    expect(mock.creates()[0].status, 'server nhận').toBe(200);
    expect(mock.violations).toEqual([]);
  });

  test('AC26 checkbox khoá + title lý do khi không được tick (Mới, Tạm dừng) — bấm không gửi request; Đang xử lý tick được, toast không có Hoàn tác', async ({ app, mock, page }) => {
    await app.openReady();
    await expectLockedCheckbox(app.inItem(T.T8, 'task-checkbox'), 'new', 'resolved');
    await expectLockedCheckbox(app.inItem(T.T4, 'task-checkbox'), 'on_hold', 'resolved');
    await app.inItem(T.T8, 'task-checkbox').click({ force: true }).catch(() => {});
    await app.inItem(T.T4, 'task-checkbox').click({ force: true }).catch(() => {});
    await page.waitForTimeout(800);
    expect(mock.updates(), 'checkbox khoá → không gửi request').toHaveLength(0);
    await expect(app.item(T.T8)).toHaveAttribute('data-status', 'new');
    expect(await isChecked(app.inItem(T.T8, 'task-checkbox'))).toBe(false);

    // Đang chờ → Đã xử lý được phép.
    expect(await isDisabled(app.inItem(T.T3, 'task-checkbox')), 'Đang chờ tick được').toBe(false);
    // Đang xử lý → Đã xử lý được phép.
    const cb = app.inItem(T.T1, 'task-checkbox');
    expect(await isDisabled(cb)).toBe(false);
    await cb.click();
    await expect.poll(() => mock.task(T.T1)?.status).toBe('resolved');
    await expect(app.item(T.T1)).toBeHidden({ timeout: 3000 });
    await expect(app.toast()).toBeVisible();
    await page.waitForTimeout(300);
    await expect(app.tid('toast-undo'), 'resolved → in_progress không có trong quy trình').toHaveCount(0);

    // Ở "Tất cả": bỏ tick (về trạng thái trước "Đang xử lý") không được phép → khoá + lý do.
    await app.quick('all');
    await expectLockedCheckbox(app.inItem(T.T1, 'task-checkbox'), 'resolved', 'in_progress');
    // Việc đã xong từ server (không có lịch sử) → bỏ tick về "Mới" không được phép.
    await expectLockedCheckbox(app.inItem(T.D1, 'task-checkbox'), 'resolved', 'new');
    expect(mock.updates()).toHaveLength(1);
    expect(mock.violations).toEqual([]);
  });

  test('AC26 Hoàn tác chỉ có khi bước ngược được phép: rule thêm resolved → pending → đổi Đang chờ → Đã xử lý có Hoàn tác, khôi phục server', async ({ app, mock, page }) => {
    mock.statusFlows = [...WORKSPACE_STATUS_FLOWS, { from: 'resolved', to: 'pending' }];
    await app.openReady();
    await chooseOption(page, app.inItem(T.T3, 'task-status'), 'Đã xử lý');
    await expect.poll(() => mock.task(T.T3)?.status).toBe('resolved');
    await expect(app.item(T.T3)).toBeHidden({ timeout: 3000 });
    await app.tid('toast-undo').click();
    await expect.poll(() => mock.task(T.T3)?.status, { message: 'Hoàn tác resolved → pending' }).toBe('pending');
    await expect(app.item(T.T3)).toHaveAttribute('data-status', 'pending');

    // Cùng loại thay đổi nhưng bước ngược không có (in_progress → resolved, resolved ↛ in_progress) → không Hoàn tác.
    await chooseOption(page, app.inItem(T.T1, 'task-status'), 'Đã xử lý');
    await expect.poll(() => mock.task(T.T1)?.status).toBe('resolved');
    await expect(app.item(T.T1)).toBeHidden({ timeout: 3000 });
    await expect(app.toast()).toContainText('Viết nội dung cho 4 màn hình onboarding');
    await expect(app.tid('toast-undo')).toHaveCount(0);
    expect(mock.violations).toEqual([]);
  });

  test('AC26 rule đổi sau khi tải → server từ chối (422 r:48) → toast tiếng Việt, trả giá trị cũ (thẻ, popup xem, checkbox)', async ({ app, mock, page, guard }) => {
    guard.allow(/HTTP 422: POST \S+\/api\/v1\/records$/, /console\.error: Failed to load resource: the server responded with a status of 422/);
    await app.openReady();
    // Quản trị bỏ in_progress → pending và in_progress → resolved sau khi app đã đọc rule.
    mock.statusFlows = WORKSPACE_STATUS_FLOWS.filter((f) => !(f.from === 'in_progress' && (f.to === 'pending' || f.to === 'resolved')));

    await chooseOption(page, app.inItem(T.T1, 'task-status'), 'Đang chờ');
    await expect.poll(() => mock.updates(T.T1).length).toBe(1);
    expect(mock.updates(T.T1)[0].status).toBe(422);
    expect(mock.updates(T.T1)[0].response).toMatchObject({ r: 48 });
    await expect(app.toast().filter({ hasText: refused('in_progress', 'pending') })).toBeVisible();
    await expect(app.item(T.T1)).toHaveAttribute('data-status', 'in_progress');
    expect(await selectedOptionLabel(app.inItem(T.T1, 'task-status'))).toContain('Đang xử lý');
    expect(mock.task(T.T1)?.status).toBe('in_progress');

    // Checkbox: tick in_progress → resolved bị từ chối → bỏ tick lại.
    await app.inItem(T.T7, 'task-checkbox').click();
    await expect.poll(() => mock.updates(T.T7).length).toBe(1);
    await expect(app.toast().filter({ hasText: refused('in_progress', 'resolved') })).toBeVisible();
    await expect(app.item(T.T7)).toHaveAttribute('data-status', 'in_progress');
    await expect.poll(() => isChecked(app.inItem(T.T7, 'task-checkbox'))).toBe(false);
    await expect(app.item(T.T7)).toBeVisible();

    // Popup xem: view-status → bị từ chối → hiện lại giá trị cũ.
    await app.openTask(T.T1);
    await chooseOption(page, app.tid('view-status'), 'Đang chờ');
    await expect.poll(() => mock.updates(T.T1).length).toBe(2);
    await expect(app.toast().filter({ hasText: refused('in_progress', 'pending') })).toBeVisible();
    await expect(app.tid('view-status')).toContainText('Đang xử lý');
    await expect(app.dialog()).toBeVisible();
    expect(mock.task(T.T1)?.status).toBe('in_progress');
    expect(mock.violations, 'app gửi bước hợp lệ theo rule đã đọc').toEqual([]);
  });

  test('AC26 tạo khi rule đổi sau khi tải (500 r:-1 "not in transition rule") → thông báo tiếng Việt, form giữ nguyên, không thêm việc', async ({ app, mock, page, guard }) => {
    guard.allow(/HTTP 500: POST \S+\/api\/v1\/records$/, /console\.error: Failed to load resource: the server responded with a status of 500/);
    await app.openReady();
    const before = await app.visibleIds();
    mock.statusFlows = [{ from: '_initial', to: 'in_progress' }, ...WORKSPACE_STATUS_FLOWS.filter((f) => f.from !== '_initial')];
    await app.openCreate();
    await app.tid('field-title').fill('Việc tạo khi quy trình vừa đổi');
    await app.tid('form-submit').click();
    await expect.poll(() => mock.creates().length).toBe(1);
    expect(mock.creates()[0].status).toBe(500);
    await expect(page.getByText('Quy trình không cho phép trạng thái “Mới” ở bước này').first()).toBeVisible();
    await expect(app.form()).toBeVisible();
    await expect(app.tid('field-title')).toHaveValue('Việc tạo khi quy trình vừa đổi');
    await app.tid('form-cancel').click();
    await expect.poll(() => app.visibleIds()).toEqual(before);
    expect(mock.violations).toEqual([]);
  });
});

test.describe('AC26 không đọc được rule (GET 403)', () => {
  test.use({ transitionRule: 'forbidden' });

  test('AC26 GET rule 403 → đủ 7 trạng thái ở thẻ/popup/form tạo, checkbox không khoá, không báo phiên hết hạn', async ({ app, mock, page, guard }) => {
    guard.allow(
      /HTTP 403: GET \S+\/api\/v1\/object_security\/transition_rule$/,
      /console\.error: Failed to load resource: the server responded with a status of 403/,
    );
    await app.openReady();
    await expect.poll(() => mock.ruleReads().length).toBe(1);
    expect(mock.ruleReads()[0].status).toBe(403);
    await expect(app.tid('session-expired')).toHaveCount(0);
    await expect(app.tid('app-error')).toHaveCount(0);
    const all = STATUSES.map((s) => s.label);
    expect(await optionLabels(page, app.inItem(T.T8, 'task-status'))).toEqual(all);
    expect(await isDisabled(app.inItem(T.T8, 'task-checkbox')), 'không có rule → checkbox không khoá').toBe(false);
    await app.openTask(T.T4);
    expect(await optionLabels(page, app.tid('view-status'))).toEqual(all);
    await app.tid('dialog-close').click();
    await app.openCreate();
    expect(await optionLabels(page, app.tid('field-status'))).toEqual(all);
    await app.tid('form-cancel').click();
    await app.inItem(T.T8, 'task-checkbox').click();
    await expect.poll(() => mock.task(T.T8)?.status).toBe('resolved');
    await expect(app.tid('session-expired')).toHaveCount(0);
  });
});

test.describe('AC26 rule không áp được ở client', () => {
  test('AC26 Workspace không có rule (danh sách rỗng) → đủ 7 trạng thái', async ({ app, mock, page }) => {
    mock.statusFlows = null;
    await app.openReady();
    expect(await optionLabels(page, app.inItem(T.T4, 'task-status'))).toEqual(STATUSES.map((s) => s.label));
    expect(await isDisabled(app.inItem(T.T4, 'task-checkbox'))).toBe(false);
  });

  test('AC26 rule đang tắt (status ≠ 1) → bỏ qua, đủ 7 trạng thái', async ({ app, mock, page }) => {
    mock.ruleOverrides = { status: 0 };
    await app.openReady();
    expect(await optionLabels(page, app.inItem(T.T8, 'task-status'))).toEqual(STATUSES.map((s) => s.label));
  });

  test('AC26 rule shouldFilterRecord: true → app bỏ qua (để server kiểm), đủ 7 trạng thái', async ({ app, mock, page }) => {
    mock.ruleOverrides = { shouldFilterRecord: true };
    await app.openReady();
    expect(await optionLabels(page, app.inItem(T.T8, 'task-status'))).toEqual(STATUSES.map((s) => s.label));
    expect(await isDisabled(app.inItem(T.T8, 'task-checkbox'))).toBe(false);
  });
});
