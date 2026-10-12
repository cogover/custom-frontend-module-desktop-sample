import { test, expect, LOCAL_URL } from '../../support/local/fixtures';
import { T } from '../../support/local/dataset';
import type { InlineFileMeta, MockCogover, RecordedRequest } from '../../support/local/mock-api';
import { OBJECT_TYPE } from '../../support/model';
import { makePng } from '../../support/files';
import type { TaskApp } from '../../support/ui';
import {
  canvasDataUrl,
  DESC_FIELD_ID,
  descShape,
  expectedImageSrc,
  googleDocsHtml,
  imageUploadError,
  imagesUploading,
  INLINE_FIELD_ID,
  isPng,
  pngDataUrl,
  sameImageLink,
  SUBMIT_UPLOADING_IMAGES,
  trimEmptyEdges,
  wordDesktopHtml,
  wordRtfWithPng,
} from '../../support/paste';

/**
 * AC22 "Dán vào mô tả" (CONTRACT mục 5 điểm 3b, 2026-10-02):
 *  - HTML Google Docs / Word desktop giữ tiêu đề, đậm/nghiêng/gạch, danh sách lồng/số, dòng trống.
 *  - Ảnh data: / ảnh dán dạng file / ảnh Word (RTF) → upload `_attachments` (field_id + object_id, không slug,
 *    không x-req-*), đang tải thì khoá nút lưu, xong thì src = <origin>/files/0/<id>/original/<tên>?redirect=true&long_text_field_id=…
 *  - Lưu gửi `_attachments` (metadata giữ nguyên, url thêm long_text_field_id) của ảnh còn trong mô tả; không có ảnh mới → không gửi.
 *  - Upload lỗi → ảnh bị gỡ + desc-images-error; ảnh link http(s) giữ nguyên link.
 */

const LOCAL_ORIGIN = new URL(LOCAL_URL).origin;
const asObj = (m: unknown) => (typeof m === 'string' ? JSON.parse(m) : m) as Record<string, any>;
const b64 = (b: Buffer) => b.toString('base64');

/** Upload ảnh mô tả bị server từ chối (HTTP 400) là dự kiến trong ca lỗi. */
function allowUpload400(guard: { allow: (...p: RegExp[]) => void }) {
  guard.allow(
    /^HTTP 400: POST \S+\/api\/v1\/file\/upload\/v2\/client_upload$/,
    /^console\.error: Failed to load resource: the server responded with a status of 400/,
  );
}

async function openCreateWithTitle(app: TaskApp, title: string) {
  await app.openReady();
  await app.openCreate();
  await app.tid('field-title').fill(title);
}

/** Request upload ảnh mô tả đúng contract 3b: multipart chỉ có field_id/object_id + file, CSRF, không x-req-*. */
function expectInlineUploadRequest(mock: MockCogover, up: RecordedRequest, bytes?: Buffer) {
  expect(up.path).toBe('/api/v1/file/upload/v2/client_upload');
  expect(up.method).toBe('POST');
  expect(up.headers['content-type'] ?? '').toMatch(/^multipart\/form-data/);
  expect(up.upload?.fields, 'chỉ gửi field_id + object_id (không field_slug/object_slug)').toEqual({
    field_id: INLINE_FIELD_ID,
    object_id: OBJECT_TYPE,
  });
  expect(up.headers['x-req-service'], 'không gửi x-req-service').toBeUndefined();
  expect(up.headers['x-req-type'], 'không gửi x-req-type').toBeUndefined();
  expect(up.headers['x-csrf-token']).toBe(mock.xsrf);
  expect(up.headers['x-xsrf-token']).toBe(mock.xsrf);
  if (bytes) expect(up.upload?.content?.equals(bytes), 'nội dung file upload = ảnh đã dán').toBe(true);
}

/** Phần tử `_attachments` gửi lên = metadata upload giữ nguyên, chỉ `url` thêm long_text_field_id (giữ %7Bresolution_size%7D). */
function expectAttachmentEntry(sent: unknown, uploaded: InlineFileMeta) {
  const s = asObj(sent);
  const { url: sentUrl, ...sentRest } = s;
  const { url: upUrl, ...upRest } = uploaded;
  expect(sentRest, 'giữ nguyên các key metadata khác').toEqual(upRest);
  expect(typeof sentUrl).toBe('string');
  const u = new URL(sentUrl, LOCAL_ORIGIN);
  expect(u.searchParams.get('long_text_field_id'), 'url có long_text_field_id = field description').toBe(DESC_FIELD_ID);
  expect(sentUrl, '{resolution_size} giữ dạng %7Bresolution_size%7D').toContain('%7Bresolution_size%7D');
  u.searchParams.delete('long_text_field_id');
  expect(decodeURIComponent(u.href), 'phần còn lại của url như server trả').toBe(decodeURIComponent(new URL(upUrl, LOCAL_ORIGIN).href));
}

/** Ảnh trong ô soạn đã trỏ link upload và tải được (GET /files/0/<id>/original/<tên>?redirect=true… qua mock). */
async function expectEditorImageUploaded(app: TaskApp, index: number, meta: InlineFileMeta, width: number) {
  const img = app.descImages().nth(index);
  const want = expectedImageSrc(LOCAL_ORIGIN, meta.file_id, meta.fileName);
  await expect
    .poll(async () => sameImageLink((await img.getAttribute('src')) ?? '', want), { message: `src ảnh ${index + 1} = ${want}` })
    .toBe(true);
  expect((await img.getAttribute('src'))!.startsWith(`${LOCAL_ORIGIN}/files/0/${meta.file_id}/original/`)).toBe(true);
  await expect
    .poll(() => img.evaluate((el) => ((el as HTMLImageElement).complete ? (el as HTMLImageElement).naturalWidth : -1)), {
      message: 'ảnh hiển thị từ link /files/0/… (tải về đúng ảnh)',
    })
    .toBe(width);
}

test.describe('AC22 dán vào mô tả — định dạng', () => {
  test('AC22 dán HTML Google Docs: vỏ <b font-weight:normal> không làm đậm; giữ H1/H2, đậm/nghiêng/gạch chân/gạch ngang, danh sách lồng + số, dòng trống; không gửi _attachments', async ({ app, mock, page }) => {
    await openCreateWithTitle(app, 'Việc dán từ Google Docs');
    await app.pasteDesc({ html: googleDocsHtml(), text: 'Kế hoạch quý 4' });
    await expect(app.descEditor().locator('h1')).toHaveText('Kế hoạch quý 4');
    await expect(app.descEditor().locator('h2')).toHaveText('Việc cần làm');
    await app.tid('form-submit').click();
    await expect.poll(() => mock.creates().length).toBe(1);

    const d = mock.creates()[0].body.data;
    expect(d, 'không có ảnh mới → không gửi _attachments').not.toHaveProperty('_attachments');
    expect(mock.inlineUploads()).toHaveLength(0);
    const shape = await descShape(page, d.description);
    expect(trimEmptyEdges(shape.blocks), 'thứ tự khối + dòng trống giữ nguyên').toEqual([
      'h1:Kế hoạch quý 4',
      'p:Chữ thường chữ đậm chữ nghiêng gạch chân gạch ngang',
      'p:',
      'h2:Việc cần làm',
      'ul',
      'p:',
      'ol',
    ]);
    expect(shape.strong, 'chỉ phần font-weight:700 là đậm').toEqual(['chữ đậm', 'Mục B']);
    expect(shape.em).toEqual(['chữ nghiêng']);
    expect(shape.u).toEqual(['gạch chân']);
    expect(shape.s).toEqual(['gạch ngang']);
    expect(shape.ulItems, 'danh sách chấm lồng thật (Mục A.1 nằm trong Mục A)').toEqual([
      { text: 'Mục A', depth: 1, parentItem: null },
      { text: 'Mục A.1', depth: 2, parentItem: 'Mục A' },
      { text: 'Mục B', depth: 1, parentItem: null },
    ]);
    expect(shape.olItems).toEqual([
      { text: 'Bước 1', depth: 1, parentItem: null },
      { text: 'Bước 2', depth: 1, parentItem: null },
    ]);
    expect(shape.extraTags, 'chỉ thẻ HTML ngữ nghĩa sạch').toEqual([]);
    expect(shape.extraAttrs, 'không class/style/id/dir/role/aria-*').toEqual([]);
    expect(mock.violations).toEqual([]);
  });

  test('AC22 dán HTML Word desktop: MsoTitle→H1, MsoSubtitle→H2, mso-list → danh sách lồng (chấm/số), bỏ ký hiệu mso-list:Ignore; giữ đậm/nghiêng/gạch, dòng trống', async ({ app, mock, page }) => {
    await openCreateWithTitle(app, 'Việc dán từ Word');
    await app.pasteDesc({ html: wordDesktopHtml(), text: 'Báo cáo tuần' });
    await expect(app.descEditor().locator('h1')).toHaveText('Báo cáo tuần');
    await app.tid('form-submit').click();
    await expect.poll(() => mock.creates().length).toBe(1);

    const d = mock.creates()[0].body.data;
    expect(d).not.toHaveProperty('_attachments');
    const shape = await descShape(page, d.description);
    expect(trimEmptyEdges(shape.blocks)).toEqual([
      'h1:Báo cáo tuần',
      'h2:Phòng kinh doanh',
      'p:Văn bản in đậm, in nghiêng, gạch dưới và gạch bỏ.',
      'ul',
      'p:',
      'ol',
    ]);
    expect(shape.ulItems, 'ký hiệu "·"/"o" bị bỏ, cấp 2 lồng trong cấp 1').toEqual([
      { text: 'Ý chính một', depth: 1, parentItem: null },
      { text: 'Ý phụ', depth: 2, parentItem: 'Ý chính một' },
      { text: 'Ý chính hai', depth: 1, parentItem: null },
    ]);
    expect(shape.olItems, 'ký hiệu "1."/"a)" → danh sách số, "a)" lồng trong "Bước hai"').toEqual([
      { text: 'Bước một', depth: 1, parentItem: null },
      { text: 'Bước hai', depth: 1, parentItem: null },
      { text: 'Bước con', depth: 2, parentItem: 'Bước hai' },
    ]);
    expect(shape.strong).toEqual(['in đậm', 'Ý chính hai']);
    expect(shape.em).toEqual(['in nghiêng']);
    expect(shape.u).toEqual(['gạch dưới']);
    expect(shape.s).toEqual(['gạch bỏ']);
    expect(shape.extraTags, 'không còn o:p hay thẻ Office').toEqual([]);
    expect(shape.extraAttrs).toEqual([]);
    expect(mock.violations).toEqual([]);
  });
});

test.describe('AC22 dán vào mô tả — ảnh', () => {
  test('AC22 ảnh data:image/png trong HTML dán vào: hiện ngay, upload _attachments; đang tải có desc-images-status và nút lưu khoá "Đang tải ảnh…"; xong thì src = /files/0/…&long_text_field_id; tạo → 10200 có _attachments + <img> khớp', async ({ app, mock, page }) => {
    const png = makePng(16, 16, 7);
    await openCreateWithTitle(app, 'Việc có ảnh chụp màn hình');
    const hold = mock.hold((r) => r.kind === 'upload' && r.upload?.fields.field_id !== undefined);
    await app.pasteDesc({ html: `<p>Ảnh chụp màn hình:</p><p><img src="${pngDataUrl(png)}" alt=""></p>`, text: 'Ảnh chụp màn hình:' });

    // Đang tải: ảnh hiện ngay (nguồn tạm), dòng trạng thái, nút lưu khoá.
    await expect(app.descImages()).toHaveCount(1);
    expect(await app.descImages().first().getAttribute('src'), 'hiện ngay từ nguồn tạm data:/blob:').toMatch(/^(data|blob):/);
    await expect(app.tid('desc-images-status')).toHaveText(imagesUploading(1));
    await expect(app.tid('form-submit')).toBeDisabled();
    await expect(app.tid('form-submit')).toHaveText(SUBMIT_UPLOADING_IMAGES);
    await expect.poll(() => mock.inlineUploads().length).toBe(1);
    await app.tid('field-title').press('Enter');
    await page.waitForTimeout(400);
    expect(mock.creates(), 'đang tải ảnh → không tạo').toHaveLength(0);

    hold.release();
    await expect(app.tid('desc-images-status')).toBeHidden();
    await expect(app.tid('form-submit')).toBeEnabled();
    await expect(app.tid('form-submit')).toHaveText('Tạo công việc');
    const up = mock.inlineUploads()[0];
    expectInlineUploadRequest(mock, up, png);
    expect(up.upload?.contentType).toBe('image/png');
    const meta = up.response.data as InlineFileMeta;
    await expectEditorImageUploaded(app, 0, meta, 16);
    expect(
      mock.fileGets.some((g) => g.fileId === meta.file_id && g.redirect && g.size === 'original' && /long_text_field_id=OFDEMOTASKDSC/.test(g.query ?? '')),
      'trình duyệt tải ảnh qua /files/0/<id>/original/…?redirect=true&long_text_field_id=…',
    ).toBe(true);
    await expect(app.tid('desc-images-error')).toBeHidden();

    await app.tid('form-submit').click();
    await expect.poll(() => mock.creates().length).toBe(1);
    const d = mock.creates()[0].body.data;
    expect(d._attachments, '_attachments có đúng ảnh đã dán').toHaveLength(1);
    expectAttachmentEntry(d._attachments[0], meta);
    const shape = await descShape(page, d.description);
    expect(shape.text).toContain('Ảnh chụp màn hình:');
    expect(shape.imgSrcs).toHaveLength(1);
    expect(sameImageLink(shape.imgSrcs[0], expectedImageSrc(LOCAL_ORIGIN, meta.file_id, meta.fileName)), `<img src> = link ảnh (${shape.imgSrcs[0]})`).toBe(true);
    expect(shape.extraAttrs.filter((a) => !a.startsWith('img[alt')), 'img không class/style/data-*').toEqual([]);

    // Popup xem task vừa tạo hiển thị ảnh từ link đó.
    const newId = mock.creates()[0].response.data.id as string;
    await expect(app.dialog()).toBeHidden();
    await app.openTask(newId);
    // Chỉ ảnh của mô tả (popup xem còn có thể có ảnh avatar).
    const vimg = app.view().locator(`img[src*="/files/0/${meta.file_id}/"]`);
    await expect(vimg).toHaveCount(1);
    expect(sameImageLink((await vimg.getAttribute('src')) ?? '', expectedImageSrc(LOCAL_ORIGIN, meta.file_id, meta.fileName))).toBe(true);
    await expect.poll(() => vimg.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(16);
    expect(mock.violations).toEqual([]);
  });

  test('AC22 ảnh dán dạng file (chụp màn hình; "Copy image" có HTML chỉ <img>) → upload chính file, không dùng link trong HTML; _attachments có cả 2', async ({ app, mock, page }) => {
    const shot = makePng(10, 6, 21);
    const copied = makePng(12, 12, 33);
    await openCreateWithTitle(app, 'Việc dán ảnh dạng file');
    await app.focusDesc();
    await page.keyboard.type('Hai ảnh:');
    // 1) Ảnh chụp màn hình: clipboard chỉ có file.
    await app.pasteDesc({ files: [{ name: 'image.png', type: 'image/png', base64: b64(shot) }] });
    await expect.poll(() => mock.inlineUploads().length).toBe(1);
    await expect(app.tid('desc-images-status')).toBeHidden();
    // 2) "Copy image" của trình duyệt: HTML chỉ có <img src=link gốc> (không chữ) + file ảnh.
    await app.pasteDesc({
      html: '<meta charset="utf-8"><img src="https://images.example.com/goc/anh-goc.png" alt="">',
      files: [{ name: 'image.png', type: 'image/png', base64: b64(copied) }],
    });
    await expect.poll(() => mock.inlineUploads().length).toBe(2);
    await expect(app.tid('desc-images-status')).toBeHidden();

    const [u1, u2] = mock.inlineUploads();
    expectInlineUploadRequest(mock, u1, shot);
    expectInlineUploadRequest(mock, u2, copied);
    const m1 = u1.response.data as InlineFileMeta;
    const m2 = u2.response.data as InlineFileMeta;
    await expect(app.descImages()).toHaveCount(2);
    await expectEditorImageUploaded(app, 0, m1, 10);
    await expectEditorImageUploaded(app, 1, m2, 12);
    await expect(app.descEditor().locator('img[src*="images.example.com"]'), 'không chèn link gốc trong HTML').toHaveCount(0);

    await app.tid('form-submit').click();
    await expect.poll(() => mock.creates().length).toBe(1);
    const d = mock.creates()[0].body.data;
    expect((d._attachments as unknown[]).map((x) => asObj(x).file_id).sort()).toEqual([m1.file_id, m2.file_id].sort());
    for (const x of d._attachments as unknown[]) expectAttachmentEntry(x, asObj(x).file_id === m1.file_id ? m1 : m2);
    const shape = await descShape(page, d.description);
    expect(shape.imgSrcs).toHaveLength(2);
    expect(shape.imgSrcs.every((s) => s.startsWith(`${LOCAL_ORIGIN}/files/0/`))).toBe(true);
    expect(shape.text).toContain('Hai ảnh:');
    expect(mock.violations).toEqual([]);
  });

  test('AC22 ảnh dán vào rồi bị xoá trước khi lưu → không có trong _attachments (chỉ ảnh còn trong mô tả)', async ({ app, mock, page }) => {
    const a = makePng(8, 8, 41);
    const b = makePng(9, 9, 42);
    await openCreateWithTitle(app, 'Việc dán rồi xoá ảnh');
    await app.pasteDesc({ files: [{ name: 'image.png', type: 'image/png', base64: b64(a) }] });
    await expect.poll(() => mock.inlineUploads().length).toBe(1);
    await app.pasteDesc({ files: [{ name: 'image.png', type: 'image/png', base64: b64(b) }] });
    await expect.poll(() => mock.inlineUploads().length).toBe(2);
    await expect(app.tid('desc-images-status')).toBeHidden();
    const [ma, mb] = mock.inlineUploads().map((u) => u.response.data as InlineFileMeta);
    await expectEditorImageUploaded(app, 0, ma, 8);
    await expectEditorImageUploaded(app, 1, mb, 9);

    // Chọn ảnh thứ nhất (bấm vào ảnh) rồi xoá bằng Backspace như người dùng.
    await app.descImages().first().click();
    await app.settleSelection();
    await page.keyboard.press('Backspace');
    await expect(app.descImages()).toHaveCount(1);
    await expectEditorImageUploaded(app, 0, mb, 9);

    await app.tid('form-submit').click();
    await expect.poll(() => mock.creates().length).toBe(1);
    const d = mock.creates()[0].body.data;
    expect((d._attachments as unknown[]).map((x) => asObj(x).file_id), 'chỉ ảnh còn trong mô tả').toEqual([mb.file_id]);
    const shape = await descShape(page, d.description);
    expect(shape.imgSrcs).toHaveLength(1);
    expect(shape.imgSrcs[0]).toContain(mb.file_id);
  });

  test('AC22 upload ảnh lỗi (server 400 r:15) → ảnh bị gỡ khỏi mô tả, desc-images-error "Không tải được ảnh dán vào: Không nhận loại file .png"; tạo không gửi _attachments', async ({ app, mock, page, guard }) => {
    allowUpload400(guard);
    mock.inlineAllowedExts!.delete('png'); // quản trị bỏ png khỏi file_type của _attachments
    await openCreateWithTitle(app, 'Việc ảnh không tải được');
    await app.pasteDesc({ html: `<p>Trước ảnh</p><p><img src="${pngDataUrl(makePng(8, 8, 5))}"></p><p>Sau ảnh</p>` });
    await expect.poll(() => mock.inlineUploads().length).toBe(1);
    expect(mock.inlineUploads()[0].status).toBe(400);
    expect(mock.inlineUploads()[0].response).toMatchObject({ r: 15 });

    await expect(app.tid('desc-images-error')).toHaveText(imageUploadError('Không nhận loại file .png'));
    await expect(app.tid('desc-images-error')).toHaveRole('alert');
    await expect(app.descImages(), 'ảnh lỗi bị gỡ khỏi mô tả').toHaveCount(0);
    await expect(app.tid('desc-images-status')).toBeHidden();
    await expect.poll(() => app.descText()).toMatch(/Trước ảnh[\s\S]*Sau ảnh/);
    await expect(app.tid('form-submit')).toBeEnabled();
    await expect(app.tid('form-submit')).toHaveText('Tạo công việc');

    await app.tid('form-submit').click();
    await expect.poll(() => mock.creates().length).toBe(1);
    const d = mock.creates()[0].body.data;
    expect(d).not.toHaveProperty('_attachments');
    const shape = await descShape(page, d.description);
    expect(shape.imgSrcs).toEqual([]);
    expect(shape.text).toContain('Trước ảnh');
    expect(shape.text).toContain('Sau ảnh');
  });

  test('AC22 ảnh link http(s) từ web giữ nguyên link, không upload, không gửi _attachments', async ({ app, mock, page, guard }) => {
    const webSrc = 'https://images.example.com/doi-tac/logo.png';
    guard.allow(/^external-request: GET https:\/\/images\.example\.com\//);
    await page.route('https://images.example.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: makePng(4, 4, 1) }));
    await openCreateWithTitle(app, 'Việc có ảnh link web');
    await app.pasteDesc({ html: `<p>Logo đối tác <img src="${webSrc}" alt="logo"></p>` });
    await expect(app.descImages()).toHaveCount(1);
    await expect(app.descImages().first()).toHaveAttribute('src', webSrc);
    await page.waitForTimeout(800);
    expect(mock.inlineUploads(), 'ảnh link web không upload').toHaveLength(0);
    await expect(app.tid('desc-images-status')).toBeHidden();

    await app.tid('form-submit').click();
    await expect.poll(() => mock.creates().length).toBe(1);
    const d = mock.creates()[0].body.data;
    expect(d).not.toHaveProperty('_attachments');
    const shape = await descShape(page, d.description);
    expect(shape.imgSrcs).toEqual([webSrc]);
    expect(shape.text).toContain('Logo đối tác');
  });

  test('AC22 ảnh webp (kiểu _attachments không nhận) được vẽ lại thành PNG trước khi upload', async ({ app, mock, page }) => {
    await openCreateWithTitle(app, 'Việc dán ảnh webp');
    const webp = await canvasDataUrl(page, 'image/webp', 12, 10);
    expect(webp.startsWith('data:image/webp'), 'Chromium mã hoá được webp').toBe(true);
    await app.pasteDesc({ html: `<p>Ảnh webp</p><p><img src="${webp}"></p>` });
    await expect.poll(() => mock.inlineUploads().length).toBe(1);
    await expect(app.tid('desc-images-status')).toBeHidden();
    const up = mock.inlineUploads()[0];
    expectInlineUploadRequest(mock, up);
    expect(up.status, 'không bị server từ chối').toBe(200);
    expect(isPng(up.upload!.content!), 'nội dung upload là PNG').toBe(true);
    expect(up.upload?.fileName ?? '').toMatch(/\.png$/i);
    expect(up.upload?.contentType).toBe('image/png');
    const meta = up.response.data as InlineFileMeta;
    await expectEditorImageUploaded(app, 0, meta, 12);
    await app.tid('form-submit').click();
    await expect.poll(() => mock.creates().length).toBe(1);
    expect((mock.creates()[0].body.data._attachments as unknown[]).map((x) => asObj(x).file_id)).toEqual([meta.file_id]);
  });

  test('AC22 ảnh Word desktop (src file:///… + ảnh PNG trong RTF \\pngblip, bỏ \\nonshppict) → lấy ảnh từ RTF và upload', async ({ app, mock, page }) => {
    const png = makePng(16, 16, 77);
    await openCreateWithTitle(app, 'Việc dán Word có ảnh');
    await app.pasteDesc({
      html: wordDesktopHtml({ imageSrc: 'file:///C:/Users/E2E/AppData/Local/Temp/msohtmlclip1/01/clip_image001.png' }),
      rtf: wordRtfWithPng(png),
      text: 'Báo cáo tuần',
    });
    await expect.poll(() => mock.inlineUploads().length, { message: 'ảnh Word được upload từ RTF' }).toBe(1);
    await expect(app.tid('desc-images-status')).toBeHidden();
    const up = mock.inlineUploads()[0];
    expectInlineUploadRequest(mock, up, png);
    const meta = up.response.data as InlineFileMeta;
    await expect(app.descImages()).toHaveCount(1);
    await expectEditorImageUploaded(app, 0, meta, 16);
    await expect(app.descEditor().locator('img[src^="file:"]')).toHaveCount(0);

    await app.tid('form-submit').click();
    await expect.poll(() => mock.creates().length).toBe(1);
    const d = mock.creates()[0].body.data;
    expect((d._attachments as unknown[]).map((x) => asObj(x).file_id)).toEqual([meta.file_id]);
    const shape = await descShape(page, d.description);
    expect(shape.h1).toEqual(['Báo cáo tuần']);
    expect(shape.imgSrcs).toHaveLength(1);
    expect(sameImageLink(shape.imgSrcs[0], expectedImageSrc(LOCAL_ORIGIN, meta.file_id, meta.fileName))).toBe(true);
  });

  test('AC22 url metadata tương đối (/files/0/…) → src và _attachments.url thành link tuyệt đối cùng origin', async ({ app, mock, page }) => {
    mock.inlineUrlStyle = 'relative';
    const png = makePng(8, 8, 9);
    await openCreateWithTitle(app, 'Việc ảnh url tương đối');
    await app.pasteDesc({ files: [{ name: 'image.png', type: 'image/png', base64: b64(png) }] });
    await expect.poll(() => mock.inlineUploads().length).toBe(1);
    const meta = mock.inlineUploads()[0].response.data as InlineFileMeta;
    expect(meta.url.startsWith('/files/0/')).toBe(true);
    await expectEditorImageUploaded(app, 0, meta, 8);
    await app.tid('form-submit').click();
    await expect.poll(() => mock.creates().length).toBe(1);
    const sent = asObj((mock.creates()[0].body.data._attachments as unknown[])[0]);
    expect(sent.url.startsWith(`${LOCAL_ORIGIN}/files/0/${meta.file_id}/`), `url tuyệt đối (${sent.url})`).toBe(true);
    expectAttachmentEntry(sent, meta);
  });
});

test.describe('AC22 dán vào mô tả — sửa task', () => {
  test('AC22 sửa: ảnh có sẵn không upload lại; đọc lại record trước khi lưu, _attachments = danh sách hiện có trên server + ảnh mới (không trùng file_id)', async ({ app, mock, page }) => {
    const oldMeta = mock.storedInlineMeta('so-do-cu.png', makePng(8, 8, 3));
    const oldSrc = expectedImageSrc(LOCAL_ORIGIN, oldMeta.file_id, oldMeta.fileName);
    mock.task(T.T3)!.description = `<p>Mô tả có ảnh cũ</p><p><img src="${oldSrc.replace(/&/g, '&amp;')}"></p>`;
    mock.task(T.T3)!._attachments = [oldMeta];
    await app.openReady();
    await app.openTask(T.T3);
    await app.tid('form-edit').click();
    await expect(app.descImages()).toHaveCount(1);
    expect(sameImageLink((await app.descImages().first().getAttribute('src')) ?? '', oldSrc), 'ảnh có sẵn nạp vào editor giữ nguyên link').toBe(true);

    // Trong lúc đang sửa, người khác thêm ảnh vào mô tả trên Cogover (server có thêm 1 phần tử, dạng chuỗi JSON).
    const otherMeta = mock.storedInlineMeta('anh-tren-cogover.png', makePng(8, 8, 4));
    mock.task(T.T3)!._attachments = [oldMeta, JSON.stringify(otherMeta)];

    const png = makePng(14, 14, 15);
    await app.pasteDesc({ files: [{ name: 'image.png', type: 'image/png', base64: b64(png) }] });
    await expect.poll(() => mock.inlineUploads().length).toBe(1);
    await expect(app.tid('desc-images-status')).toBeHidden();
    await expect(app.tid('form-submit')).toHaveText('Lưu');
    const newMeta = mock.inlineUploads()[0].response.data as InlineFileMeta;
    await expectEditorImageUploaded(app, 1, newMeta, 14);
    const seqBeforeSave = Math.max(...mock.requests.map((r) => r.seq));

    await app.tid('form-submit').click();
    await expect(app.view()).toBeVisible();
    await expect.poll(() => mock.updates(T.T3).length).toBe(1);
    const upd = mock.updates(T.T3)[0];
    expect(
      mock.readById(T.T3).some((r) => r.seq > seqBeforeSave && r.seq < upd.seq),
      'đọc lại record ngay trước khi lưu',
    ).toBe(true);
    const sent = (upd.body.data._attachments as unknown[]).map(asObj);
    expect(sent.map((m) => m.file_id).sort(), 'server hiện có (2) + ảnh mới, không trùng').toEqual(
      [oldMeta.file_id, otherMeta.file_id, newMeta.file_id].sort(),
    );
    expect(sent.find((m) => m.file_id === oldMeta.file_id), 'metadata hiện có giữ nguyên').toEqual(oldMeta);
    expect(sent.find((m) => m.file_id === otherMeta.file_id), 'metadata người khác vừa thêm giữ nguyên').toEqual(otherMeta);
    expectAttachmentEntry(sent.find((m) => m.file_id === newMeta.file_id), newMeta);
    expect(mock.inlineUploads(), 'ảnh có sẵn không upload lại').toHaveLength(1);

    const shape = await descShape(page, upd.body.data.description);
    expect(shape.imgSrcs).toHaveLength(2);
    expect(sameImageLink(shape.imgSrcs[0], oldSrc), 'ảnh cũ giữ nguyên link').toBe(true);
    expect(sameImageLink(shape.imgSrcs[1], expectedImageSrc(LOCAL_ORIGIN, newMeta.file_id, newMeta.fileName))).toBe(true);
    expect(mock.violations).toEqual([]);
  });

  test('AC22 sửa chữ trong mô tả có ảnh (link /files và data: có sẵn) → không upload, không gửi _attachments, ảnh giữ nguyên', async ({ app, mock, page }) => {
    const oldMeta = mock.storedInlineMeta('anh-co-san.png', makePng(8, 8, 6));
    const oldSrc = expectedImageSrc(LOCAL_ORIGIN, oldMeta.file_id, oldMeta.fileName);
    const dataSrc = pngDataUrl(makePng(6, 6, 8));
    mock.task(T.T1)!.description = `<p>Ảnh minh hoạ</p><p><img src="${oldSrc.replace(/&/g, '&amp;')}"></p><p><img src="${dataSrc}"></p>`;
    mock.task(T.T1)!._attachments = [oldMeta];
    await app.openReady();
    await app.openTask(T.T1);
    await app.tid('form-edit').click();
    await expect(app.descImages()).toHaveCount(2);
    await app.caretEndOfFirstLine();
    await page.keyboard.type(' (đã sửa)');
    await page.waitForTimeout(600);
    expect(mock.inlineUploads(), 'ảnh có sẵn (kể cả data:) không upload lại').toHaveLength(0);
    await expect(app.tid('desc-images-status')).toBeHidden();
    await app.tid('form-submit').click();
    await expect(app.view()).toBeVisible();
    await expect.poll(() => mock.updates(T.T1).length).toBe(1);
    const data = mock.updates(T.T1)[0].body.data;
    expect(data, 'không có ảnh mới → không gửi _attachments').not.toHaveProperty('_attachments');
    const shape = await descShape(page, data.description);
    expect(shape.text).toContain('Ảnh minh hoạ (đã sửa)');
    expect(shape.imgSrcs).toHaveLength(2);
    expect(sameImageLink(shape.imgSrcs[0], oldSrc)).toBe(true);
    expect(shape.imgSrcs[1]).toBe(dataSrc);
    expect(mock.inlineUploads()).toHaveLength(0);
  });
});
