import { test, expect } from '../../support/local/fixtures';

/**
 * Ca hồi quy cho lỗi chập chờn: gõ mô tả rồi đổi trường khác (hạn chót / ưu tiên) → editor bị mount lại, mất nội dung.
 * Chỉ chạy khi E2E_STRESS=1, ví dụ:
 *   E2E_STRESS=1 npx playwright test tests/local/stress-desc-remount.spec.ts --project=local --repeat-each=150 --workers=8
 */
test.skip(!process.env.E2E_STRESS, 'Chỉ chạy khi E2E_STRESS=1');

for (const action of ['chọn hạn chót', 'chọn ưu tiên'] as const) {
  test(`AC10 mô tả không mất khi ${action} ngay sau khi gõ`, async ({ app, page }) => {
    await app.openReady();
    await app.openCreate();
    await app.tid('field-title').fill('Kiểm tra mô tả không mất');
    await app.focusDesc();
    await page.keyboard.type('Nội dung');
    await app.desc().evaluate((el) => ((el as any).__e2eMark = 1));
    expect(await app.descText()).toBe('Nội dung');
    if (action === 'chọn hạn chót') await app.pickDate(app.tid('field-due-date'), '2026-10-03');
    else await app.pickPriority('high');
    const sameEditor = await app.desc().evaluate((el) => (el as any).__e2eMark === 1);
    expect(await app.descText(), 'mô tả vừa gõ phải còn').toBe('Nội dung');
    expect(sameEditor, 'editor không được mount lại').toBe(true);
  });
}
