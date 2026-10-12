import { test, expect } from '../../support/local/fixtures';
import { T } from '../../support/local/dataset';
import { MSG, normalizeHtml } from '../../support/model';

const EVIL =
  '<p>Xin chào <b>đậm</b> và <a href="https://example.com/tai-lieu">liên kết</a></p>' +
  '<img src="/__e2e_missing.png" onerror="window.__xss1=1">' +
  '<script>window.__xss2=1</script>' +
  '<p onclick="window.__xss3=1" onmouseover="window.__xss3=1">bấm thử</p>' +
  '<iframe src="javascript:window.__xss4=1"></iframe>' +
  '<a href="javascript:window.__xss5=1">xấu</a>';

const xssFlags = (page: import('@playwright/test').Page) =>
  page.evaluate(() => [1, 2, 3, 4, 5].map((i) => (window as any)[`__xss${i}`] ?? null));

test.describe('AC18 mô tả HTML an toàn', () => {
  test('AC18 popup render mô tả đã sanitize: không chạy script/onerror, giữ định dạng, link mở tab mới an toàn', async ({ app, mock, page, guard }) => {
    guard.allow(/__e2e_missing\.png/);
    await page.route('**/__e2e_missing.png', (r) => r.fulfill({ status: 404, body: '' }));
    mock.task(T.T3)!.description = EVIL;
    await app.openReady();

    // Thẻ chỉ hiện văn bản thuần rút gọn.
    const card = app.item(T.T3);
    await expect(card).toContainText('Xin chào');
    expect(await card.locator('img[src*="__e2e_missing"], b, script, iframe').count(), 'thẻ không render HTML mô tả').toBe(0);

    await app.openTask(T.T3);
    const v = app.view();
    await expect(v).toContainText('Xin chào');
    await expect(v.locator('b, strong').filter({ hasText: 'đậm' })).toHaveCount(1);
    expect(await v.locator('script, iframe').count(), 'không có script/iframe').toBe(0);
    expect(await v.locator('[onerror], [onclick], [onmouseover]').count(), 'không còn thuộc tính on*').toBe(0);
    const link = v.locator('a[href="https://example.com/tai-lieu"]');
    await expect(link).toHaveAttribute('target', '_blank');
    const rel = (await link.getAttribute('rel')) ?? '';
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');
    expect(await v.locator('a[href^="javascript:"]').count(), 'không còn link javascript:').toBe(0);

    await v.getByText('bấm thử').hover();
    await v.getByText('bấm thử').click();
    await page.waitForTimeout(300);
    expect(await xssFlags(page), 'không đoạn mã nào được chạy').toEqual([null, null, null, null, null]);
  });

  test('AC18 mô tả có định dạng được hỗ trợ (strong) nạp vào editor; chỉ sửa tiêu đề → không gửi description', async ({ app, mock }) => {
    const original = mock.task(T.T6)!.description;
    await app.openReady();
    await app.openTask(T.T6);
    await app.tid('form-edit').click();
    await expect(app.form()).toBeVisible();
    await expect(app.tid('field-desc-locked'), 'định dạng hỗ trợ → không khoá').toBeHidden();
    await expect(app.desc().locator('strong, b').filter({ hasText: 'spacing' })).toHaveCount(1);
    await app.tid('field-title').fill('Cập nhật tài liệu bàn giao (sửa tên)');
    await app.tid('form-submit').click();
    await expect(app.view()).toBeVisible();
    await expect.poll(() => mock.updates(T.T6).length).toBe(1);
    expect(mock.updates(T.T6)[0].body.data, 'mô tả không đổi → không gửi description').not.toHaveProperty('description');
    expect(mock.task(T.T6)!.description).toBe(original);
  });

  test('AC18 mô tả chứa phần tử không hỗ trợ (<table>) → editor khoá kèm ghi chú, không gửi description', async ({ app, mock }) => {
    const original = '<p>Bảng số liệu quý</p><table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>';
    mock.task(T.T8)!.description = original;
    await app.openReady();
    await app.openTask(T.T8);
    await app.tid('form-edit').click();
    await expect(app.tid('field-desc-locked')).toBeVisible();
    await expect(app.form()).toContainText(MSG.richDescNote);
    await app.tid('field-title').fill('Gọi lại khách hàng (có bảng)');
    await app.tid('form-submit').click();
    await expect(app.view()).toBeVisible();
    await expect.poll(() => mock.updates(T.T8).length).toBe(1);
    expect(mock.updates(T.T8)[0].body.data, 'khoá → không gửi description').not.toHaveProperty('description');
    expect(mock.task(T.T8)!.description).toBe(original);
  });

  test('AC18 mô tả có ảnh: sửa chữ vẫn giữ nguyên <img>', async ({ app, mock }) => {
    const src = 'https://acme.cogover.example/files/0/IMGE2E01/original/minh-hoa.png';
    mock.task(T.T1)!.description = `<p>Ảnh minh hoạ</p><p><img src="${src}" alt="minh hoạ"></p>`;
    await app.openReady();
    await app.openTask(T.T1);
    await app.tid('form-edit').click();
    await expect(app.tid('field-desc-locked')).toBeHidden();
    await expect(app.desc().locator(`img[src="${src}"]`), 'ảnh có sẵn hiển thị trong editor').toHaveCount(1);
    await app.caretEndOfFirstLine();
    await app.page.keyboard.type(' (đã sửa)');
    await app.tid('form-submit').click();
    await expect(app.view()).toBeVisible();
    await expect.poll(() => mock.updates(T.T1).length).toBe(1);
    const html = normalizeHtml(mock.updates(T.T1)[0].body.data.description);
    expect(html).toContain('Ảnh minh hoạ (đã sửa)');
    expect(html, 'giữ nguyên ảnh').toMatch(new RegExp(`<img[^>]*src="${src.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}"`));
    expect(html).not.toMatch(/\s(class|style|data-[\w-]+)=/);
  });

  test('AC18 mô tả văn bản thuần (<p>, <br>) nạp vào editor; gõ lại → <p> mỗi dòng, có escape', async ({ app, mock }) => {
    mock.task(T.T8)!.description = '<p>Dòng A<br>Dòng B</p>';
    await app.openReady();
    await app.openTask(T.T8);
    await app.tid('form-edit').click();
    await expect(app.tid('field-desc-locked')).toBeHidden();
    await expect.poll(() => app.descText()).toBe('Dòng A\nDòng B');

    await app.page.keyboard.press('Escape');
    await expect(app.view()).toBeVisible();
    await app.page.keyboard.press('Escape');
    await expect(app.dialog()).toBeHidden();
    expect(mock.updates(T.T8), 'mở sửa rồi huỷ không được ghi').toHaveLength(0);

    await app.openTask(T.T3);
    await app.tid('form-edit').click();
    await expect.poll(() => app.descText()).toBe('So sánh luồng bài thiền của Calm, Headspace và Balance.');
    await app.typeDescription(['Dòng một', 'Dòng <hai> & ba']);
    await app.tid('form-submit').click();
    await expect(app.view()).toBeVisible();
    await expect.poll(() => mock.updates(T.T3).length).toBe(1);
    expect(normalizeHtml(mock.updates(T.T3)[0].body.data.description)).toBe('<p>Dòng một</p><p>Dòng &lt;hai&gt; &amp; ba</p>');
    await expect(app.view()).toContainText('Dòng <hai> & ba');
  });
});
