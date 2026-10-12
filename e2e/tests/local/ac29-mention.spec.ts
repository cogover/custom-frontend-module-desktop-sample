import type { Page } from '@playwright/test';
import { test, expect } from '../../support/local/fixtures';
import { A, ACCOUNT_EMAIL, NAME, P, T } from '../../support/local/dataset';
import type { MockCogover, RecordedRequest } from '../../support/local/mock-api';
import { ACTIVITY_OBJECT_TYPE, MENTION_SPAN_STYLE, MSG, OBJECT_TYPE } from '../../support/model';
import type { TaskApp } from '../../support/ui';

/**
 * AC29 @mention trong ghi chú (CONTRACT mục 5 điểm 3f). Gõ bằng bàn phím thật (keyboard.type), không qua API editor.
 * Dữ liệu nhân sự: tôi (D. Alex), Lan, Minh, Hà, Hoa, Nhân Viên Cũ có tài khoản; Tuấn không có tài khoản;
 * Nguyễn Văn Xoá đã xoá (deleted: 1). Danh sách @ = có tài khoản, không phải tôi, chưa xoá.
 */

const MENTIONABLE = [P.LAN, P.MINH, P.HA, P.HOA, P.OLD];
const LIKE_FIELDS = ['first_last_name', 'last_first_name', 'first_name', 'last_name', 'account_email'];
const MENTION_STYLE = MENTION_SPAN_STYLE;
const PLACEHOLDER = 'Viết ghi chú… (gõ @ để nhắc đến ai đó)';

const options = (page: Page) => page.getByTestId('mention-option');
const optionIds = (page: Page) => options(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-person-id') ?? ''));
const sorted = (a: string[]) => [...a].sort();
const pills = (app: TaskApp) => app.activityEditor().locator('.rte-mention');

async function openComposer(app: TaskApp, taskId: string) {
  await app.openTask(taskId);
  await expect(app.tid('activities-loading')).toBeHidden({ timeout: 10_000 });
  await app.tid('activity-add').click();
  await expect(app.activityEditor()).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(() => app.page.evaluate(() => !!document.activeElement?.closest('[data-testid="activity-content-editor"]')))
    .toBe(true);
  await app.settleSelection();
}

/** Chờ danh sách hiện đúng các người (không theo thứ tự). */
async function expectOptions(page: Page, ids: string[]) {
  await expect(page.getByTestId('mention-list')).toBeVisible();
  await expect.poll(() => optionIds(page).then(sorted), { message: 'danh sách @mention' }).toEqual(sorted(ids));
}

/** Request tìm cuối cùng có chuỗi tìm `q` ở cả 5 điều kiện like. */
function expectSearchBody(r: RecordedRequest, q: string, meId: string) {
  const b = r.body;
  expect(b).toMatchObject({ object_slug: 'personnel', type: 3, logic_sequence: '(1 OR 2 OR 3 OR 4 OR 5) AND 6 AND 7 AND 8', size: 8 });
  expect(sorted(b.fields), 'fields').toEqual(sorted(['id', 'first_name', 'last_name', 'account_email', 'avatar']));
  expect(b.filters).toHaveLength(8);
  const likes = b.filters.slice(0, 5);
  expect(sorted(likes.map((f: any) => f.field)), 'điều kiện 1–5: like theo tên/email').toEqual(sorted(LIKE_FIELDS));
  for (const f of likes) expect(f, `like ${f.field}`).toMatchObject({ op: 'like', params: q });
  const rest = b.filters.slice(5);
  const by = (field: string) => rest.find((f: any) => f.field === field);
  expect(by('account_email'), 'điều kiện: có tài khoản').toMatchObject({ op: 'not null' });
  expect(by('deleted'), 'điều kiện: chưa xoá').toMatchObject({ op: '!=' });
  expect(String(by('deleted').params)).toBe('1');
  expect(by('id'), 'điều kiện: không phải tôi').toMatchObject({ op: '!=', params: meId });
}

/** id phần tử option đang được chọn (aria-activedescendant của ô soạn → option aria-selected). */
async function activeOption(app: TaskApp): Promise<string | null> {
  return app.activityEditor().evaluate((ed) => {
    const id = ed.getAttribute('aria-activedescendant');
    const opt = id ? document.getElementById(id) : null;
    if (!opt || opt.getAttribute('aria-selected') !== 'true') return null;
    return opt.getAttribute('data-person-id');
  });
}

/** Span mention đúng mẫu Cogover (CONTRACT 3f) — phân tích bằng DOMParser của trình duyệt. */
async function mentionSpans(page: Page, html: string) {
  return page.evaluate((src) => {
    const doc = new DOMParser().parseFromString(`<body>${src}</body>`, 'text/html');
    return [...doc.body.querySelectorAll('span')].map((s) => ({
      attrs: Object.fromEntries(s.getAttributeNames().map((n) => [n, s.getAttribute(n)])),
      text: s.textContent ?? '',
    }));
  }, html);
}

function expectCogoverSpan(span: { attrs: Record<string, string | null>; text: string }, personId: string, taskId: string) {
  expect(span.attrs, `span mention của ${NAME[personId]}`).toEqual({
    contenteditable: 'false',
    'data-autocomplete-type': 'mention',
    'data-id': personId,
    'data-parent-object-id': OBJECT_TYPE,
    'data-parent-record-id': taskId,
    'data-redirect': `/o/task/${taskId}?layoutId=LODEMOLAYOUT1&activityId={record_id}`,
    'data-type': 'autocomplete',
    style: MENTION_STYLE,
  });
  expect(span.text).toBe(`@${NAME[personId]}`);
}

const searchesSince = (mock: MockCogover, seq: number) => mock.mentionSearches().filter((r) => r.seq > seq);
const lastSeq = (mock: MockCogover) => mock.requests.at(-1)?.seq ?? 0;

test.describe('AC29 @mention trong ghi chú', () => {
  test('AC29 gõ @ → danh sách (có tài khoản, không phải tôi, chưa xoá), body đúng contract; tìm theo tên không dấu, họ tên, email; ô soạn có aria-expanded/controls/activedescendant', async ({ app, mock, page }) => {
    await app.openReady();
    await openComposer(app, T.T8);
    await expect(app.tid('activity-composer').getByText(PLACEHOLDER)).toBeVisible();

    let seq = lastSeq(mock);
    await page.keyboard.type('@');
    await expectOptions(page, MENTIONABLE);
    await expect(page.getByTestId('mention-list')).toHaveRole('listbox');
    await expect(page.getByTestId('mention-list')).toHaveAccessibleName('Nhắc đến nhân sự');
    const s1 = searchesSince(mock, seq);
    expect(s1.length).toBeGreaterThanOrEqual(1);
    expectSearchBody(s1.at(-1)!, '', P.ME);
    const lan = page.locator(`[data-testid="mention-option"][data-person-id="${P.LAN}"]`);
    await expect(lan).toContainText(NAME[P.LAN]);
    await expect(lan).toContainText(ACCOUNT_EMAIL[P.LAN]!);
    // ARIA của ô soạn khi danh sách mở.
    const ed = app.activityEditor();
    await expect(ed).toHaveAttribute('aria-expanded', 'true');
    const listId = await page.getByTestId('mention-list').getAttribute('id');
    expect(listId).toBeTruthy();
    await expect(ed).toHaveAttribute('aria-controls', listId!);
    await expect.poll(() => activeOption(app), { message: 'option đầu được chọn (aria-activedescendant)' }).toBe(await options(page).first().getAttribute('data-person-id'));

    // Tên không dấu: "nguyen" → Lan, Hoa (Tuấn không có tài khoản, Xoá đã xoá); gõ nhanh → chỉ tìm chuỗi cuối (chờ 150ms).
    seq = lastSeq(mock);
    await page.keyboard.type('nguyen');
    await expectOptions(page, [P.LAN, P.HOA]);
    const s2 = searchesSince(mock, seq);
    expectSearchBody(s2.at(-1)!, 'nguyen', P.ME);
    expect(s2.map((r) => r.body.filters[0].params).filter((q: string) => q !== 'nguyen'), 'không tìm chuỗi dở khi đang gõ nhanh').toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('mention-list')).toBeHidden();
    await expect(ed).not.toHaveAttribute('aria-expanded', 'true');

    // Email tài khoản.
    await page.keyboard.type(' @minh.tran');
    await expectOptions(page, [P.MINH]);
    await page.keyboard.press('Escape');
    // Tên + họ (first_last_name) và họ tên có dấu đủ 3 từ (last_first_name).
    await page.keyboard.type(' @lan nguyen');
    await expectOptions(page, [P.LAN]);
    await page.keyboard.press('Escape');
    await page.keyboard.type(' @Nguyễn Thị Lan');
    await expectOptions(page, [P.LAN]);
    expectSearchBody(mock.mentionSearches().at(-1)!, 'Nguyễn Thị Lan', P.ME);
    await page.keyboard.press('Escape');
    // Tuấn không có tài khoản → không có.
    await page.keyboard.type(' @tuan');
    await expect(page.getByTestId('mention-empty')).toBeVisible();
    expect(await options(page).count()).toBe(0);
    await expect(app.dialog()).toBeVisible();
    expect(mock.violations).toEqual([]);
  });

  test('AC29 ↑/↓ chọn vòng; Enter, Tab, bấm chuột chèn pill .rte-mention (+ khoảng trắng); Backspace xoá cả pill; lưu → content đúng span Cogover (không data-mentioned); timeline hiện pill', async ({ app, mock, page }) => {
    await app.openReady();
    await openComposer(app, T.T8);
    await page.keyboard.type('Gửi @nguyen');
    await expectOptions(page, [P.LAN, P.HOA]);
    const order = await optionIds(page);
    expect(await activeOption(app)).toBe(order[0]);
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => activeOption(app)).toBe(order[1]);
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => activeOption(app), { message: '↓ ở cuối → về đầu' }).toBe(order[0]);
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => activeOption(app), { message: '↑ ở đầu → về cuối' }).toBe(order[1]);
    const first = order[1];
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('mention-list')).toBeHidden();
    await expect(pills(app)).toHaveCount(1);
    await expect(pills(app).first()).toHaveAttribute('data-person-id', first);
    await expect(pills(app).first()).toContainText(NAME[first]);
    await expect(app.activityEditor(), 'đã thay "@nguyen"').not.toContainText('@nguyen');

    // Tab chèn (khoảng trắng sau pill đã có sẵn).
    await page.keyboard.type('và @min');
    await expectOptions(page, [P.MINH]);
    await page.keyboard.press('Tab');
    await expect(pills(app)).toHaveCount(2);
    await expect(pills(app).nth(1)).toHaveAttribute('data-person-id', P.MINH);
    await expect(app.activityEditor(), 'Tab chèn, không chuyển focus').toBeFocused();

    // Bấm chuột chèn.
    await page.keyboard.type('cùng @le thu');
    await expectOptions(page, [P.HA]);
    await page.locator(`[data-testid="mention-option"][data-person-id="${P.HA}"]`).click();
    await expect(pills(app)).toHaveCount(3);
    await expect(pills(app).nth(2)).toHaveAttribute('data-person-id', P.HA);

    // Backspace xoá cả khối pill (sau khi xoá khoảng trắng đi kèm).
    await app.activityEditor().focus();
    await page.keyboard.type('@lan');
    await expectOptions(page, [P.LAN]);
    await page.keyboard.press('Enter');
    await expect(pills(app)).toHaveCount(4);
    await app.settleSelection();
    await page.keyboard.press('Backspace');
    await app.settleSelection();
    await page.keyboard.press('Backspace');
    await expect(pills(app), 'Backspace xoá cả pill').toHaveCount(3);
    await page.keyboard.type('xem giúp');
    await expect.poll(() => app.activityEditorText()).toMatch(/xem giúp$/);

    await app.tid('activity-submit').click();
    await expect(app.toast()).toContainText(MSG.noteAdded);
    const req = mock.activityCreates().at(-1)!;
    expect(req.body.object_type).toBe(ACTIVITY_OBJECT_TYPE);
    const html: string = req.body.data.content;
    expect(html, 'không gửi data-mentioned cho mention mới').not.toContain('data-mentioned');
    expect(html, 'data-redirect giữ &amp; như trình soạn Cogover').toContain(
      `data-redirect="/o/task/${T.T8}?layoutId=LODEMOLAYOUT1&amp;activityId={record_id}"`,
    );
    const spans = await mentionSpans(page, html);
    expect(spans.map((s) => s.attrs['data-id']), 'chỉ còn 3 span mention theo thứ tự').toEqual([first, P.MINH, P.HA]);
    for (const s of spans) expectCogoverSpan(s, s.attrs['data-id']!, T.T8);
    const text = await page.evaluate((src) => new DOMParser().parseFromString(`<body>${src}</body>`, 'text/html').body.textContent ?? '', html);
    expect(text.replace(/\s+/g, ' ').trim()).toBe(`Gửi @${NAME[first]} và @${NAME[P.MINH]} cùng @${NAME[P.HA]} xem giúp`);

    // Timeline: pill [data-autocomplete-type="mention"], chỉ giữ thuộc tính đó.
    const newId = req.response.data.id as string;
    const shown = app.activityItem(newId).getByTestId('activity-content').locator('[data-autocomplete-type="mention"]');
    await expect(shown).toHaveCount(3);
    await expect(shown.nth(1)).toHaveText(`@${NAME[P.MINH]}`);
    expect(await shown.first().evaluate((el) => el.getAttributeNames())).toEqual(['data-autocomplete-type']);
    expect(mock.violations).toEqual([]);
  });

  test('AC29 Esc chỉ đóng danh sách (popup, ô soạn còn); gõ tiếp cùng @ vẫn đóng; @ mới mở lại; @ dính sau chữ không mở', async ({ app, mock, page }) => {
    await app.openReady();
    await openComposer(app, T.T8);
    await page.keyboard.type('@lan');
    await expectOptions(page, [P.LAN]);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('mention-popover').or(page.getByTestId('mention-list'))).toHaveCount(0);
    await expect(app.dialog(), 'Esc không đóng popup').toBeVisible();
    await expect(app.tid('activity-composer')).toBeVisible();
    await expect.poll(() => app.activityEditorText()).toBe('@lan');
    await page.keyboard.type('h');
    await page.waitForTimeout(400);
    await expect(page.getByTestId('mention-list'), 'cùng @ sau Esc vẫn đóng').toHaveCount(0);
    await page.keyboard.type(' @mi');
    await expectOptions(page, [P.MINH]);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('mention-list')).toHaveCount(0);

    // "@" ngay sau chữ (email gõ tay) không mở danh sách, không tìm.
    const seq = lastSeq(mock);
    await page.keyboard.type(' mail@lan');
    await page.waitForTimeout(500);
    await expect(page.getByTestId('mention-list')).toHaveCount(0);
    expect(searchesSince(mock, seq), '@ sau chữ không tìm').toHaveLength(0);
    // Sau ngoặc thì mở.
    await page.keyboard.type(' (@ha');
    await expect(page.getByTestId('mention-list')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(app.dialog()).toBeVisible();
  });

  test('AC29 không ai khớp → "Không tìm thấy nhân sự"; thêm từ vẫn không khớp → tự đóng; đang tìm lần đầu → "Đang tìm…"; lỗi → "Không tìm được nhân sự: <lỗi>"', async ({ app, mock, page, guard }) => {
    guard.allow(/console\.error/);
    await app.openReady();
    await openComposer(app, T.T8);
    await page.keyboard.type('@zzz');
    await expect(page.getByTestId('mention-empty')).toHaveText('Không tìm thấy nhân sự');
    await expect(options(page)).toHaveCount(0);
    await page.keyboard.type(' qq');
    await expect(page.getByTestId('mention-empty'), 'đã có khoảng trắng mà không ai khớp → tự đóng').toHaveCount(0);
    await expect(page.getByTestId('mention-popover')).toHaveCount(0);

    const hold = mock.hold((r) => r.kind === 'list' && r.body?.object_slug === 'personnel' && r.body?.type === 3);
    await page.keyboard.type(' @');
    await expect(page.getByTestId('mention-loading')).toHaveText('Đang tìm…');
    hold.release();
    await expectOptions(page, MENTIONABLE);
    await page.keyboard.press('Escape');

    mock.failNext((r) => r.kind === 'list' && r.body?.object_slug === 'personnel' && r.body?.type === 3, {
      body: { r: 500, msg: 'Lỗi tìm nhân sự (giả lập E2E)' },
    });
    await page.keyboard.type(' @lan');
    await expect(page.getByTestId('mention-error')).toHaveText('Không tìm được nhân sự: Lỗi tìm nhân sự (giả lập E2E)');
    await expect(app.dialog()).toBeVisible();
  });

  test('AC29 dán HTML có mention → chỉ lấy chữ (không pill, không span khi lưu)', async ({ app, mock, page }) => {
    await app.openReady();
    await openComposer(app, T.T8);
    await app.pasteActivity({
      html:
        `<p>Chào <span contenteditable="false" data-autocomplete-type="mention" data-id="${P.LAN}" data-type="autocomplete" ` +
        `style="${MENTION_STYLE}">@${NAME[P.LAN]}</span> nhé</p>`,
      text: `Chào @${NAME[P.LAN]} nhé`,
    });
    await expect.poll(() => app.activityEditorText()).toBe(`Chào @${NAME[P.LAN]} nhé`);
    await expect(pills(app)).toHaveCount(0);
    await app.tid('activity-submit').click();
    await expect(app.toast()).toContainText(MSG.noteAdded);
    const html: string = mock.activityCreates().at(-1)!.body.data.content;
    expect(await mentionSpans(page, html), 'không có span khi lưu').toEqual([]);
    expect(html).toContain(`Chào @${NAME[P.LAN]} nhé`);
  });

  test('AC29 timeline: mention có sẵn (CKEditor, class/data-id) hiện pill chỉ giữ data-autocomplete-type', async ({ app }) => {
    await app.openReady();
    await app.openTask(T.T1);
    const shown = app.activityItem(A.NOTE_FULL).getByTestId('activity-content').locator('[data-autocomplete-type="mention"]');
    await expect(shown).toHaveCount(1);
    await expect(shown).toHaveText('@Trần Quang Minh');
    expect(await shown.evaluate((el) => el.getAttributeNames())).toEqual(['data-autocomplete-type']);
  });
});

test.describe('AC29 ô Mô tả không có @mention', () => {
  test('AC29 form tạo và form sửa: gõ @ trong Mô tả không mở danh sách, không gửi request tìm', async ({ app, mock, page }) => {
    await app.openReady();
    await app.openCreate();
    await expect(app.descEditor()).toBeVisible({ timeout: 15_000 });
    await app.focusDesc();
    await page.keyboard.type('Nhờ @lan');
    await page.waitForTimeout(500);
    await expect(page.getByTestId('mention-list')).toHaveCount(0);
    await expect(page.getByTestId('mention-popover')).toHaveCount(0);
    await app.tid('form-cancel').click();

    await app.openTask(T.T3);
    await app.tid('form-edit').click();
    await expect(app.descEditor()).toBeVisible({ timeout: 15_000 });
    await app.caretEndOfFirstLine();
    await page.keyboard.type(' @min');
    await page.waitForTimeout(500);
    await expect(page.getByTestId('mention-list')).toHaveCount(0);
    expect(mock.mentionSearches(), 'ô Mô tả không gửi request tìm nhân sự').toHaveLength(0);
  });

  test('AC29 mô tả có span mention gốc (data-mentioned="true") không bị khoá; sửa chữ → mention giữ nguyên (không báo lại)', async ({ app, mock, page }) => {
    const span =
      `<span contenteditable="false" data-autocomplete-type="mention" data-id="${P.LAN}" data-parent-object-id="${OBJECT_TYPE}" ` +
      `data-parent-record-id="${T.T3}" data-redirect="/o/task/${T.T3}?layoutId=LODEMOLAYOUT1&amp;activityId={record_id}" data-type="autocomplete" ` +
      `data-mentioned="true" style="${MENTION_STYLE}">@${NAME[P.LAN]}</span>`;
    mock.task(T.T3)!.description = `<p>Nhờ ${span} xem lại</p>`;
    await app.openReady();
    await app.openTask(T.T3);
    await app.tid('form-edit').click();
    await expect(app.descEditor()).toBeVisible({ timeout: 15_000 });
    await expect(app.tid('field-desc-locked'), 'mention gốc không làm khoá mô tả').toBeHidden();
    await expect(app.descEditor()).toContainText(`@${NAME[P.LAN]}`);
    await app.caretEndOfFirstLine();
    await page.keyboard.type(' giúp');
    await app.tid('form-submit').click();
    await expect(app.view()).toBeVisible();
    await expect.poll(() => mock.updates(T.T3).length).toBe(1);
    const html: string = mock.updates(T.T3)[0].body.data.description;
    const spans = await mentionSpans(page, html);
    expect(spans).toHaveLength(1);
    expect(spans[0].attrs['data-id']).toBe(P.LAN);
    expect(spans[0].attrs['data-autocomplete-type']).toBe('mention');
    expect(spans[0].attrs['data-mentioned'], 'đã báo rồi → giữ data-mentioned').toBe('true');
    expect(spans[0].text).toBe(`@${NAME[P.LAN]}`);
    expect(html).toContain('giúp');
    expect(mock.mentionSearches()).toHaveLength(0);
  });
});
