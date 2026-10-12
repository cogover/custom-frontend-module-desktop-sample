import { test, expect } from '../../support/local/fixtures';
import { P } from '../../support/local/dataset';
import { F, N, seedNotes } from '../../support/local/notes-dataset';
import { NOTES_OBJECTS } from '../../support/model';
import { NotesUi } from '../../support/notes-ui';
import { chooseOption, optionLabels } from '../../support/ui';

/**
 * AC36 / CONTRACT 9.5 (2026-10-04): nút "Chia sẻ" trên trang ghi chú xanh (`data-on`) khi đang shared / public,
 * tên đọc nói rõ trạng thái; quyền mỗi dòng trong hộp Chia sẻ là Select shadcn (`share-role`, `data-value`).
 */
const NOTE = NOTES_OBJECTS.note.slug;

test.describe('AC36 nút Chia sẻ và quyền chia sẻ', () => {
  test.beforeEach(async ({ app, mock }) => {
    seedNotes(mock);
    await app.open();
    await app.ready();
    await new NotesUi(app.page).openFromDock();
  });

  test('AC36 nút Chia sẻ xanh (data-on) khi shared / public, tên đọc theo trạng thái; riêng tư → không xanh', async ({ page }) => {
    const notes = new NotesUi(page);
    const share = notes.tid('note-share');

    await notes.openNote(N.SHARED);
    await expect(share).toHaveAttribute('data-on', /.*/);
    await expect(share).toHaveAccessibleName('Chia sẻ (đang chia sẻ cho người / phòng)');

    await notes.openNote(N.PUBLIC);
    await expect(share).toHaveAttribute('data-on', /.*/);
    await expect(share).toHaveAccessibleName('Chia sẻ (đang công khai)');

    await notes.openNote(N.ROOT);
    await expect(share).not.toHaveAttribute('data-on', /.*/);
    await expect(share).toHaveAccessibleName('Chia sẻ');
    // nút xanh khác màu nút thường
    const offColor = await share.evaluate((el) => getComputedStyle(el).color);
    await notes.openNote(N.PUBLIC);
    const onColor = await share.evaluate((el) => getComputedStyle(el).color);
    expect(onColor, 'nút Chia sẻ đang bật có màu nhấn khác nút thường').not.toBe(offColor);
  });

  test('AC36 riêng tư → Chia sẻ cho người, quyền "Có thể sửa" bằng Select shadcn → lưu visibility + 4 danh sách đúng; nút chuyển xanh; về Riêng tư → hết xanh', async ({ mock, page }) => {
    const notes = new NotesUi(page);
    await notes.expand(F.WORK);
    await notes.openNote(N.PLAN);
    const share = notes.tid('note-share');
    await expect(share).not.toHaveAttribute('data-on', /.*/);
    await share.click();
    const dlg = page.getByTestId('share-dialog');
    await expect(dlg).toBeVisible();
    await dlg.getByTestId('share-vis-shared').check();
    await dlg.getByTestId('share-add').click();
    await page.getByTestId('share-search').fill('lan');
    await page.locator(`[data-testid="share-option-person"]`).filter({ hasText: 'Nguyễn Thị Lan' }).first().click();
    const entry = dlg.getByTestId('share-entry').filter({ hasText: 'Nguyễn Thị Lan' });
    await expect(entry).toHaveAttribute('data-kind', 'person');
    const role = entry.getByTestId('share-role');
    await expect(role, 'mặc định Có thể xem').toHaveAttribute('data-value', 'view');
    await expect(dlg.locator('select:not([aria-hidden="true"])'), 'không có <select> gốc').toHaveCount(0);
    expect(await optionLabels(page, role)).toEqual(['Có thể xem', 'Có thể sửa']);
    await chooseOption(page, role, 'Có thể sửa');
    await expect(role).toHaveAttribute('data-value', 'edit');
    await expect(dlg, 'chọn quyền không đóng hộp Chia sẻ').toBeVisible();
    await dlg.getByTestId('share-save').click();
    await expect(dlg).toBeHidden();

    await expect.poll(() => mock.genericWrites(NOTE, 'update').length).toBe(1);
    expect(mock.genericWrites(NOTE, 'update')[0].body.data).toMatchObject({
      id: N.PLAN,
      visibility: 'shared',
      editors: [P.LAN],
      viewers: null,
      viewer_departments: null,
      editor_departments: null,
    });
    await expect(share).toHaveAttribute('data-on', /.*/);
    await expect(share).toHaveAccessibleName('Chia sẻ (đang chia sẻ cho người / phòng)');

    await share.click();
    await dlg.getByTestId('share-vis-private').check();
    await dlg.getByTestId('share-save').click();
    await expect(dlg).toBeHidden();
    await expect.poll(() => mock.genericWrites(NOTE, 'update').length).toBe(2);
    expect(mock.genericWrites(NOTE, 'update')[1].body.data.visibility).toBe('private');
    await expect(share).not.toHaveAttribute('data-on', /.*/);
    await expect(share).toHaveAccessibleName('Chia sẻ');
    expect(mock.violations).toEqual([]);
  });
});
