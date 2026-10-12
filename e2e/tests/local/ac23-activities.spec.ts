import { test, expect, LOCAL_URL } from '../../support/local/fixtures';
import {
  A,
  ACT_FILES,
  ACT_TASK,
  MANY_NOTES,
  manyNoteId,
  MENTION_TEXT,
  NAME,
  NOTE_IMAGE,
  P,
  T,
} from '../../support/local/dataset';
import type { FileMeta, InlineFileMeta, MockCogover, RecordedRequest } from '../../support/local/mock-api';
import {
  ACTIVITY_CONTENT_FIELD_ID,
  ACTIVITY_FIELDS,
  ACTIVITY_INLINE_FIELD_ID,
  ACTIVITY_OBJECT_TYPE,
  ACTIVITY_PAGE_SIZE,
  ACTIVITY_TYPE_LABEL,
  MSG,
  WORKSPACE_ID,
} from '../../support/model';
import { makePng } from '../../support/files';
import { descShape, googleDocsHtml, sameImageLink } from '../../support/paste';
import { clickAndGetDownload, type TaskApp } from '../../support/ui';

/**
 * AC23 Activities (CONTRACT mục 4 "Activities", mục 5 điểm 3c — cập nhật 2026-10-03: ô soạn KHÔNG có Chủ đề,
 * focus ngay vào ô nội dung, request luôn gửi `name: ""`):
 *  - Popup xem tải timeline theo `Task` (15/lần, "Xem thêm"), mới nhất trên cùng; người tạo, nhãn loại,
 *    chủ đề (`name` nếu có), thời gian `HH:mm dd/MM[/yyyy]` (title đầy đủ), nội dung sanitize (ảnh
 *    `{resolution_size}` → `original`), file dạng chip tải về; rỗng / lỗi + Thử lại.
 *  - Thêm ghi chú: nội dung bắt buộc; dán ảnh → `_attachments` của activity; 10200 trên activity đúng field;
 *    ghi chú mới ở đầu, toast "Đã thêm ghi chú"; lỗi server giữ ô soạn; task chỉ theo dõi vẫn thêm được.
 */

const LOCAL_ORIGIN = new URL(LOCAL_URL).origin;
const asObj = (m: unknown) => (typeof m === 'string' ? JSON.parse(m) : m) as Record<string, any>;
const b64 = (b: Buffer) => b.toString('base64');
const HOUR = 3_600_000;

/** Năm hiện tại theo VN của bộ local (FIXED_NOW = 01/10/2026). */
const CURRENT_YEAR = 2026;
/** `HH:mm dd/MM` (+ `/yyyy` khi khác năm hiện tại) theo UTC+7. */
function actTime(ms: number) {
  const d = new Date(ms + 7 * HOUR);
  const p = (n: number) => String(n).padStart(2, '0');
  const base = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} ${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}`;
  return d.getUTCFullYear() === CURRENT_YEAR ? base : `${base}/${d.getUTCFullYear()}`;
}

/** Link ảnh trong ghi chú: `<origin>/files/0/<file_id>/original/<fileName>?redirect=true&long_text_field_id=OFDEMOACTCONT`. */
const noteImageSrc = (fileId: string, fileName: string) =>
  `${LOCAL_ORIGIN}/files/0/${fileId}/original/${encodeURIComponent(fileName)}?redirect=true&long_text_field_id=${ACTIVITY_CONTENT_FIELD_ID}`;

/** Tiêu đề mục "Hoạt động · N". */
const heading = (n: number) => new RegExp(`Hoạt động\\s*·\\s*${n}(?!\\d)`);

/** Mở popup xem và chờ timeline tải xong. */
async function openTimeline(app: TaskApp, taskId: string) {
  await app.openTask(taskId);
  await expect(app.tid('activities')).toBeVisible();
  await expect(app.tid('activities-loading')).toBeHidden({ timeout: 10_000 });
}

/** Mở ô soạn: không có ô Chủ đề, con trỏ ở ngay ô nội dung (chờ trình soạn mount). */
async function openComposer(app: TaskApp) {
  await app.tid('activity-add').click();
  await expect(app.tid('activity-composer')).toBeVisible();
  await expect(app.activityEditor(), 'trình soạn nội dung đã mount').toBeVisible({ timeout: 15_000 });
  await expect
    .poll(
      () => app.page.evaluate(() => !!document.activeElement?.closest('[data-testid="activity-content-editor"]')),
      { message: 'mở ô soạn → focus ngay vào ô nội dung' },
    )
    .toBe(true);
  await app.settleSelection();
}

/** Body tạo ghi chú đúng contract (data chỉ gồm các field cho phép). */
function expectNoteBody(req: RecordedRequest, taskId: string, opts: { withImages: boolean }) {
  expect(req.path).toBe('/api/v1/records');
  expect(req.headers['x-req-service']).toBe('10200');
  const b = req.body;
  expect(b.workspace_id).toBe(WORKSPACE_ID);
  expect(b.object_type, 'object_type activity').toBe(ACTIVITY_OBJECT_TYPE);
  const d = b.data;
  const keys = ['object_type', 'workspace_id', 'activity_type', 'note_type', 'name', 'content', 'Task', 'source_object', 'source_record', 'manual_log', 'activity_time'];
  if (opts.withImages) keys.push('_attachments');
  expect(Object.keys(d).sort(), 'data chỉ gồm field của contract').toEqual(keys.sort());
  expect(d).toMatchObject({
    object_type: ACTIVITY_OBJECT_TYPE,
    workspace_id: WORKSPACE_ID,
    activity_type: 'note',
    note_type: 'normal',
    name: '',
    Task: taskId,
    source_object: 'task',
    source_record: taskId,
    manual_log: 1,
  });
  expect(typeof d.activity_time, 'activity_time là số ms').toBe('number');
  expect(typeof d.content).toBe('string');
}

/** Phần tử `_attachments` = metadata upload giữ nguyên, `url` thêm long_text_field_id của field content (giữ %7Bresolution_size%7D). */
function expectActivityAttachment(sent: unknown, uploaded: InlineFileMeta) {
  const s = asObj(sent);
  const { url: sentUrl, ...sentRest } = s;
  const { url: upUrl, ...upRest } = uploaded;
  expect(sentRest, 'giữ nguyên các key metadata khác').toEqual(upRest);
  const u = new URL(sentUrl, LOCAL_ORIGIN);
  expect(u.searchParams.get('long_text_field_id'), 'url có long_text_field_id = field content của activity').toBe(ACTIVITY_CONTENT_FIELD_ID);
  expect(sentUrl, '{resolution_size} giữ dạng %7Bresolution_size%7D').toContain('%7Bresolution_size%7D');
  u.searchParams.delete('long_text_field_id');
  expect(decodeURIComponent(u.href), 'phần còn lại của url như server trả').toBe(decodeURIComponent(new URL(upUrl, LOCAL_ORIGIN).href));
}

/** Upload ảnh ghi chú đúng contract: multipart chỉ field_id/object_id của activity + file, CSRF, không x-req-*. */
function expectActivityUpload(mock: MockCogover, up: RecordedRequest, bytes: Buffer) {
  expect(up.path).toBe('/api/v1/file/upload/v2/client_upload');
  expect(up.headers['content-type'] ?? '').toMatch(/^multipart\/form-data/);
  expect(up.upload?.fields, 'chỉ field_id + object_id của activity').toEqual({
    field_id: ACTIVITY_INLINE_FIELD_ID,
    object_id: ACTIVITY_OBJECT_TYPE,
  });
  expect(up.headers['x-req-service']).toBeUndefined();
  expect(up.headers['x-req-type']).toBeUndefined();
  expect(up.headers['x-csrf-token']).toBe(mock.xsrf);
  expect(up.headers['x-xsrf-token']).toBe(mock.xsrf);
  expect(up.upload?.content?.equals(bytes), 'nội dung upload = ảnh đã dán').toBe(true);
}

const imgWidth = (img: import('@playwright/test').Locator) =>
  img.evaluate((el) => ((el as HTMLImageElement).complete ? (el as HTMLImageElement).naturalWidth : -1));

test.describe('AC23 timeline hoạt động', () => {
  test('AC23 timeline: request theo Task (type 1, fields, created desc, size 15); "Hoạt động · 4"; mới nhất trên cùng; người tạo / nhãn loại / chủ đề / thời gian / nội dung', async ({ app, mock, page }) => {
    await app.openReady();
    await openTimeline(app, ACT_TASK.MIXED);
    await expect(app.activityItems()).toHaveCount(4);
    await expect(app.tid('activities')).toContainText(heading(4));
    expect(await app.activityIds(), 'mới nhất (created) trên cùng').toEqual([A.NOTE_FULL, A.NOTE_PLAIN, A.TASK_FILES, A.CALL_OLD]);
    await expect(app.tid('activities-more'), '4 < 15 → không có "Xem thêm"').toHaveCount(0);

    const reqs = mock.activityLists(ACT_TASK.MIXED);
    expect(reqs.length).toBeGreaterThanOrEqual(1);
    for (const r of reqs) {
      expect(r.body).toMatchObject({ object_slug: 'activity', type: 1, logic_sequence: '', size: ACTIVITY_PAGE_SIZE });
      expect(r.body.filters).toEqual([{ field: 'Task', op: '=', params: ACT_TASK.MIXED, fieldType: 'lookup_normal' }]);
      expect(r.body.fields).toEqual(expect.arrayContaining(ACTIVITY_FIELDS));
      expect(r.body.sorts).toEqual([{ created: { order: 'desc' } }]);
      expect(r.body.search_after ?? []).toEqual([]);
    }

    // Ghi chú đủ thông tin.
    const full = app.activityItem(A.NOTE_FULL);
    await expect(full).toHaveAttribute('data-type', 'note');
    await expect(full).toContainText(NAME[P.LAN]);
    await expect(full).toContainText(ACTIVITY_TYPE_LABEL.note);
    await expect(full).toContainText('Chốt nội dung màn 2');
    await expect(full).toContainText(actTime(mock.activities.get(A.NOTE_FULL)!.created));
    await expect(full, 'cùng năm → không ghi năm').not.toContainText('30/09/2026');
    const titles = await full.locator('[title]').evaluateAll((els) => els.map((e) => e.getAttribute('title') ?? ''));
    expect(
      titles.some((t) => t.includes('2026') && t.includes('14:05') && /30/.test(t)),
      `title thời gian là ngày giờ đầy đủ (có: ${JSON.stringify(titles)})`,
    ).toBe(true);
    const content = full.getByTestId('activity-content');
    await expect(content).toContainText('Đã trao đổi với');
    await expect(content, 'mention hiển thị như chữ').toContainText(MENTION_TEXT);

    // Ghi chú không chủ đề, không activity_time → thời gian theo created.
    const plain = app.activityItem(A.NOTE_PLAIN);
    await expect(plain).toHaveAttribute('data-type', 'note');
    await expect(plain).toContainText(NAME[P.ME]);
    await expect(plain).toContainText(ACTIVITY_TYPE_LABEL.note);
    await expect(plain).toContainText(actTime(mock.activities.get(A.NOTE_PLAIN)!.created));
    await expect(plain.getByTestId('activity-content')).toHaveText('Ghi chú không có chủ đề.');
    await expect(plain).not.toContainText(/null|undefined/);

    // Loại "task": thời gian theo activity_time (16:30), không theo created (16:40).
    const taskAct = app.activityItem(A.TASK_FILES);
    await expect(taskAct).toHaveAttribute('data-type', 'task');
    await expect(taskAct).toContainText(ACTIVITY_TYPE_LABEL.task);
    await expect(taskAct).toContainText(NAME[P.MINH]);
    await expect(taskAct).toContainText('Gửi tài liệu tham khảo');
    await expect(taskAct).toContainText(actTime(mock.activities.get(A.TASK_FILES)!.activity_time!));
    await expect(taskAct).not.toContainText('16:40');

    // Loại "call" năm trước, name = null.
    const call = app.activityItem(A.CALL_OLD);
    await expect(call).toHaveAttribute('data-type', 'call');
    await expect(call).toContainText(ACTIVITY_TYPE_LABEL.call);
    await expect(call).toContainText(NAME[P.HOA]);
    await expect(call).toContainText('08:00 31/12/2025');
    await expect(call.getByTestId('activity-content')).toHaveText('Gọi điện xác nhận yêu cầu.');
    await expect(call).not.toContainText(/null|undefined/);

    // Không hiển thị PII của lookup created_by (email, số điện thoại…).
    await expect(app.tid('activities')).not.toContainText('@pii.invalid');
    await expect(app.tid('activities')).not.toContainText('+84 900');
    expect(mock.violations).toEqual([]);
  });

  test('AC23 nội dung sanitize: không chạy script/on*/iframe; ảnh {resolution_size} → original tải được đúng file', async ({ app, mock, page }) => {
    await app.openReady();
    await openTimeline(app, ACT_TASK.MIXED);
    const content = app.activityItem(A.NOTE_FULL).getByTestId('activity-content');
    await expect(content).toBeVisible();
    expect(await content.locator('script, iframe').count(), 'không có script/iframe').toBe(0);
    expect(await content.locator('[onclick], [onmouseover], [onerror]').count(), 'không còn thuộc tính on*').toBe(0);
    await content.getByText('bấm thử').hover();
    await content.getByText('bấm thử').click();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => [1, 2, 3].map((i) => (window as any)[`__actxss${i}`] ?? null))).toEqual([null, null, null]);

    const img = content.locator('img');
    await expect(img).toHaveCount(1);
    const src = (await img.getAttribute('src')) ?? '';
    expect(src, 'không còn placeholder').not.toMatch(/\{resolution_size\}|%7Bresolution_size%7D/i);
    const fileId = [...mock.fileStore.entries()].find(([, v]) => v.fileName === NOTE_IMAGE.fileName)![0];
    expect(src).toContain(`/files/0/${fileId}/original/`);
    await expect.poll(() => imgWidth(img), { message: 'ảnh hiển thị được (tải đúng file)' }).toBe(NOTE_IMAGE.width);
    expect(mock.fileGets.some((g) => g.fileId === fileId && g.size === 'original'), 'trình duyệt tải ảnh kích thước original').toBe(true);
  });

  test('AC23 file của hoạt động: chip tải về /files/<id>/original/<tên>?redirect=true (tab mới, rel noopener, download) đúng nội dung', async ({ app, mock, page }) => {
    await app.openReady();
    await openTimeline(app, ACT_TASK.MIXED);
    const item = app.activityItem(A.TASK_FILES);
    const files = (mock.activities.get(A.TASK_FILES)!.files ?? []).map(asObj) as FileMeta[];
    expect(files).toHaveLength(2);
    for (const f of files) {
      const link = item.locator(`a[href*="/files/${f.file_id}/original/"]`);
      await expect(link, `chip file ${f.fileName}`).toHaveCount(1);
      await expect(link).toContainText(f.fileName.replace(/\.[^.]+$/, '').slice(0, 10));
      const href = new URL((await link.getAttribute('href'))!, LOCAL_ORIGIN);
      expect(href.origin).toBe(LOCAL_ORIGIN);
      expect(decodeURIComponent(href.pathname)).toBe(`/files/${f.file_id}/original/${f.fileName}`);
      expect(href.searchParams.get('redirect')).toBe('true');
      await expect(link).toHaveAttribute('target', '_blank');
      const rel = (await link.getAttribute('rel')) ?? '';
      expect(rel).toContain('noopener');
      expect(rel).toContain('noreferrer');
      await expect(link).toHaveAttribute('download', f.fileName);
    }
    const pdf = files.find((f) => f.fileName === ACT_FILES.pdf.fileName)!;
    const pdfLink = item.locator(`a[href*="/files/${pdf.file_id}/original/"]`);
    const dl = await clickAndGetDownload(page, pdfLink);
    expect(dl, 'bấm chip → tải file').not.toBeNull();
    expect(dl!.suggestedFilename(), 'tên file tải về').toBe(pdf.fileName);
    // Giới hạn harness (như AC11 đính kèm): request của <a download> đi qua trình quản lý download, không qua route mock
    // → kiểm nội dung bằng fetch cùng href qua mock (giống server thật với ?redirect=true).
    const href = (await pdfLink.getAttribute('href')) ?? '';
    const got = await page.evaluate(async (h) => {
      const r = await fetch(h);
      return { status: r.status, text: await r.text(), ct: r.headers.get('content-type') };
    }, href);
    expect(got.status).toBe(200);
    expect(got.ct ?? '').toContain('application/octet-stream');
    expect(got.text, 'href trả đúng nội dung file').toBe(ACT_FILES.pdf.content);
    expect(mock.fileGets.at(-1), 'tải bằng ?redirect=true').toMatchObject({ fileId: pdf.file_id, redirect: true });
  });

  test('AC23 18 ghi chú: 15 mục đầu + "Xem thêm" → 18 mục (search_after nguyên văn), nút biến mất; "Hoạt động · 18"', async ({ app, mock }) => {
    await app.openReady();
    await openTimeline(app, ACT_TASK.MANY);
    await expect(app.activityItems()).toHaveCount(15);
    await expect(app.tid('activities')).toContainText(heading(MANY_NOTES));
    const desc = (from: number, to: number) => Array.from({ length: from - to + 1 }, (_, i) => manyNoteId(from - i));
    expect(await app.activityIds()).toEqual(desc(18, 4));
    const more = app.tid('activities-more');
    await expect(more).toBeVisible();
    await expect(more).toHaveText(/Xem thêm/);
    const first = mock.activityLists(ACT_TASK.MANY);
    expect(first).toHaveLength(1);

    await more.click();
    await expect(app.activityItems()).toHaveCount(18);
    expect(await app.activityIds(), 'trang sau nối tiếp, không trùng').toEqual(desc(18, 1));
    await expect(more).toHaveCount(0);
    const all = mock.activityLists(ACT_TASK.MANY);
    expect(all).toHaveLength(2);
    expect(all[1].body.search_after, 'trang sau gửi lại nguyên văn search_after').toEqual(first[0].response.data.search_after);
    expect(all[1].body.size).toBe(ACTIVITY_PAGE_SIZE);
    await expect(app.tid('activities')).toContainText(heading(MANY_NOTES));
    expect(mock.violations).toEqual([]);
  });

  test('AC23 task không có hoạt động → activities-empty "Chưa có hoạt động nào", vẫn có nút Thêm ghi chú', async ({ app }) => {
    await app.openReady();
    await openTimeline(app, ACT_TASK.NONE);
    await expect(app.tid('activities-empty')).toHaveText(MSG.activitiesEmpty);
    await expect(app.activityItems()).toHaveCount(0);
    await expect(app.tid('activities-more')).toHaveCount(0);
    await expect(app.tid('activity-add')).toBeVisible();
    await expect(app.tid('activity-add')).toHaveText(/Thêm ghi chú/);
  });

  test('AC23 activities-loading khi đang tải; lỗi → activities-error + activities-retry → Thử lại tải được', async ({ app, mock }) => {
    await app.openReady();
    const hold = mock.hold((r) => r.kind === 'list' && r.body?.object_slug === 'activity');
    await app.openTask(ACT_TASK.MIXED);
    await expect(app.tid('activities-loading')).toBeVisible();
    await expect(app.activityItems()).toHaveCount(0);
    hold.release();
    await expect(app.tid('activities-loading')).toBeHidden();
    await expect(app.activityItems()).toHaveCount(4);
    await app.tid('dialog-close').click();
    await expect(app.dialog()).toBeHidden();

    mock.failNext((r) => r.kind === 'list' && r.body?.object_slug === 'activity', { body: { r: 500, msg: 'Lỗi tải hoạt động (giả lập E2E)' } });
    await app.openTask(ACT_TASK.MANY);
    await expect(app.tid('activities-error')).toBeVisible();
    await expect(app.tid('activities-retry')).toBeVisible();
    await expect(app.activityItems()).toHaveCount(0);
    await expect(app.view(), 'lỗi timeline không làm hỏng popup').toContainText('Kiến trúc thông tin cho mục Thư viện');
    await app.tid('activities-retry').click();
    await expect(app.activityItems()).toHaveCount(15);
    await expect(app.tid('activities-error')).toBeHidden();
  });

  test('AC23 không tải timeline khi tạo hoặc sửa (chỉ ở popup xem)', async ({ app, mock, page }) => {
    await app.openReady();
    await app.openCreate();
    await page.waitForTimeout(600);
    expect(mock.activityLists(), 'form tạo không tải activity').toHaveLength(0);
    await expect(app.tid('activities')).toHaveCount(0);
    await app.tid('form-cancel').click();
    await expect(app.dialog()).toBeHidden();

    await openTimeline(app, ACT_TASK.MIXED);
    const n = mock.activityLists().length;
    await app.tid('form-edit').click();
    await expect(app.form()).toBeVisible();
    await page.waitForTimeout(600);
    expect(mock.activityLists(), 'chuyển sang sửa không tải activity').toHaveLength(n);
    await expect(app.tid('activity-composer')).toHaveCount(0);
  });
});

test.describe('AC23 thêm ghi chú', () => {
  test('AC23 ô soạn: không có Chủ đề, focus ngay ô nội dung (nhãn "Nội dung"); lưu khi trống → "Nhập nội dung ghi chú", không gửi; Huỷ đóng ô soạn', async ({ app, mock, page }) => {
    await app.openReady();
    await openTimeline(app, ACT_TASK.NONE);
    await openComposer(app);
    await expect(app.tid('activity-subject'), 'đã bỏ ô Chủ đề').toHaveCount(0);
    await expect(app.tid('activity-composer').locator('input'), 'ô soạn không có ô nhập nào ngoài nội dung').toHaveCount(0);
    await expect(app.activityEditor()).toHaveAccessibleName(/Nội dung/);
    await expect(app.tid('activity-submit')).toHaveText(MSG.activitySubmit);
    await app.tid('activity-submit').click();
    await expect(app.tid('activity-error')).toHaveText(MSG.activityContentRequired);
    // Chỉ khoảng trắng vẫn là trống.
    await app.focusActivityEditor();
    await page.keyboard.type('   ');
    await app.tid('activity-submit').click();
    await expect(app.tid('activity-error')).toHaveText(MSG.activityContentRequired);
    await page.waitForTimeout(400);
    expect(mock.activityCreates(), 'nội dung trống → không gửi').toHaveLength(0);
    await app.tid('activity-cancel').click();
    await expect(app.tid('activity-composer')).toBeHidden();
    await expect(app.dialog(), 'Huỷ ô soạn không đóng popup').toBeVisible();
    expect(mock.writes()).toHaveLength(0);
  });

  test('AC23 nội dung + ảnh dán (beforeinput insertFromPaste): upload _attachments của activity, khoá "Đang tải ảnh…"; lưu → "Đang lưu…", 10200 đúng field + _attachments; ghi chú mới ở đầu, đọc lại theo id, toast "Đã thêm ghi chú"', async ({ app, mock, page }) => {
    const png = makePng(18, 10, 5);
    await app.openReady();
    await openTimeline(app, ACT_TASK.MIXED);
    await expect(app.activityItems()).toHaveCount(4);
    await openComposer(app);
    // Gõ ngay (focus đã ở ô nội dung, không bấm thêm).
    await page.keyboard.type('Đã gửi báo giá cho khách');
    await expect.poll(() => app.activityEditorText()).toBe('Đã gửi báo giá cho khách');

    const holdUp = mock.hold((r) => r.kind === 'upload' && r.upload?.fields.field_id === ACTIVITY_INLINE_FIELD_ID);
    await app.pasteActivity({ files: [{ name: 'image.png', type: 'image/png', base64: b64(png) }] });
    const edImg = app.activityEditor().locator('img');
    await expect(edImg).toHaveCount(1);
    const submit = app.tid('activity-submit');
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveText(MSG.activityUploading);
    await expect.poll(() => mock.activityImageUploads().length).toBe(1);
    holdUp.release();
    await expect(submit).toBeEnabled();
    await expect(submit).toHaveText(MSG.activitySubmit);
    const up = mock.activityImageUploads()[0];
    expectActivityUpload(mock, up, png);
    const meta = up.response.data as InlineFileMeta;
    const want = noteImageSrc(meta.file_id, meta.fileName);
    await expect
      .poll(async () => sameImageLink((await edImg.getAttribute('src')) ?? '', want), { message: `src ảnh trong ô soạn = ${want}` })
      .toBe(true);
    await expect.poll(() => imgWidth(edImg), { message: 'ảnh trong ô soạn tải được' }).toBe(18);

    const holdCreate = mock.hold((r) => r.kind === 'create' && r.body?.object_type === ACTIVITY_OBJECT_TYPE);
    await submit.click();
    await expect(submit).toHaveText(MSG.activitySaving);
    await expect(submit).toBeDisabled();
    await expect.poll(() => mock.activityCreates().length).toBe(1);
    holdCreate.release();
    await expect(app.toast()).toContainText(MSG.noteAdded);

    const req = mock.activityCreates()[0];
    expectNoteBody(req, ACT_TASK.MIXED, { withImages: true });
    const d = req.body.data;
    const browserNow = await page.evaluate(() => Date.now());
    expect(Math.abs(d.activity_time - browserNow), 'activity_time = lúc lưu').toBeLessThan(10 * 60_000);
    const shape = await descShape(page, d.content);
    expect(shape.text).toContain('Đã gửi báo giá cho khách');
    expect(shape.imgSrcs).toHaveLength(1);
    expect(sameImageLink(shape.imgSrcs[0], want), `<img src> trong content = link ảnh (${shape.imgSrcs[0]})`).toBe(true);
    expect(shape.extraTags, 'content là HTML sạch').toEqual([]);
    expect(d._attachments).toHaveLength(1);
    expectActivityAttachment(d._attachments[0], meta);

    const newId = req.response.data.id as string;
    expect(mock.activityReadById(newId).length, 'tạo xong đọc lại record theo id').toBeGreaterThan(0);
    await expect(app.activityItems()).toHaveCount(5);
    expect((await app.activityIds())[0], 'ghi chú mới ở đầu timeline').toBe(newId);
    const item = app.activityItem(newId);
    await expect(item).toHaveAttribute('data-type', 'note');
    await expect(item).toContainText(NAME[P.ME]);
    await expect(item).toContainText(ACTIVITY_TYPE_LABEL.note);
    await expect(item.getByTestId('activity-content')).toContainText('Đã gửi báo giá cho khách');
    await expect.poll(() => imgWidth(item.getByTestId('activity-content').locator('img'))).toBe(18);
    await expect(app.tid('activities')).toContainText(heading(5));
    expect(await app.activityIds()).toEqual([newId, A.NOTE_FULL, A.NOTE_PLAIN, A.TASK_FILES, A.CALL_OLD]);
    expect(mock.updates(), 'thêm ghi chú không sửa task').toHaveLength(0);
    expect(mock.violations).toEqual([]);
  });

  test('AC23 chỉ nội dung (không ảnh) trên task chưa có hoạt động → name: "" (có key), không gửi _attachments; rỗng → 1 mục, "Hoạt động · 1"', async ({ app, mock, page }) => {
    await app.openReady();
    await openTimeline(app, ACT_TASK.NONE);
    await expect(app.tid('activities-empty')).toBeVisible();
    await openComposer(app);
    await page.keyboard.type('Khách hẹn gọi lại thứ Hai');
    await app.tid('activity-submit').click();
    await expect(app.toast()).toContainText(MSG.noteAdded);
    expect(mock.activityCreates()).toHaveLength(1);
    const req = mock.activityCreates()[0];
    expectNoteBody(req, ACT_TASK.NONE, { withImages: false });
    expect(req.body.data).toHaveProperty('name', '');
    expect(mock.activityImageUploads()).toHaveLength(0);
    const newId = req.response.data.id as string;
    await expect(app.activityItems()).toHaveCount(1);
    await expect(app.activityItem(newId)).toContainText('Khách hẹn gọi lại thứ Hai');
    await expect(app.tid('activities-empty')).toHaveCount(0);
    await expect(app.tid('activities')).toContainText(heading(1));
    expect(mock.violations).toEqual([]);
  });

  test('AC23 dán HTML định dạng (Google Docs) vào ô soạn → content giữ tiêu đề, đậm, danh sách lồng (như 3b)', async ({ app, mock, page }) => {
    await app.openReady();
    await openTimeline(app, ACT_TASK.NONE);
    await openComposer(app);
    await app.pasteActivity({ html: googleDocsHtml(), text: 'Kế hoạch quý 4' });
    await expect(app.activityEditor().locator('h1')).toHaveText('Kế hoạch quý 4');
    await app.tid('activity-submit').click();
    await expect.poll(() => mock.activityCreates().length).toBe(1);
    const shape = await descShape(page, mock.activityCreates()[0].body.data.content);
    expect(shape.h1).toEqual(['Kế hoạch quý 4']);
    expect(shape.h2).toEqual(['Việc cần làm']);
    expect(shape.strong, 'vỏ <b font-weight:normal> không làm đậm').toEqual(['chữ đậm', 'Mục B']);
    expect(shape.ulItems.map((i) => [i.text, i.depth])).toEqual([
      ['Mục A', 1],
      ['Mục A.1', 2],
      ['Mục B', 1],
    ]);
    expect(shape.olItems.map((i) => i.text)).toEqual(['Bước 1', 'Bước 2']);
    expect(shape.extraTags).toEqual([]);
    expect(shape.extraAttrs, 'không class/style/data-*').toEqual([]);
    await expect(app.toast()).toContainText(MSG.noteAdded);
  });

  test('AC23 lỗi server khi lưu → activity-error hiện msg, ô soạn giữ nguyên nội dung, không thêm mục; lưu lại thành công', async ({ app, mock, page, guard }) => {
    guard.allow(/console\.error/);
    await app.openReady();
    await openTimeline(app, ACT_TASK.MIXED);
    await openComposer(app);
    await page.keyboard.type('Ghi chú lưu lỗi lần đầu');
    mock.failNext((r) => r.kind === 'create' && r.body?.object_type === ACTIVITY_OBJECT_TYPE, {
      body: { r: 500, msg: 'Không lưu được ghi chú (giả lập E2E)' },
    });
    await app.tid('activity-submit').click();
    await expect(app.tid('activity-error')).toContainText('Không lưu được ghi chú (giả lập E2E)');
    await expect(app.tid('activity-composer')).toBeVisible();
    await expect.poll(() => app.activityEditorText()).toBe('Ghi chú lưu lỗi lần đầu');
    await expect(app.tid('activity-submit')).toBeEnabled();
    await expect(app.tid('activity-submit')).toHaveText(MSG.activitySubmit);
    await expect(app.activityItems()).toHaveCount(4);
    await expect(app.toast().filter({ hasText: MSG.noteAdded })).toHaveCount(0);

    await app.tid('activity-submit').click();
    await expect(app.toast()).toContainText(MSG.noteAdded);
    expect(mock.activityCreates()).toHaveLength(2);
    const newId = mock.activityCreates()[1].response.data.id as string;
    await expect(app.activityItems()).toHaveCount(5);
    expect((await app.activityIds())[0]).toBe(newId);
    await expect(app.activityItem(newId)).toContainText('Ghi chú lưu lỗi lần đầu');
  });

  test('AC23 task chỉ theo dõi: vẫn xem timeline và thêm ghi chú được (không ghi task)', async ({ app, mock, page }) => {
    await app.openReady();
    await app.setRoles(['cc']);
    await openTimeline(app, T.T5);
    await expect(app.dialog()).toContainText(MSG.readonlyNote);
    await expect(app.tid('activities-empty')).toBeVisible();
    await expect(app.tid('activity-add')).toBeEnabled();
    await openComposer(app);
    await page.keyboard.type('Người theo dõi để lại ghi chú');
    await app.tid('activity-submit').click();
    await expect(app.toast()).toContainText(MSG.noteAdded);
    expect(mock.activityCreates()).toHaveLength(1);
    expectNoteBody(mock.activityCreates()[0], T.T5, { withImages: false });
    await expect(app.activityItems()).toHaveCount(1);
    await expect(app.activityItems().first()).toContainText('Người theo dõi để lại ghi chú');
    expect(mock.updates(), 'không sửa task').toHaveLength(0);
    expect(mock.violations).toEqual([]);
  });
});
