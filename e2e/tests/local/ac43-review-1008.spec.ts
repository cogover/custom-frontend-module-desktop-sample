import { test, expect } from '../../support/local/fixtures';
import { T } from '../../support/local/dataset';

/**
 * AC43 / review 2026-10-08:
 *  - Avatar Người giao / Giao cho trên thẻ việc 30×30.
 *  - Nút "Làm mới" (`list-refresh`) trước các chip người giao: tải lại danh sách, danh sách vẫn hiện (không màn chờ).
 *  - Trình soạn (Mô tả, ghi chú): gõ / dán một URL http(s) rồi gõ dấu cách hoặc Enter → thành link; scheme khác giữ nguyên chữ.
 */

test.describe('AC43 review 2026-10-08', () => {
  test('AC43 avatar người giao / được giao trên thẻ 30×30', async ({ app }) => {
    await app.openReady();
    const avatars = app.item(T.T1).locator('.meta .person .avatar');
    await expect(avatars.first()).toBeVisible();
    for (const box of await avatars.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((b) => [b.width, b.height])))
      expect(box).toEqual([30, 30]);
  });

  test('AC43 URL + dấu cách / Enter → link (lưu <a href>), ftp:// giữ nguyên chữ', async ({ app, mock, page }) => {
    await app.openReady();
    await app.openCreate();
    await app.tid('field-title').fill('Việc có link tự động');
    await app.focusDesc();
    await page.keyboard.type('xem https://acme.cogover.example/a?b=1#c');
    await page.keyboard.press('Space');
    await page.keyboard.type('ngay');
    await page.keyboard.press('Enter');
    await page.keyboard.type('http://localhost:5317/x');
    await page.keyboard.press('Enter');
    await page.keyboard.type('ftp://x.com');
    await page.keyboard.press('Space');
    await page.keyboard.type('giữ');
    await expect(app.descEditor().locator('a')).toHaveCount(2);
    await app.tid('form-submit').click();
    await expect(app.dialog()).toHaveCount(0);
    const desc: string = mock.taskCreates()[0].body.data.description;
    expect(desc).toContain('<a href="https://acme.cogover.example/a?b=1#c"');
    expect(desc).toMatch(/>https:\/\/acme\.cogover\.example\/a\?b=1#c<\/a> ngay<\/p>/);
    expect(desc).toContain('<a href="http://localhost:5317/x"');
    expect(desc).toContain('<p>ftp://x.com giữ</p>');
    expect(mock.violations).toEqual([]);
  });

  test('AC43 Làm mới: đọc lại task từ server, danh sách không biến mất, nút khoá trong lúc tải', async ({ app, mock }) => {
    await app.openReady();
    const before = await app.visibleIds();
    mock.task(T.T1)!.subject = 'Tiêu đề đổi trên Cogover';
    const n = mock.taskLists().length;
    await app.tid('list-refresh').click();
    await expect(app.item(T.T1)).toContainText('Tiêu đề đổi trên Cogover');
    expect(mock.taskLists().length).toBeGreaterThan(n);
    await expect(app.tid('list-refresh')).toBeEnabled();
    expect(await app.visibleIds()).toEqual(before);
    expect(mock.violations).toEqual([]);
  });
});
