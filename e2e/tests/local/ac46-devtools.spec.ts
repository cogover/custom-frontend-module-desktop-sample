import { test, expect } from '../../support/local/fixtures';

/**
 * AC46 / CONTRACT mục 12: app "Dev tools" trên dock (`dock-app-dev-tools`, `?app=devtools`), bốn công cụ chạy hoàn toàn
 * trong trình duyệt (không gọi API): JSON (định dạng + màu, báo dòng/cột lỗi), Markdown (xem trước an toàn, không tải gì),
 * JWT (giải mã, kiểm chữ ký bằng secret, tạo token), Base64 (mã hoá / giải mã UTF-8, URL-safe, đổi chiều).
 */

test.describe('AC46 Dev tools', () => {
  test('AC46 mở từ dock → ?app=devtools; JSON: hai nửa cạnh nhau, kết quả thụt 4 dấu cách (mặc định) có màu; lỗi báo dòng/cột; giữ sau tải lại', async ({ app, mock, page }) => {
    await app.openReady();
    const calls = mock.requests.length;
    await page.getByTestId('dock-app-dev-tools').click();
    await expect(page.getByTestId('devtools-app')).toBeVisible();
    await expect(page).toHaveURL(/[?&]app=devtools/);
    await expect(page.getByTestId('devtools-title')).toHaveText('Format & beautify JSON');
    await page.getByTestId('json-input').fill('{"a":[1,true,null,"x"],"b":{"c":"d"}}');
    const out = page.getByTestId('json-output');
    await expect(page.getByTestId('json-indent'), 'mặc định thụt 4 dấu cách').toHaveAttribute('data-value', '4');
    await expect(out).toHaveText('{\n    "a": [\n        1,\n        true,\n        null,\n        "x"\n    ],\n    "b": {\n        "c": "d"\n    }\n}');
    const colors = await out.evaluate((el) => ['j-key', 'j-str', 'j-num', 'j-bool', 'j-null'].map((c) => getComputedStyle(el.querySelector(`.${c}`)!).color));
    expect(new Set(colors).size, 'mỗi loại token một màu').toBe(5);
    const [a, b] = [(await page.getByTestId('json-input').boundingBox())!, (await out.boundingBox())!];
    expect(Math.abs(a.y - b.y), 'hai nửa cạnh nhau').toBeLessThanOrEqual(2);
    expect(b.x).toBeGreaterThan(a.x + a.width - 1);

    await page.getByTestId('json-indent').click();
    await page.getByRole('option', { name: 'Thu gọn một dòng' }).click();
    await expect(out).toHaveText('{"a":[1,true,null,"x"],"b":{"c":"d"}}');
    await page.getByTestId('json-input').fill('{\n  "a": 1,\n  "b": }');
    await expect(page.getByTestId('json-error')).toContainText('dòng 3, cột 8');

    expect(mock.requests.length, 'Dev tools không gọi API của Cogover').toBe(calls);

    await page.reload();
    await expect(page.getByTestId('devtools-app'), '?app=devtools mở lại sau khi tải lại').toBeVisible();
    await expect(page.getByTestId('json-input')).toHaveValue(''); // nội dung đã gõ không được lưu
    expect(mock.violations).toEqual([]);
  });

  test('AC46 Markdown xem trước (bảng, code, không chạy script, không tải ảnh / video theo URL); JWT giải mã + kiểm chữ ký + tạo token; Base64 mã hoá ⇄ giải mã', async ({ app, page }) => {
    await app.open('');
    await page.goto(page.url().replace(/[?#].*$/, '') + '?app=devtools');
    await expect(page.getByTestId('devtools-app')).toBeVisible();

    await page.getByTestId('devtools-nav-markdown').click();
    // bản xem trước không tải gì (mục 12): ảnh / video theo URL thành dòng chữ, chỉ ảnh nhúng data: được hiện
    const loads: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('khong-tai')) loads.push(r.url());
    });
    await page.getByTestId('markdown-input').fill(
      '# Tiêu đề\n\n**đậm** <img src="data:image/png;base64,AAAA" onerror="window.__md=1">\n\n' +
        '![Sơ đồ](https://tracker.test/khong-tai.png)\n\n<img src=khong-tai-x onerror="window.__md=2">\n\n' +
        '<video src="https://tracker.test/khong-tai.mp4" poster="/khong-tai-poster.png" autoplay></video>\n\n' +
        '<table background="/khong-tai-nen.png"><tr><td>ô</td></tr></table>\n\n' +
        '| a | b |\n| - | - |\n| 1 | 2 |\n\n```js\nlet x = 1\n```',
    );
    const md = page.getByTestId('markdown-output');
    await expect(md.locator('h1')).toHaveText('Tiêu đề');
    await expect(md.locator('table td')).toHaveCount(3);
    await expect(md.locator('pre code')).toContainText('let x = 1');
    await expect(md.locator('[data-blocked="img"]').first()).toHaveText('Ảnh không tải “Sơ đồ”: https://tracker.test/khong-tai.png');
    await expect(md.locator('[data-blocked="img"]').nth(1)).toHaveText('Ảnh không tải: khong-tai-x');
    await expect(md.locator('[data-blocked="video"]')).toHaveText('Video không tải: https://tracker.test/khong-tai.mp4');
    await expect(md.locator('img'), 'chỉ còn ảnh nhúng data:').toHaveCount(1);
    await expect(md.locator('video')).toHaveCount(0);
    await page.waitForTimeout(300); // cho trình duyệt kịp gửi request nếu còn thứ gì tải được
    expect(await page.evaluate(() => (window as any).__md), 'không chạy mã trong Markdown').toBeUndefined();
    expect(loads, 'bản xem trước Markdown không tải ảnh / video / ảnh nền').toEqual([]);

    await page.getByTestId('devtools-nav-jwt').click();
    await page.getByTestId('jwt-sample').click();
    await expect(page.getByTestId('jwt-header')).toContainText('"alg": "HS256"');
    await expect(page.getByTestId('jwt-payload')).toContainText('"name": "Trần Minh An"');
    await expect(page.getByTestId('jwt-check')).toHaveAttribute('data-check', 'valid');
    await page.getByTestId('jwt-secret').fill('sai');
    await expect(page.getByTestId('jwt-check')).toHaveAttribute('data-check', 'invalid');
    const sample = await page.getByTestId('jwt-input').inputValue();
    await page.getByTestId('jwt-mode-encode').click();
    await page.getByTestId('jwt-sign-secret').fill('bi-mat-demo');
    await expect(page.getByTestId('jwt-token'), 'cùng payload + secret → đúng token mẫu').toHaveText(sample);

    await page.getByTestId('devtools-nav-base64').click();
    await page.getByTestId('base64-input').fill('Xin chào 👋 Việt Nam');
    await expect(page.getByTestId('base64-output')).toHaveText('WGluIGNow6BvIPCfkYsgVmnhu4d0IE5hbQ==');
    await page.getByTestId('base64-swap').click();
    await expect(page.getByTestId('base64-mode')).toHaveAttribute('data-value', 'decode');
    await expect(page.getByTestId('base64-output')).toHaveText('Xin chào 👋 Việt Nam');
    // cột trái ẩn / hiện như các app khác: ẩn → công cụ thành tab trên thanh tiêu đề
    await page.getByTestId('devtools-app').getByTestId('side-toggle').click();
    await expect(page.getByTestId('devtools-nav-json')).toHaveCount(0);
    await page.getByTestId('devtools-tab-json').click();
    await expect(page.getByTestId('devtools-title')).toHaveText('Format & beautify JSON');
    await page.getByTestId('devtools-app').getByTestId('side-toggle').click();
    await expect(page.getByTestId('devtools-nav-json')).toHaveAttribute('aria-pressed', 'true');
    // đổi công cụ rồi quay lại: nội dung đã gõ còn nguyên
    await page.getByTestId('devtools-nav-markdown').click();
    await expect(page.getByTestId('markdown-input')).toHaveValue(/^# Tiêu đề/);
  });
});
