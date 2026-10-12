import { test, expect } from '../../support/local/fixtures';
import {
  ASSIGNEE_DONE,
  ASSIGNEE_OPEN,
  CC_OPEN,
  DONE_IDS,
  NAME,
  OPEN_IDS,
  P,
  REPORTER_DONE,
  REPORTER_OPEN,
  T,
} from '../../support/local/dataset';
import { MockCogover, type RecordedRequest } from '../../support/local/mock-api';
import { MSG, ROLE_FILTER_LABEL, ROLE_LABEL } from '../../support/model';
import { controlLabel, expectSelected, type TaskApp } from '../../support/ui';

const union = (...lists: string[][]) => [...new Set(lists.flat())];
const doneReqs = (mock: MockCogover, after = 0) => mock.taskLists('done').filter((r) => r.seq > after);
const lastSeq = (mock: MockCogover) => mock.requests.at(-1)?.seq ?? 0;
const roleFields = (r: RecordedRequest) => MockCogover.roleFields(r);

/** "Tất cả" bật: chip role-filter-all tick, ba chip vai trò hiện không tick (CONTRACT mục 5 điểm 1, 2026-10-04). */
async function expectRolesAll(app: TaskApp) {
  await expectSelected(app.tid('role-filter-all'));
  for (const r of ['reporter', 'assignee', 'cc']) await expectSelected(app.tid(`role-filter-${r}`), false);
}

/** Nút "Đặt lại bộ lọc" trong panel (không phải nút của trạng thái rỗng). */
const panelReset = (app: TaskApp) =>
  app.page.getByRole('button', { name: 'Đặt lại bộ lọc', exact: true }).and(app.page.locator(':not([data-testid="empty-reset"])'));

test.describe('AC5 vai trò chọn nhiều', () => {
  test('AC5 mặc định chỉ tick "Giao cho tôi"; nhãn và thứ tự 4 chip (Tất cả / Tôi giao / Giao cho tôi / Tôi theo dõi)', async ({ app }) => {
    await app.openReady();
    await expectSelected(app.tid('role-filter-assignee'));
    await expectSelected(app.tid('role-filter-reporter'), false);
    await expectSelected(app.tid('role-filter-cc'), false);
    await expectSelected(app.tid('role-filter-all'), false);
    expect(await controlLabel(app.tid('role-filter-all')), 'nhãn role-filter-all').toBe('Tất cả');
    for (const [k, label] of Object.entries(ROLE_FILTER_LABEL))
      expect(await controlLabel(app.tid(`role-filter-${k}`)), `nhãn role-filter-${k}`).toContain(label);
    // Thứ tự hiển thị: Tất cả → Tôi giao → Giao cho tôi → Tôi theo dõi.
    const ys = await Promise.all(
      (['all', 'reporter', 'assignee', 'cc'] as const).map(async (r) => {
        const b = (await app.tid(`role-filter-${r}`).evaluate((el) => (el.closest('label') ?? el).getBoundingClientRect().toJSON()))!;
        return Math.round(b.y) * 10_000 + Math.round(b.x);
      }),
    );
    expect([...ys].sort((a, b) => a - b), 'thứ tự Tất cả / Tôi giao / Giao cho tôi / Tôi theo dõi').toEqual(ys);
    await app.expectIds(ASSIGNEE_OPEN);
  });

  test('AC5 tick/bỏ tick từng mục lọc theo OR', async ({ app }) => {
    await app.openReady();
    await app.toggleRole('reporter');
    await app.expectIds(union(ASSIGNEE_OPEN, REPORTER_OPEN));
    await app.toggleRole('assignee');
    await app.expectIds(REPORTER_OPEN);
    await app.toggleRole('cc');
    await app.expectIds(union(REPORTER_OPEN, CC_OPEN));
    await app.toggleRole('reporter');
    await app.expectIds(CC_OPEN);
    await app.toggleRole('assignee');
    await app.expectIds(union(ASSIGNEE_OPEN, CC_OPEN));
    // Tick đủ cả ba → thành "Tất cả".
    await app.toggleRole('reporter');
    await expectRolesAll(app);
    await app.expectIds(OPEN_IDS);
    await expect(app.item(T.X1), 'task ngoài phạm vi không bao giờ hiện').toHaveCount(0);
  });

  test('AC5 "Tất cả" = cả ba vai trò (chip không tick); từ "Tất cả" bấm một vai trò → chỉ vai trò đó; bỏ tick vai trò cuối → "Tất cả"; "Tất cả" tính là đang lọc, Đặt lại → mặc định', async ({ app, mock }) => {
    await app.openReady();
    let mark = lastSeq(mock);
    await app.ensurePanelOpen('role-filter-all');
    await app.tid('role-filter-all').click();
    await expectRolesAll(app);
    await app.expectIds(OPEN_IDS);
    await app.expectCounts({ open: OPEN_IDS.length, done: DONE_IDS.length, all: OPEN_IDS.length + DONE_IDS.length });
    const allDone = doneReqs(mock, mark);
    expect(allDone.length, '"Tất cả" → đếm lại đã xong').toBeGreaterThan(0);
    expect(roleFields(allDone.at(-1)!), 'đếm đã xong với cả ba vai trò').toEqual(['assignee', 'ccs', 'reporter']);
    await expect(panelReset(app), '"Tất cả" khác mặc định → đang lọc').toBeVisible();

    // Đang "Tất cả" bấm "Tôi theo dõi" → chỉ còn Tôi theo dõi.
    await app.toggleRole('cc');
    await expectSelected(app.tid('role-filter-all'), false);
    await expectSelected(app.tid('role-filter-cc'));
    await expectSelected(app.tid('role-filter-reporter'), false);
    await expectSelected(app.tid('role-filter-assignee'), false);
    await app.expectIds(CC_OPEN);

    // Bỏ tick vai trò cuối → về "Tất cả" (không còn trạng thái không tick gì).
    await app.toggleRole('cc');
    await expectRolesAll(app);
    await app.expectIds(OPEN_IDS);
    await expect(app.tid('empty-state')).toHaveCount(0);

    // Bấm "Tất cả" lần nữa vẫn là "Tất cả".
    await app.tid('role-filter-all').click();
    await expectRolesAll(app);

    // Đặt lại → mặc định chỉ "Giao cho tôi".
    mark = lastSeq(mock);
    await panelReset(app).click();
    await expectSelected(app.tid('role-filter-assignee'));
    await expectSelected(app.tid('role-filter-all'), false);
    await app.expectIds(ASSIGNEE_OPEN);
    expect(mock.violations).toEqual([]);
  });

  test('AC5 view cũ có roles: [] → rỗng "Chưa chọn vai trò nào", không gọi API đếm đã xong; Đặt lại về mặc định', async ({ app, mock, page }) => {
    await app.openReady();
    // View lưu trong localStorage dạng mảng `roles` (tìm theo nội dung, không phụ thuộc tên key) → giả lập view bản cũ.
    await app.toggleRole('reporter');
    const findKey = () =>
      page.evaluate(() => {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)!;
          try {
            const v = JSON.parse(localStorage.getItem(k) ?? '');
            if (v && typeof v === 'object' && Array.isArray(v.roles) && v.roles.length === 2) return k;
          } catch {
            /* không phải JSON */
          }
        }
        return '';
      });
    await expect.poll(findKey, { message: 'view trong localStorage có mảng roles' }).not.toBe('');
    const key = await findKey();
    await page.evaluate((k) => {
      const v = JSON.parse(localStorage.getItem(k)!);
      v.roles = [];
      localStorage.setItem(k, JSON.stringify(v));
    }, key);
    const before = lastSeq(mock);
    await page.reload();
    await expect(app.tid('empty-state')).toBeVisible({ timeout: 15_000 });
    await expect(app.tid('empty-state')).toContainText(MSG.noRoleTitle);
    await expect(app.tid('empty-state')).toContainText(MSG.noRoleSub);
    await app.expectIds([]);
    await app.expectCounts({ open: 0, all: 0, done: 0 });
    await app.page.waitForTimeout(500);
    expect(doneReqs(mock, before), 'không tick vai trò nào → không gọi API đã xong').toHaveLength(0);

    await expect(app.tid('empty-reset')).toBeVisible();
    await app.tid('empty-reset').click();
    await expectSelected(app.tid('role-filter-assignee'));
    await expectSelected(app.tid('role-filter-reporter'), false);
    await expectSelected(app.tid('role-filter-cc'), false);
    await expectSelected(app.tid('role-filter-all'), false);
    await app.expectIds(ASSIGNEE_OPEN);
  });

  test('AC5 đếm và tải "đã xong" gọi server chỉ với vai trò đang tick; đổi vai trò → tải lại từ đầu', async ({ app, mock }) => {
    await app.openReady();
    const first = doneReqs(mock);
    expect(first.length).toBeGreaterThan(0);
    for (const r of first) {
      expect(roleFields(r), 'mặc định chỉ lọc assignee').toEqual(['assignee']);
      expect(r.body.size).toBe(1);
    }
    await app.expectCounts({ done: ASSIGNEE_DONE.length });

    let mark = lastSeq(mock);
    await app.toggleRole('reporter');
    await app.expectCounts({ done: union(ASSIGNEE_DONE, REPORTER_DONE).length });
    const recount = doneReqs(mock, mark);
    expect(recount.length, 'đổi vai trò → đếm lại đã xong').toBeGreaterThan(0);
    expect(roleFields(recount.at(-1)!)).toEqual(['assignee', 'reporter']);

    await app.quick('done');
    await app.expectIds(union(ASSIGNEE_DONE, REPORTER_DONE));
    const page1 = doneReqs(mock).filter((r) => r.body.size > 1).at(-1)!;
    expect(roleFields(page1)).toEqual(['assignee', 'reporter']);

    mark = lastSeq(mock);
    await app.toggleRole('assignee');
    await app.expectIds(REPORTER_DONE);
    await expect(app.tid('done-progress')).toContainText(`${REPORTER_DONE.length}/${REPORTER_DONE.length}`);
    const reload = doneReqs(mock, mark).filter((r) => r.body.size > 1);
    expect(reload.length, 'đổi vai trò → tải lại trang đã xong').toBeGreaterThan(0);
    expect(roleFields(reload[0])).toEqual(['reporter']);
    expect(reload[0].body.search_after ?? [], 'tải lại từ đầu').toEqual([]);
    expect(mock.violations).toEqual([]);
  });

  test('AC5 refresh giữ lựa chọn vai trò', async ({ app, page }) => {
    await app.openReady();
    await app.setRoles(['reporter', 'cc']);
    await app.expectIds(union(REPORTER_OPEN, CC_OPEN));
    await page.reload();
    await app.ready();
    await expectSelected(app.tid('role-filter-reporter'));
    await expectSelected(app.tid('role-filter-cc'));
    await expectSelected(app.tid('role-filter-assignee'), false);
    await app.expectIds(union(REPORTER_OPEN, CC_OPEN));

    // "Tất cả" cũng được nhớ.
    await app.setRoles(['reporter', 'assignee', 'cc']);
    await page.reload();
    await app.ready();
    await expectRolesAll(app);
    await app.expectIds(OPEN_IDS);
  });

  test('AC5 tạo task không khớp vai trò đang tick → tự tick thêm vai trò của task', async ({ app, mock }) => {
    await app.openReady();
    await app.openCreate();
    await app.tid('field-title').fill('Giao cho Minh làm báo giá');
    await app.pickPerson('field-assignee', P.MINH, 'minh');
    await expect(app.tid('field-assignee')).toContainText(NAME[P.MINH]);
    await app.tid('form-submit').click();
    await expect.poll(() => mock.creates().length).toBe(1);
    const newId = mock.creates()[0].response.data.id as string;
    await expect(app.item(newId)).toBeVisible();
    await expectSelected(app.tid('role-filter-reporter'));
    await expectSelected(app.tid('role-filter-assignee'));
  });

  test('AC5 nhãn "Theo dõi" trên thẻ chỉ theo dõi', async ({ app }) => {
    await app.openReady();
    await app.setRoles(['reporter', 'assignee', 'cc']);
    await expect(app.inItem(T.T5, 'task-role')).toContainText(ROLE_LABEL.cc);
    const roleOfT2 = app.inItem(T.T2, 'task-role');
    if (await roleOfT2.count()) await expect(roleOfT2).not.toContainText(ROLE_LABEL.cc);
  });
});

/**
 * CONTRACT mục 5 điểm 1 (2026-10-04): "Tôi giao người khác" (`role-filter-delegated`) = tôi là người giao VÀ người được
 * giao không phải tôi; server `{assignee != $currentUser}` cùng `reporter = $currentUser`; nằm trong "Tôi giao" nên tick cả
 * hai thì chỉ hỏi `reporter`; "Tất cả" vẫn là ba vai trò. Chỉ test bằng mock (không giao việc cho người thật).
 */
const DELEGATED_OPEN = [T.T2];
const DELEGATED_DONE = [T.D2];
const NOT_ME = { field: 'assignee', op: '!=', params: '$currentUser', fieldType: 'lookup_normal' };
const IS_REPORTER = { field: 'reporter', op: '=', params: '$currentUser', fieldType: 'lookup_normal' };

test.describe('AC5 vai trò "Tôi giao người khác"', () => {
  test('AC5 chip "Tôi giao người khác" nằm giữa "Tôi giao" và "Giao cho tôi"; chỉ tick nó → việc tôi giao cho người khác; đếm / tải đã xong hỏi reporter = tôi AND assignee != tôi', async ({ app, mock }) => {
    await app.openReady();
    const chip = app.tid('role-filter-delegated');
    expect(await controlLabel(chip)).toContain('Tôi giao người khác');
    await expectSelected(chip, false);
    const pos = async (r: string) =>
      app.tid(`role-filter-${r}`).evaluate((el) => {
        const b = (el.closest('label') ?? el).getBoundingClientRect();
        return Math.round(b.y) * 10_000 + Math.round(b.x);
      });
    const order = [await pos('reporter'), await pos('delegated'), await pos('assignee')];
    expect([...order].sort((a, b) => a - b), 'thứ tự Tôi giao / Tôi giao người khác / Giao cho tôi').toEqual(order);

    let mark = lastSeq(mock);
    await chip.click();
    await expectSelected(chip);
    await app.expectIds(union(ASSIGNEE_OPEN, DELEGATED_OPEN));
    await app.toggleRole('assignee');
    await expectSelected(app.tid('role-filter-assignee'), false);
    await app.expectIds(DELEGATED_OPEN);
    await expect(app.inItem(T.T2, 'task-assignee')).toHaveAccessibleName(`Giao cho: ${NAME[P.MINH]}`);
    await app.expectCounts({ done: DELEGATED_DONE.length });
    const count = doneReqs(mock, mark).at(-1)!;
    expect(count.body.type, 'một vai trò (2 điều kiện) → type 1').toBe(1);
    expect(count.body.filters).toEqual(expect.arrayContaining([IS_REPORTER, NOT_ME]));
    expect(count.body.size).toBe(1);

    mark = lastSeq(mock);
    await app.quick('done');
    await app.expectIds(DELEGATED_DONE);
    const page1 = doneReqs(mock, mark).filter((r) => r.body.size > 1).at(-1)!;
    expect(page1.body.filters).toEqual(expect.arrayContaining([IS_REPORTER, NOT_ME]));
    // đang lọc → có nút đặt lại về mặc định
    await panelReset(app).click();
    await expectSelected(chip, false);
    await expectSelected(app.tid('role-filter-assignee'));
    expect(mock.violations).toEqual([]);
  });

  test('AC5 tick cả "Tôi giao" và "Tôi giao người khác" → chỉ hỏi reporter (không có assignee !=); "Giao cho tôi" + "Tôi giao người khác" → (assignee) OR (reporter AND assignee != tôi)', async ({ app, mock }) => {
    await app.openReady();
    await app.tid('role-filter-delegated').click();
    let mark = lastSeq(mock);
    await app.toggleRole('reporter');
    await app.expectIds(union(ASSIGNEE_OPEN, REPORTER_OPEN));
    await app.expectCounts({ done: union(ASSIGNEE_DONE, REPORTER_DONE).length });
    const both = doneReqs(mock, mark).at(-1)!;
    expect(both.body.filters, 'đã có "Tôi giao" thì không hỏi lại assignee !=').not.toContainEqual(NOT_ME);
    expect(roleFields(both)).toEqual(['assignee', 'reporter']);

    mark = lastSeq(mock);
    await app.toggleRole('reporter');
    await app.expectIds(union(ASSIGNEE_OPEN, DELEGATED_OPEN));
    await app.expectCounts({ done: union(ASSIGNEE_DONE, DELEGATED_DONE).length });
    const mixed = doneReqs(mock, mark).at(-1)!;
    expect(mixed.body.type).toBe(3);
    expect(mixed.body.filters).toEqual(expect.arrayContaining([IS_REPORTER, NOT_ME]));
    expect(mixed.body.logic_sequence.replace(/\s+/g, ' ')).toMatch(/^\(1 OR \(2 AND 3\)\) AND 4$/);
    expect(mock.violations).toEqual([]);
  });

  test('AC5 "Tất cả" vẫn là ba vai trò (chip "Tôi giao người khác" không tick); từ "Tất cả" bấm "Tôi giao người khác" → chỉ nó; refresh giữ lựa chọn', async ({ app, page }) => {
    await app.openReady();
    await app.tid('role-filter-all').click();
    await expectRolesAll(app);
    await expectSelected(app.tid('role-filter-delegated'), false);
    await app.expectIds(OPEN_IDS);

    await app.tid('role-filter-delegated').click();
    await expectSelected(app.tid('role-filter-all'), false);
    await expectSelected(app.tid('role-filter-delegated'));
    for (const r of ['reporter', 'assignee', 'cc']) await expectSelected(app.tid(`role-filter-${r}`), false);
    await app.expectIds(DELEGATED_OPEN);

    await page.reload();
    await app.ready();
    await expectSelected(app.tid('role-filter-delegated'));
    await expectSelected(app.tid('role-filter-assignee'), false);
    await app.expectIds(DELEGATED_OPEN);

    // bỏ tick vai trò cuối → "Tất cả"
    await app.tid('role-filter-delegated').click();
    await expectRolesAll(app);
    await app.expectIds(OPEN_IDS);
  });
});
