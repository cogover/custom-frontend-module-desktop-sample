import { test, expect } from '../../support/local/fixtures';
import { T } from '../../support/local/dataset';
import { F, N, seedNotes } from '../../support/local/notes-dataset';
import { FONT_PX, HEADING_PX } from '../../support/model';
import { fontPx, fontViolations } from '../../support/fonts';
import { NotesUi } from '../../support/notes-ui';

/**
 * AC39 / CONTRACT mục 5 "Cỡ chữ" (2026-10-04): một cỡ 13.5px cho mọi chữ của các app (nhãn, nút, ô nhập, thẻ,
 * cây, popup, menu, toast, nội dung), riêng h1 / h2 20px; chỉ chữ cái avatar khác. Đo computed font-size của mọi
 * chữ đang hiển thị ở từng màn hình tiêu biểu.
 */
const DESC_WITH_HEADINGS = '<h1>Tiêu đề một</h1><h2>Tiêu đề hai</h2><h3>Tiêu đề ba</h3><p>Đoạn văn <strong>đậm</strong>.</p><ul><li>Mục</li></ul>';

test.describe('AC39 cỡ chữ 13.5px, h1/h2 20px', () => {
  test('AC39 Công việc: danh sách, hover card, menu Trợ giúp, Select, popup xem (mô tả có h1/h2/h3, hoạt động), form sửa + lịch, toast', async ({ app, mock, page }) => {
    mock.task(T.T1)!.description = DESC_WITH_HEADINGS;
    await app.openReady();
    expect(await fontViolations(page), 'danh sách Công việc').toEqual([]);
    expect(await fontPx(page.locator('[data-testid="task-item"]').first().getByTestId('task-title'))).toBe(FONT_PX);
    expect(await fontPx(app.tid('search'))).toBe(FONT_PX);
    expect(await fontPx(app.tid('open-create'))).toBe(FONT_PX);
    expect(await fontPx(page.locator('h1.brand').first()), 'tên app h1.brand').toBe(HEADING_PX);
    expect(await fontPx(app.tid('list-title')), 'tiêu đề danh sách').toBe(HEADING_PX);

    await app.inItem(T.T1, 'task-reporter').hover();
    await expect(page.getByTestId('task-reporter-card')).toBeVisible();
    expect(await fontViolations(page), 'hover card').toEqual([]);
    await page.mouse.move(5, 5);

    await app.tid('help-toggle').click();
    await expect(app.tid('help-menu')).toBeVisible();
    expect(await fontViolations(page), 'menu Trợ giúp (kbd)').toEqual([]);
    await page.keyboard.press('Escape');

    await app.tid('sort-by').click();
    await expect(page.getByRole('option').first()).toBeVisible();
    expect(await fontViolations(page), 'danh sách Select').toEqual([]);
    await page.keyboard.press('Escape');

    await app.openTask(T.T1);
    await expect(app.tid('activity-item').first()).toBeVisible();
    expect(await fontViolations(page), 'popup xem + hoạt động').toEqual([]);
    const view = app.view();
    expect(await fontPx(view.locator('h1, h2').filter({ hasText: 'Tiêu đề một' })), 'h1 trong mô tả').toBe(HEADING_PX);
    expect(await fontPx(view.locator('h2').filter({ hasText: 'Tiêu đề hai' })), 'h2 trong mô tả').toBe(HEADING_PX);
    expect(await fontPx(view.locator('h3').filter({ hasText: 'Tiêu đề ba' })), 'h3 trong mô tả 13.5px').toBe(FONT_PX);
    expect(await fontPx(page.getByRole('dialog').getByRole('heading', { name: 'Viết nội dung cho 4 màn hình onboarding' })), 'tên task trong popup').toBe(HEADING_PX);

    await app.tid('form-edit').click();
    await expect(app.form()).toBeVisible();
    expect(await fontViolations(page), 'form sửa').toEqual([]);
    await app.tid('field-due-date').click();
    await expect(app.calendar()).toBeVisible();
    expect(await fontViolations(page), 'lịch').toEqual([]);
    await page.keyboard.press('Escape');
    await app.tid('form-cancel').click();
    await page.keyboard.press('Escape');
    await expect(app.dialog()).toBeHidden();

    // tick Đang xử lý → Đã xử lý: rời danh sách kèm toast
    await app.inItem(T.T1, 'task-checkbox').click();
    await expect(app.toast()).toBeVisible();
    expect(await fontViolations(page), 'toast').toEqual([]);
  });

  test('AC39 Ghi chú: cây, ghi chú (h1/h2/h3 trong nội dung), form soạn, hộp Chia sẻ', async ({ app, mock, page }) => {
    seedNotes(mock);
    await app.openReady();
    const notes = new NotesUi(page);
    await notes.openFromDock();
    await notes.expand(F.WORK);
    await notes.openNote(N.PLAN);
    expect(await fontViolations(page), 'cây + xem ghi chú').toEqual([]);
    expect(await fontPx(notes.root().locator('h1.brand')), 'tên app h1.brand').toBe(HEADING_PX);
    expect(await fontPx(notes.tid('note-title')), 'tiêu đề ghi chú').toBe(HEADING_PX);
    const content = notes.tid('note-content');
    expect(await fontPx(content.locator('h1')), 'h1 trong nội dung').toBe(HEADING_PX);
    expect(await fontPx(content.locator('h2')), 'h2 trong nội dung').toBe(HEADING_PX);
    expect(await fontPx(content.locator('h3')), 'h3 trong nội dung').toBe(FONT_PX);
    expect(await fontPx(content.locator('p').first()), 'đoạn nội dung').toBe(FONT_PX);
    expect(await fontPx(notes.noteItem(N.PLAN)), 'mục trong cây').toBe(FONT_PX);

    await notes.tid('note-edit').click();
    await expect(notes.tid('note-editor')).toBeVisible();
    expect(await fontViolations(page), 'form soạn ghi chú').toEqual([]);
    await notes.tid('note-cancel').click();

    await notes.tid('note-share').click();
    await expect(page.getByTestId('share-dialog')).toBeVisible();
    expect(await fontViolations(page), 'hộp Chia sẻ').toEqual([]);
  });

  test('AC39 Cài đặt: tên app h1, tiêu đề h2 20px, còn lại 13.5px', async ({ app, page }) => {
    await app.openReady();
    await page.getByTestId('dock-app-cai-dat').click();
    await expect(page.getByTestId('wallpaper-choose')).toBeEnabled();
    expect(await fontViolations(page), 'Cài đặt').toEqual([]);
    const s = page.getByTestId('settings-app');
    expect(await fontPx(s.locator('h1.brand'))).toBe(HEADING_PX);
    expect(await fontPx(s.getByRole('heading', { level: 2, name: 'Hình nền Desktop' }))).toBe(HEADING_PX);
    expect(await fontPx(page.getByTestId('wallpaper-choose'))).toBe(FONT_PX);
    expect(await fontPx(page.getByTestId('wallpaper-name'))).toBe(FONT_PX);
  });
});
