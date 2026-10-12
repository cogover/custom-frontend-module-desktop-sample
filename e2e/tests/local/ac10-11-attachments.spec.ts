import { test, expect } from '../../support/local/fixtures';
import { T } from '../../support/local/dataset';
import type { FileMeta, MockCogover } from '../../support/local/mock-api';
import { clickAndGetDownload, type TaskApp } from '../../support/ui';
import {
  chooseGeneratedFiles,
  MAX_FILE_BYTES,
  pendingErrorsMsg,
  sparseFile,
  TOO_LARGE_REASON,
  tooManyNote,
  typeNotAllowed,
} from '../../support/files';

/**
 * File đính kèm (contract mục 4 "File đính kèm" + mục 5 đoạn "File đính kèm", AC10/AC11/AC21).
 * Upload mock: POST /api/v1/file/upload/v2/client_upload (multipart, CSRF, không x-req-service/x-req-type);
 * đuôi ngoài `file_type` → HTTP 400 r:15 "file type not allowed"; ghi record > 10 file → HTTP 422 r:608.
 */

const txt = (name: string, text = 'Nội dung thử nghiệm E2E') => ({ name, mimeType: 'text/plain', buffer: Buffer.from(text) });
const pdf = (name: string, size = 2048) => ({ name, mimeType: 'application/pdf', buffer: Buffer.alloc(size, 1) });
/** File đuôi server không nhận (nội dung vô hại). */
const exe = (name: string) => ({ name, mimeType: 'application/x-msdownload', buffer: Buffer.from('E2E — không phải file thực thi') });
const txts = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => txt(`${prefix}-${i + 1}.txt`));
const asMeta = (f: FileMeta | string): FileMeta => (typeof f === 'string' ? JSON.parse(f) : f);
const ids = (list: unknown) => ((list as (FileMeta | string)[]) ?? []).map((f) => asMeta(f).file_id);

async function chooseFiles(app: TaskApp, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  await expect(app.tid('attach-button')).toBeVisible();
  await app.tid('attach-input').setInputFiles(files);
}

async function expectChipsDone(app: TaskApp, n: number) {
  await expect(app.page.getByTestId('attach-chip')).toHaveCount(n);
  await expect(app.page.locator('[data-testid="attach-chip"][data-state="done"]')).toHaveCount(n, { timeout: 10_000 });
}

const chips = (app: TaskApp, state?: 'uploading' | 'done' | 'error') =>
  app.page.locator(state ? `[data-testid="attach-chip"][data-state="${state}"]` : '[data-testid="attach-chip"]');

/** Response 400 của upload bị từ chối là dự kiến (trình duyệt log "Failed to load resource … 400"). */
function allowUpload400(guard: { allow: (...p: RegExp[]) => void }) {
  guard.allow(
    /^HTTP 400: POST \S+\/api\/v1\/file\/upload\/v2\/client_upload$/,
    /^console\.error: Failed to load resource: the server responded with a status of 400/,
  );
}

/** Link tải theo contract mục 4: /files/<file_id>/original/<fileName>?redirect=true, tab mới, noopener noreferrer, download. */
async function expectDownloadLink(link: import('@playwright/test').Locator, pageUrl: string, m: FileMeta) {
  const href = (await link.getAttribute('href')) ?? '';
  const u = new URL(href, pageUrl);
  expect(decodeURIComponent(u.pathname), `đường dẫn tải ${m.fileName}`).toBe(`/files/${m.file_id}/original/${m.fileName}`);
  expect(u.searchParams.get('redirect'), 'có ?redirect=true để server trả thẳng nội dung').toBe('true');
  await expect(link).toHaveAttribute('target', '_blank');
  const rel = (await link.getAttribute('rel')) ?? '';
  expect(rel).toContain('noopener');
  expect(rel).toContain('noreferrer');
  await expect(link).toHaveAttribute('download', m.fileName);
}

/** Gắn sẵn file cho task trong mock (một phần tử ở dạng chuỗi JSON để kiểm tra parse an toàn). */
function seedFiles(mock: MockCogover, id: string, names: string[]) {
  const metas = names.map((n) => mock.makeFileMeta(n, 1000));
  mock.task(id)!.attachment_files = metas.map((m, i) => (i === 1 ? JSON.stringify(m) : m));
  return metas;
}

test.describe('Đính kèm file', () => {
  test('AC10 đính kèm: tạo có 2 file → upload đúng contract, body attachment_files = 2 metadata; xem có link tải', async ({ app, mock }) => {
    await app.openReady();
    await app.openCreate();
    await app.tid('field-title').fill('Việc có đính kèm');
    await chooseFiles(app, [txt('bao-cao.txt'), pdf('Hợp đồng mẫu.pdf')]);
    await expectChipsDone(app, 2);
    await expect(app.page.getByTestId('attach-chip').filter({ hasText: 'bao-cao' })).toBeVisible();

    const ups = mock.uploads();
    expect(ups).toHaveLength(2);
    for (const u of ups) {
      expect(u.upload?.fields).toMatchObject({ field_slug: 'attachment_files', object_slug: 'task' });
      expect(u.headers['x-req-service'], 'upload không gửi x-req-service').toBeUndefined();
      expect(u.headers['x-req-type'], 'upload không gửi x-req-type').toBeUndefined();
    }
    expect(ups.map((u) => u.upload?.fileName).sort()).toEqual(['Hợp đồng mẫu.pdf', 'bao-cao.txt'].sort());
    expect(ups.find((u) => u.upload?.fileName === 'Hợp đồng mẫu.pdf')?.upload?.fileSize).toBe(2048);

    await app.tid('form-submit').click();
    await expect.poll(() => mock.creates().length).toBe(1);
    const sent = mock.creates()[0].body.data.attachment_files as FileMeta[];
    const returned = ups.map((u) => u.response.data as FileMeta);
    expect([...sent].map(asMeta).sort((a, b) => a.file_id.localeCompare(b.file_id)), 'giữ nguyên object metadata đã nhận').toEqual(
      [...returned].sort((a, b) => a.file_id.localeCompare(b.file_id)),
    );
    expect(mock.violations).toEqual([]);

    // Popup xem task vừa tạo: hàng "Đính kèm" với link /files/<file_id>/original/<fileName>, tab mới.
    const newId = mock.creates()[0].response.data.id as string;
    await expect(app.item(newId)).toBeVisible();
    await app.openTask(newId);
    const links = app.view().getByTestId('attachment-link');
    await expect(links).toHaveCount(2);
    await expect(app.view()).toContainText('Đính kèm');
    for (const m of returned) {
      const link = app.view().locator(`[data-testid="attachment-link"][href*="${m.file_id}"]`);
      await expect(link, `link tải ${m.fileName}`).toHaveCount(1);
      await expectDownloadLink(link, app.page.url(), m);
    }
  });

  test('AC11 đính kèm: bấm chip trong popup xem → tải về đúng tên và nội dung file', async ({ app, mock, page }) => {
    const content = Buffer.from('Nội dung báo cáo E2E — tải về');
    const meta = mock.makeFileMeta('Báo cáo tuần.txt', content.length, content);
    mock.task(T.T3)!.attachment_files = [meta];
    await app.openReady();
    await app.openTask(T.T3);
    const link = app.view().getByTestId('attachment-link');
    await expectDownloadLink(link, page.url(), meta);
    // Bấm chip → trình duyệt tải về với đúng tên (thuộc tính download).
    const download = await clickAndGetDownload(page, link);
    expect(download, 'bấm chip phải tải file về').not.toBeNull();
    expect(download!.suggestedFilename(), 'tên file tải về').toBe('Báo cáo tuần.txt');
    // Giới hạn harness: request tải của <a download> đi qua trình quản lý download, không qua page.route
    // (preview trả index.html). Nội dung kiểm bằng fetch cùng href qua mock (giống server thật với ?redirect=true).
    const href = (await link.getAttribute('href')) ?? '';
    const got = await page.evaluate(async (h) => {
      const r = await fetch(h);
      return { status: r.status, text: await r.text(), ct: r.headers.get('content-type') };
    }, href);
    expect(got.status).toBe(200);
    expect(got.ct ?? '').toContain('application/octet-stream');
    expect(got.text === content.toString('utf8'), 'href trả đúng nội dung file').toBe(true);
    expect(mock.fileGets.at(-1), 'tải bằng ?redirect=true').toMatchObject({ fileId: meta.file_id, redirect: true });
  });

  test('AC10 đính kèm: không chọn file → không gửi attachment_files', async ({ app, mock }) => {
    await app.openReady();
    await app.openCreate();
    await app.tid('field-title').fill('Việc không đính kèm');
    await app.tid('form-submit').click();
    await expect.poll(() => mock.creates().length).toBe(1);
    expect(mock.creates()[0].body.data).not.toHaveProperty('attachment_files');
    expect(mock.uploads()).toHaveLength(0);
  });

  test('AC10 đính kèm: đang upload → nút Tạo vô hiệu kèm "Đang tải file…", xong thì bật lại', async ({ app, mock }) => {
    await app.openReady();
    await app.openCreate();
    await app.tid('field-title').fill('Việc chờ upload');
    const gate = mock.hold((r) => r.kind === 'upload');
    await chooseFiles(app, [txt('cham.txt')]);
    await expect(app.page.locator('[data-testid="attach-chip"][data-state="uploading"]')).toHaveCount(1);
    await expect(app.tid('form-submit')).toBeDisabled();
    await expect(app.tid('form-submit')).toContainText('Đang tải file…');
    gate.release();
    await expectChipsDone(app, 1);
    await expect(app.tid('form-submit')).toBeEnabled();
    await app.tid('form-submit').click();
    await expect.poll(() => mock.creates().length).toBe(1);
    expect(ids(mock.creates()[0].body.data.attachment_files)).toHaveLength(1);
  });

  test('AC10 đính kèm: kéo-thả file vào popup → upload', async ({ app, mock, page }) => {
    await app.openReady();
    await app.openCreate();
    const dt = await page.evaluateHandle(() => {
      const d = new DataTransfer();
      d.items.add(new File(['kéo thả'], 'keo-tha.txt', { type: 'text/plain' }));
      return d;
    });
    for (const type of ['dragenter', 'dragover', 'drop']) await app.form().dispatchEvent(type, { dataTransfer: dt });
    await expectChipsDone(app, 1);
    expect(mock.uploads().map((u) => u.upload?.fileName)).toEqual(['keo-tha.txt']);
  });

  test('AC11 đính kèm: sửa bỏ 1 file → gửi toàn bộ danh sách còn lại', async ({ app, mock }) => {
    const [m1, m2] = seedFiles(mock, T.T3, ['tai-lieu-1.txt', 'tai-lieu-2.txt']);
    await app.openReady();
    await app.openTask(T.T3);
    await expect(app.view().getByTestId('attachment-link')).toHaveCount(2);
    await app.tid('form-edit').click();
    await expectChipsDone(app, 2);
    await app.page.getByTestId('attach-chip').filter({ hasText: 'tai-lieu-1' }).getByTestId('attach-remove').click();
    await expect(app.page.getByTestId('attach-chip')).toHaveCount(1);
    await app.tid('form-submit').click();
    await expect(app.view()).toBeVisible();
    await expect.poll(() => mock.updates(T.T3).length).toBe(1);
    const data = mock.updates(T.T3)[0].body.data;
    expect(ids(data.attachment_files), 'gửi danh sách còn lại').toEqual([m2.file_id]);
    for (const k of Object.keys(data)) expect(['id', 'object_type', 'workspace_id', 'attachment_files']).toContain(k);
    expect(ids(mock.task(T.T3)!.attachment_files)).toEqual([m2.file_id]);
    expect(ids(mock.task(T.T3)!.attachment_files)).not.toContain(m1.file_id);
    await expect(app.view().getByTestId('attachment-link')).toHaveCount(1);
  });

  test('AC11 đính kèm: sửa thêm file mới → gửi file cũ + file mới', async ({ app, mock }) => {
    const [m1] = seedFiles(mock, T.T3, ['cu.txt']);
    await app.openReady();
    await app.openTask(T.T3);
    await app.tid('form-edit').click();
    await chooseFiles(app, [txt('moi.txt')]);
    await expectChipsDone(app, 2);
    await app.tid('form-submit').click();
    await expect.poll(() => mock.updates(T.T3).length).toBe(1);
    const sent = ids(mock.updates(T.T3)[0].body.data.attachment_files);
    expect(sent).toHaveLength(2);
    expect(sent).toContain(m1.file_id);
  });

  test('AC11 đính kèm: bỏ hết file → gửi null (không gửi []), hàng "Đính kèm" ẩn', async ({ app, mock }) => {
    seedFiles(mock, T.T3, ['duy-nhat.txt']);
    await app.openReady();
    await app.openTask(T.T3);
    await app.tid('form-edit').click();
    await expectChipsDone(app, 1);
    await app.page.getByTestId('attach-remove').click();
    await expect(app.page.getByTestId('attach-chip')).toHaveCount(0);
    await app.tid('form-submit').click();
    await expect(app.view()).toBeVisible();
    await expect.poll(() => mock.updates(T.T3).length).toBe(1);
    expect(mock.updates(T.T3)[0].body.data.attachment_files, 'bỏ hết → null').toBeNull();
    expect(mock.violations).toEqual([]);
    await expect(app.view().getByTestId('attachment-link')).toHaveCount(0);
  });

  test('AC11 đính kèm: không đổi file (chỉ sửa tiêu đề) → không gửi attachment_files', async ({ app, mock }) => {
    seedFiles(mock, T.T3, ['giu-nguyen-1.txt', 'giu-nguyen-2.txt']);
    await app.openReady();
    await app.openTask(T.T3);
    await app.tid('form-edit').click();
    await expectChipsDone(app, 2);
    await app.tid('field-title').fill('Nghiên cứu ứng dụng đối thủ (có file)');
    await app.tid('form-submit').click();
    await expect.poll(() => mock.updates(T.T3).length).toBe(1);
    expect(mock.updates(T.T3)[0].body.data).not.toHaveProperty('attachment_files');
  });

  test('AC11 xem: không có file → ẩn hàng "Đính kèm"', async ({ app }) => {
    await app.openReady();
    await app.openTask(T.T7);
    await expect(app.view().getByTestId('attachment-link')).toHaveCount(0);
    await expect(app.view().getByText('Đính kèm', { exact: true })).toHaveCount(0);
  });

  test('AC14 task chỉ theo dõi: xem/tải được file, không sửa', async ({ app, mock }) => {
    const [m] = seedFiles(mock, T.T5, ['chi-xem.txt']);
    await app.openReady();
    await app.setRoles(['cc']);
    await app.openTask(T.T5);
    const link = app.view().getByTestId('attachment-link');
    await expect(link).toHaveCount(1);
    await expectDownloadLink(link, app.page.url(), m);
    await expect(app.tid('form-edit')).toHaveCount(0);
    await expect(app.tid('attach-button')).toHaveCount(0);
  });
});

test.describe('AC21 đính kèm: giới hạn, file bị từ chối, chặn lưu khi còn file lỗi', () => {
  test('AC21 file > 50 MB → chip lỗi "File lớn hơn 50 MB" ngay ở client, không gọi upload; Tạo bị chặn', async ({ app, mock, page }, testInfo) => {
    const big = sparseFile(testInfo, 'qua-lon.pdf', MAX_FILE_BYTES + 1);
    await app.openReady();
    await app.openCreate();
    await app.tid('field-title').fill('Việc có file quá lớn');
    await app.tid('attach-input').setInputFiles(big);
    const err = chips(app, 'error');
    await expect(err).toHaveCount(1);
    await expect(err).toContainText('qua-lon');
    await expect(err).toHaveAttribute('title', new RegExp(TOO_LARGE_REASON));
    await expect(app.tid('attach-errors')).toHaveRole('alert');
    await expect(app.tid('attach-error')).toHaveCount(1);
    await expect(app.tid('attach-error')).toContainText(`qua-lon.pdf: ${TOO_LARGE_REASON}`);
    await page.waitForTimeout(500);
    expect(mock.uploads(), 'file > 50 MB không được gọi upload').toHaveLength(0);

    await app.tid('form-submit').click();
    await expect(app.tid('form-error')).toContainText(pendingErrorsMsg(1));
    await page.waitForTimeout(500);
    expect(mock.creates(), 'còn file lỗi → không gửi 10200').toHaveLength(0);
  });

  test('AC21 file đúng 50 MB → được upload (không bị chặn ở client), chip xong', async ({ app, mock }) => {
    test.setTimeout(120_000);
    await app.openReady();
    await app.openCreate();
    await chooseGeneratedFiles(app.tid('attach-input'), [{ name: 'vua-du-50mb.pdf', size: MAX_FILE_BYTES, type: 'application/pdf' }]);
    await expect(chips(app, 'done')).toHaveCount(1, { timeout: 60_000 });
    await expect(chips(app, 'error')).toHaveCount(0);
    expect(mock.uploads().map((u) => u.upload?.fileName)).toEqual(['vua-du-50mb.pdf']);
    expect(mock.uploads()[0].upload?.fileSize, 'gửi đủ 50 MB lên server').toBe(MAX_FILE_BYTES);
    expect(mock.violations).toEqual([]);
  });

  test('AC21 tạo: chọn 11 file một lần → chỉ 10 file được nhận/upload, attach-note báo bỏ qua 1; Tạo gửi 10 file', async ({ app, mock, page }) => {
    await app.openReady();
    await app.openCreate();
    await app.tid('field-title').fill('Việc 11 file');
    await chooseFiles(app, txts('mot-lan', 11));
    await expectChipsDone(app, 10);
    await expect(app.tid('attach-note')).toHaveText(tooManyNote(1));
    await page.waitForTimeout(500);
    expect(mock.uploads(), 'file bị bỏ qua không upload').toHaveLength(10);
    await app.tid('form-submit').click();
    await expect.poll(() => mock.creates().length).toBe(1);
    expect(ids(mock.creates()[0].body.data.attachment_files)).toHaveLength(10);
    expect(mock.violations).toEqual([]);
  });

  test('AC21 tạo: giới hạn tính theo công việc gồm file đang tải — chọn 6 (đang upload) rồi 5 → chỉ thêm 4, note bỏ qua 1', async ({ app, mock, page }) => {
    await app.openReady();
    await app.openCreate();
    await app.tid('field-title').fill('Việc chọn file hai lần');
    const gate = mock.hold((r) => r.kind === 'upload');
    await chooseFiles(app, txts('dot-1', 6));
    await expect(chips(app)).toHaveCount(6);
    await expect(chips(app, 'done'), 'upload đang bị giữ').toHaveCount(0);
    await expect(app.tid('attach-note')).toBeHidden();
    await chooseFiles(app, txts('dot-2', 5));
    await expect(chips(app)).toHaveCount(10);
    await expect(app.tid('attach-note')).toHaveText(tooManyNote(1));
    gate.release();
    await expectChipsDone(app, 10);
    await page.waitForTimeout(500);
    expect(mock.uploads()).toHaveLength(10);
    expect(mock.uploads().filter((u) => u.upload?.fileName?.startsWith('dot-1-'))).toHaveLength(6);
    await app.tid('form-submit').click();
    await expect.poll(() => mock.creates().length).toBe(1);
    expect(ids(mock.creates()[0].body.data.attachment_files)).toHaveLength(10);
    expect(mock.violations).toEqual([]);
  });

  test('AC21 sửa: task đã có 8 file, chọn thêm 3 → upload 2, note bỏ qua 1; Lưu gửi đủ 10 file (giữ file cũ)', async ({ app, mock, page }) => {
    const existing = seedFiles(mock, T.T3, Array.from({ length: 8 }, (_, i) => `co-san-${i + 1}.txt`));
    await app.openReady();
    await app.openTask(T.T3);
    await app.tid('form-edit').click();
    await expectChipsDone(app, 8);
    await chooseFiles(app, txts('them', 3));
    await expectChipsDone(app, 10);
    await expect(app.tid('attach-note')).toHaveText(tooManyNote(1));
    await page.waitForTimeout(500);
    expect(mock.uploads()).toHaveLength(2);
    await app.tid('form-submit').click();
    await expect(app.view()).toBeVisible();
    await expect.poll(() => mock.updates(T.T3).length).toBe(1);
    const sent = ids(mock.updates(T.T3)[0].body.data.attachment_files);
    expect(sent).toHaveLength(10);
    for (const m of existing) expect(sent, `giữ file cũ ${m.fileName}`).toContain(m.file_id);
    expect(mock.violations).toEqual([]);
    await expect(app.view().getByTestId('attachment-link')).toHaveCount(10);
  });

  test('AC21 sửa: task đã đủ 10 file → chọn thêm bị bỏ qua (không upload); bỏ 1 file cũ thì thêm được', async ({ app, mock, page }) => {
    const existing = seedFiles(mock, T.T3, Array.from({ length: 10 }, (_, i) => `du-${i + 1}.txt`));
    await app.openReady();
    await app.openTask(T.T3);
    await app.tid('form-edit').click();
    await expectChipsDone(app, 10);
    await chooseFiles(app, [txt('thua.txt')]);
    await expect(app.tid('attach-note')).toHaveText(tooManyNote(1));
    await page.waitForTimeout(500);
    expect(mock.uploads(), 'đủ 10 file → không upload thêm').toHaveLength(0);
    await expect(chips(app)).toHaveCount(10);

    await chips(app).filter({ hasText: 'du-1.' }).getByTestId('attach-remove').click();
    await expect(chips(app)).toHaveCount(9);
    await chooseFiles(app, [txt('thay-the.txt')]);
    await expectChipsDone(app, 10);
    expect(mock.uploads().map((u) => u.upload?.fileName)).toEqual(['thay-the.txt']);
    await app.tid('form-submit').click();
    await expect.poll(() => mock.updates(T.T3).length).toBe(1);
    const sent = ids(mock.updates(T.T3)[0].body.data.attachment_files);
    expect(sent).toHaveLength(10);
    expect(sent).not.toContain(existing[0].file_id);
    expect(mock.violations).toEqual([]);
  });

  test('AC21 file lỗi không tính vào giới hạn 10: 1 file bị từ chối + chọn 10 file → nhận đủ 10, không có note', async ({ app, mock, guard }) => {
    allowUpload400(guard);
    await app.openReady();
    await app.openCreate();
    await app.tid('field-title').fill('Việc có file lỗi và 10 file');
    await chooseFiles(app, [exe('bi-tu-choi.exe')]);
    await expect(chips(app, 'error')).toHaveCount(1);
    await chooseFiles(app, txts('du-muoi', 10));
    await expect(chips(app, 'done')).toHaveCount(10, { timeout: 10_000 });
    await expect(chips(app, 'error')).toHaveCount(1);
    await expect(app.tid('attach-note')).toBeHidden();
    expect(mock.uploads().filter((u) => u.upload?.fileName?.startsWith('du-muoi-'))).toHaveLength(10);

    await chips(app, 'error').getByTestId('attach-remove').click();
    await expect(chips(app, 'error')).toHaveCount(0);
    await expect(app.tid('attach-errors')).toBeHidden();
    await app.tid('form-submit').click();
    await expect.poll(() => mock.creates().length).toBe(1);
    expect(ids(mock.creates()[0].body.data.attachment_files)).toHaveLength(10);
    expect(mock.violations).toEqual([]);
  });

  test('AC21 server từ chối loại file (HTTP 400 r:15) → chip lỗi + attach-errors (role=alert) "<tên>: Không nhận loại file .exe"; client không chặn theo đuôi', async ({ app, mock, guard }) => {
    allowUpload400(guard);
    await app.openReady();
    await app.openCreate();
    await app.tid('field-title').fill('Việc có file sai loại');
    await chooseFiles(app, [exe('cai-dat.exe'), txt('ghi-chu.txt')]);
    const err = chips(app, 'error');
    await expect(err).toHaveCount(1, { timeout: 10_000 });
    await expect(err).toContainText('cai-dat');
    await expect(err).toHaveAttribute('title', new RegExp(typeNotAllowed('exe').replace('.', '\\.')));
    await expect(chips(app, 'done')).toHaveCount(1);
    await expect(app.tid('attach-errors')).toBeVisible();
    await expect(app.tid('attach-errors')).toHaveRole('alert');
    await expect(app.tid('attach-error')).toHaveCount(1);
    await expect(app.tid('attach-error')).toContainText(`cai-dat.exe: ${typeNotAllowed('exe')}`);
    // Không chặn theo đuôi ở client: .exe vẫn được gửi lên, server là nguồn chuẩn.
    const up = mock.uploads().find((u) => u.upload?.fileName === 'cai-dat.exe');
    expect(up, 'client vẫn gọi upload cho .exe').toBeTruthy();
    expect(up!.status).toBe(400);
    expect(up!.response).toEqual({ r: 15, msg: 'file type not allowed' });
  });

  test('AC21 lỗi upload khác → attach-error giữ nguyên msg server; Tạo bị chặn tới khi bỏ file lỗi, sau đó chỉ gửi file tốt', async ({ app, mock, guard, page }) => {
    guard.allow(/console\.error/);
    await app.openReady();
    await app.openCreate();
    await app.tid('field-title').fill('Việc có file lỗi');
    mock.failNext((r) => r.kind === 'upload' && r.upload?.fileName === 'loi.txt', { status: 200, body: { r: 413, msg: 'File bị từ chối (giả lập E2E)' } });
    await chooseFiles(app, [txt('loi.txt'), txt('tot.txt')]);
    const err = chips(app, 'error');
    await expect(err).toHaveCount(1, { timeout: 10_000 });
    await expect(err).toContainText('loi');
    await expect(err).toHaveAttribute('title', /File bị từ chối \(giả lập E2E\)/);
    await expect(app.tid('attach-error')).toContainText('loi.txt: File bị từ chối (giả lập E2E)');
    await expect(chips(app, 'done')).toHaveCount(1);

    await expect(app.tid('form-submit')).toBeEnabled();
    await app.tid('form-submit').click();
    await expect(app.tid('form-error')).toContainText(pendingErrorsMsg(1));
    await page.waitForTimeout(500);
    expect(mock.creates(), 'còn file lỗi → không gửi').toHaveLength(0);

    await err.getByTestId('attach-remove').click();
    await expect(app.tid('form-error')).toBeHidden();
    await app.tid('form-submit').click();
    await expect.poll(() => mock.creates().length).toBe(1);
    const sent = (mock.creates()[0].body.data.attachment_files as (FileMeta | string)[]).map(asMeta);
    expect(sent.map((m) => m.fileName), 'chỉ gửi file upload thành công').toEqual(['tot.txt']);
  });

  test('AC21 tạo khi còn 2 file lỗi → không gửi 10200, form-error "Còn 2 file…", focus nút × của file lỗi đầu tiên; bỏ hết → lưu được', async ({ app, mock, guard, page }) => {
    allowUpload400(guard);
    await app.openReady();
    await app.openCreate();
    await app.tid('field-title').fill('Việc còn file lỗi khi lưu');
    mock.failNext((r) => r.kind === 'upload' && r.upload?.fileName === 'b-loi.txt', { status: 200, body: { r: 413, msg: 'Lỗi upload (giả lập E2E)' } });
    await chooseFiles(app, [exe('a-loi.exe'), txt('tot.txt'), txt('b-loi.txt')]);
    const err = chips(app, 'error');
    await expect(err).toHaveCount(2, { timeout: 10_000 });
    await expect(chips(app, 'done')).toHaveCount(1);
    await expect(app.tid('attach-error')).toHaveCount(2);

    await expect(app.tid('form-submit')).toBeEnabled();
    await app.tid('form-submit').click();
    await expect(app.tid('form-error')).toContainText(pendingErrorsMsg(2));
    await expect(err.first().getByTestId('attach-remove'), 'focus vào nút × của file lỗi đầu tiên').toBeFocused();
    await page.waitForTimeout(500);
    expect(mock.writes(), 'không gửi request ghi record khi còn file lỗi').toHaveLength(0);

    // Bỏ file lỗi bằng bàn phím (nút × đang focus) rồi bằng chuột.
    await page.keyboard.press('Enter');
    await expect(err).toHaveCount(1);
    await err.first().getByTestId('attach-remove').click();
    await expect(err).toHaveCount(0);
    await expect(app.tid('form-error')).toBeHidden();
    await expect(app.tid('attach-errors')).toBeHidden();
    await expect(chips(app, 'done')).toHaveCount(1);

    await app.tid('form-submit').click();
    await expect.poll(() => mock.creates().length).toBe(1);
    const sent = (mock.creates()[0].body.data.attachment_files as (FileMeta | string)[]).map(asMeta);
    expect(sent.map((m) => m.fileName)).toEqual(['tot.txt']);
    expect(mock.violations).toEqual([]);
  });

  test('AC21 sửa khi còn file lỗi → không gửi 10201, form-error + focus ×; bỏ file lỗi → Lưu gửi file cũ + file mới', async ({ app, mock, guard, page }) => {
    allowUpload400(guard);
    const [old] = seedFiles(mock, T.T3, ['cu-1.txt']);
    await app.openReady();
    await app.openTask(T.T3);
    await app.tid('form-edit').click();
    await expectChipsDone(app, 1);
    await chooseFiles(app, [exe('sai-loai.exe'), txt('moi.txt')]);
    const err = chips(app, 'error');
    await expect(err).toHaveCount(1, { timeout: 10_000 });
    await expect(chips(app, 'done')).toHaveCount(2);
    await expect(app.tid('attach-error')).toContainText(`sai-loai.exe: ${typeNotAllowed('exe')}`);

    await app.tid('form-submit').click();
    await expect(app.tid('form-error')).toContainText(pendingErrorsMsg(1));
    await expect(err.getByTestId('attach-remove')).toBeFocused();
    await expect(app.form(), 'vẫn ở chế độ sửa').toBeVisible();
    await page.waitForTimeout(500);
    expect(mock.updates(T.T3), 'không gửi 10201 khi còn file lỗi').toHaveLength(0);

    await err.getByTestId('attach-remove').click();
    await expect(app.tid('form-error')).toBeHidden();
    await app.tid('form-submit').click();
    await expect(app.view()).toBeVisible();
    await expect.poll(() => mock.updates(T.T3).length).toBe(1);
    const sent = (mock.updates(T.T3)[0].body.data.attachment_files as (FileMeta | string)[]).map(asMeta);
    expect(sent.map((m) => m.fileName).sort()).toEqual(['cu-1.txt', 'moi.txt']);
    expect(sent.map((m) => m.file_id)).toContain(old.file_id);
    expect(mock.violations).toEqual([]);
  });
});
