import { test, expect } from '../../support/local/fixtures';
import { F, FOLDER_NAME, N, NOTE_TITLE, seedNotes } from '../../support/local/notes-dataset';
import { NOTES_OBJECTS, WORKSPACE_ID } from '../../support/model';
import { NotesUi } from '../../support/notes-ui';
import { chooseOption, optionLabels } from '../../support/ui';

/**
 * AC35 / CONTRACT 9.5 "Form soạn" (2026-10-04): Thư mục · Định dạng là Select shadcn (trigger mang `data-value`),
 * mục cuối "Tạo thư mục mới…" mở popup "Thư mục mới"; ô Nội dung cao hết cửa sổ + nút Phóng to (Esc thu nhỏ).
 */
const FOLDER = NOTES_OBJECTS.folder.slug;
const NOTE = NOTES_OBJECTS.note.slug;

test.describe('AC35 form soạn Ghi chú', () => {
  test.beforeEach(async ({ app, mock }) => {
    seedNotes(mock);
    await app.open();
    await app.ready();
    await new NotesUi(app.page).openFromDock();
  });

  test('AC35 Thư mục / Định dạng là Select shadcn (không <select>), trigger mang data-value; hàng Thư mục · Định dạng · Thẻ cùng một hàng', async ({ page }) => {
    const notes = new NotesUi(page);
    await notes.expand(F.WORK);
    await notes.openNote(N.PLAN);
    await notes.tid('note-edit').click();
    await expect(notes.tid('note-editor')).toBeVisible();
    // Radix Select chỉ chèn một <select aria-hidden> ẩn để hỗ trợ form — không có <select> gốc người dùng thấy.
    await expect(notes.tid('note-editor').locator('select:not([aria-hidden="true"])'), 'không dùng <select> gốc').toHaveCount(0);
    await expect(notes.tid('note-folder')).toHaveAttribute('data-value', F.WORK);
    await expect(notes.tid('note-folder')).toContainText(FOLDER_NAME[F.WORK]);
    await expect(notes.tid('note-format')).toHaveAttribute('data-value', '2');
    await expect(notes.tid('note-format')).toHaveText('Văn bản định dạng');

    const folderOpts = await optionLabels(page, notes.tid('note-folder'));
    expect(folderOpts[0]).toBe('Không thuộc thư mục nào');
    expect(folderOpts).toEqual(expect.arrayContaining([FOLDER_NAME[F.WORK], FOLDER_NAME[F.MEET], FOLDER_NAME[F.HOME]]));
    expect(folderOpts.at(-1), 'mục cuối là "Tạo thư mục mới…"').toMatch(/Tạo thư mục mới…$/);
    // Thứ tự như CONTRACT 9.5 "Soạn": Văn bản định dạng / Markdown / Văn bản thuần.
    expect(await optionLabels(page, notes.tid('note-format'))).toEqual(['Văn bản định dạng', 'Markdown', 'Văn bản thuần']);

    await chooseOption(page, notes.tid('note-folder'), FOLDER_NAME[F.HOME]);
    await expect(notes.tid('note-folder')).toHaveAttribute('data-value', F.HOME);
    await chooseOption(page, notes.tid('note-folder'), 'Không thuộc thư mục nào');
    await expect(notes.tid('note-folder')).toHaveAttribute('data-value', '');

    // Thư mục · Định dạng · Thẻ cùng một hàng ở 1440px
    const tops = await Promise.all(
      [notes.tid('note-folder'), notes.tid('note-format'), notes.tid('tag-picker').or(notes.tid('tag-add')).first()].map(async (l) => Math.round((await l.boundingBox())!.y)),
    );
    expect(Math.max(...tops) - Math.min(...tops), `Thư mục / Định dạng / Thẻ cùng hàng (y: ${tops.join(', ')})`).toBeLessThanOrEqual(12);
  });

  test('AC35 "Tạo thư mục mới…" → popup "Thư mục mới" (tên bắt buộc, "Nằm trong" = thư mục đang chọn) → tạo notes_cat rồi chọn luôn cho ghi chú; lưu ghi chú vào thư mục đó', async ({ mock, page }) => {
    const notes = new NotesUi(page);
    await notes.tid('notes-new').click();
    await expect(notes.tid('note-editor')).toBeVisible();
    await notes.tid('note-title-input').fill('Ý tưởng sản phẩm');
    await chooseOption(page, notes.tid('note-folder'), FOLDER_NAME[F.WORK]);
    await chooseOption(page, notes.tid('note-folder'), /Tạo thư mục mới…/);

    const dlg = page.getByTestId('new-folder-dialog');
    await expect(dlg).toBeVisible();
    await expect(dlg.getByRole('heading', { name: 'Thư mục mới' })).toBeVisible();
    await expect(page.getByTestId('new-folder-name'), 'ô tên có focus').toBeFocused();
    await expect(page.getByTestId('new-folder-parent'), '"Nằm trong" mặc định là thư mục đang chọn').toHaveAttribute('data-value', F.WORK);
    await page.getByTestId('new-folder-create').click();
    await expect(page.getByTestId('new-folder-error'), 'tên bắt buộc').toBeVisible();
    expect(mock.genericWrites(FOLDER, 'create')).toHaveLength(0);

    await page.getByTestId('new-folder-name').fill('Ý tưởng');
    await page.getByTestId('new-folder-create').click();
    await expect(dlg).toBeHidden();
    await expect.poll(() => mock.genericWrites(FOLDER, 'create').length).toBe(1);
    const created = mock.genericWrites(FOLDER, 'create')[0];
    expect(created.body.data).toEqual({ object_type: NOTES_OBJECTS.folder.id, workspace_id: WORKSPACE_ID, name: 'Ý tưởng', parent_folder: F.WORK, owner: mock.meId });
    const newId = created.response.data.id as string;
    await expect(notes.tid('note-folder'), 'thư mục vừa tạo được chọn cho ghi chú').toHaveAttribute('data-value', newId);
    await expect(notes.tid('note-folder')).toContainText('Ý tưởng');
    await expect(notes.tid('note-title-input'), 'form giữ nguyên tiêu đề đang nhập').toHaveValue('Ý tưởng sản phẩm');
    await expect(notes.folderItem(F.WORK).getByRole('treeitem', { name: 'Ý tưởng' }), 'thư mục mới nằm trong "Công việc"').toBeVisible();

    await chooseOption(page, notes.tid('note-format'), 'Văn bản thuần');
    await expect(notes.tid('note-format')).toHaveAttribute('data-value', '1');
    await notes.tid('note-text').fill('Dòng ý tưởng đầu tiên');
    await notes.tid('note-save').click();
    await expect(notes.tid('note-view')).toBeVisible();
    await expect.poll(() => mock.genericWrites(NOTE, 'create').length).toBe(1);
    const d = mock.genericWrites(NOTE, 'create')[0].body.data;
    expect(d.folder).toBe(newId);
    expect(d.content).toEqual({ text_type: 1, value: 'Dòng ý tưởng đầu tiên' });
    await expect(notes.tid('crumb')).toHaveText([FOLDER_NAME[F.WORK], 'Ý tưởng']);
    expect(mock.violations).toEqual([]);
  });

  test('AC35 "Tạo thư mục mới…" rồi Huỷ / Esc → không tạo, giữ thư mục đã chọn', async ({ mock, page }) => {
    const notes = new NotesUi(page);
    await notes.tid('notes-new').click();
    await chooseOption(page, notes.tid('note-folder'), FOLDER_NAME[F.HOME]);
    await chooseOption(page, notes.tid('note-folder'), /Tạo thư mục mới…/);
    const dlg = page.getByTestId('new-folder-dialog');
    await expect(dlg).toBeVisible();
    await page.getByTestId('new-folder-name').fill('Không tạo');
    await dlg.getByRole('button', { name: 'Huỷ' }).click();
    await expect(dlg).toBeHidden();
    await expect(notes.tid('note-folder')).toHaveAttribute('data-value', F.HOME);
    await chooseOption(page, notes.tid('note-folder'), /Tạo thư mục mới…/);
    await expect(dlg).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await expect(notes.tid('note-editor'), 'Esc chỉ đóng popup thư mục').toBeVisible();
    await expect(notes.tid('note-folder')).toHaveAttribute('data-value', F.HOME);
    expect(mock.genericWrites(FOLDER)).toHaveLength(0);
  });

  test('AC35 ô Nội dung cao hết cửa sổ (cách mép dưới ~24px), nút Phóng to phủ cả cửa sổ Ghi chú + tiêu đề + Lưu; Thu nhỏ / Esc về, nội dung giữ nguyên', async ({ mock, page }) => {
    const notes = new NotesUi(page);
    await notes.tid('notes-new').click();
    await notes.tid('note-title-input').fill('Ghi chú dài');
    await chooseOption(page, notes.tid('note-format'), 'Markdown');
    const text = Array.from({ length: 80 }, (_, i) => `- dòng ${i + 1}`).join('\n');
    await notes.tid('note-text').fill(text);

    const body = notes.tid('note-body');
    await expect(body).not.toHaveAttribute('data-expanded', /.*/);
    const win = (await notes.root().locator('.board').first().boundingBox())!;
    const normal = (await body.boundingBox())!;
    expect(normal.height, 'ô nội dung tối thiểu 240px').toBeGreaterThanOrEqual(240);
    const gap = win.y + win.height - (normal.y + normal.height);
    expect(gap, `ô nội dung kéo tới cách mép dưới cửa sổ ~24px (còn ${Math.round(gap)}px)`).toBeLessThanOrEqual(40);
    // viết dài thì cuộn bên trong ô, trang không dài ra
    const ta = notes.tid('note-text');
    expect(await ta.evaluate((el) => el.scrollHeight > el.clientHeight), 'nội dung dài cuộn trong ô').toBe(true);

    await expect(notes.tid('note-expand')).toHaveText(/Phóng to/);
    await notes.tid('note-expand').click();
    await expect(body).toHaveAttribute('data-expanded', /.*/);
    await expect(notes.tid('note-expand')).toHaveAttribute('aria-pressed', 'true');
    await expect(notes.tid('note-expand')).toHaveText(/Thu nhỏ/);
    await expect(notes.tid('note-body-title')).toHaveText('Ghi chú dài');
    await expect(body.getByRole('button', { name: 'Lưu' }), 'nút Lưu ở trên ô phóng to').toBeVisible();
    const big = (await body.boundingBox())!;
    expect(big.width, 'phóng to rộng hơn').toBeGreaterThan(normal.width);
    expect(big.height, 'phóng to cao hơn').toBeGreaterThan(normal.height);
    expect(big.width, 'phủ gần hết bề ngang cửa sổ Ghi chú').toBeGreaterThan(win.width * 0.9);
    await expect(ta).toHaveValue(text);

    await page.keyboard.press('Escape');
    await expect(body, 'Esc thu nhỏ').not.toHaveAttribute('data-expanded', /.*/);
    await expect(notes.tid('note-editor'), 'Esc không đóng form').toBeVisible();
    await expect(ta).toHaveValue(text);

    await notes.tid('note-expand').click();
    await expect(body).toHaveAttribute('data-expanded', /.*/);
    await notes.tid('note-expand').click();
    await expect(body).not.toHaveAttribute('data-expanded', /.*/);
    await expect(ta).toHaveValue(text);

    // Lưu từ trạng thái phóng to
    await notes.tid('note-expand').click();
    await body.getByRole('button', { name: 'Lưu' }).click();
    await expect(notes.tid('note-view')).toBeVisible();
    await expect.poll(() => mock.genericWrites(NOTE, 'create').map((r) => r.body.data.content)).toEqual([{ text_type: 3, value: text }]);
    expect(mock.violations).toEqual([]);
  });

  test('AC35 sửa ghi chú: đổi thư mục bằng Select → 10201 có folder mới; ghi chú đi theo thư mục trong cây', async ({ mock, page }) => {
    const notes = new NotesUi(page);
    await notes.openNote(N.ROOT);
    await notes.tid('note-edit').click();
    await expect(notes.tid('note-folder')).toHaveAttribute('data-value', '');
    await chooseOption(page, notes.tid('note-folder'), FOLDER_NAME[F.HOME]);
    await notes.tid('note-save').click();
    await expect(notes.tid('note-view')).toBeVisible();
    await expect.poll(() => mock.genericWrites(NOTE, 'update').length).toBe(1);
    expect(mock.genericWrites(NOTE, 'update')[0].body.data).toMatchObject({ id: N.ROOT, folder: F.HOME, name: NOTE_TITLE[N.ROOT] });
    await expect(notes.tid('crumb')).toHaveText([FOLDER_NAME[F.HOME]]);
    expect(mock.violations).toEqual([]);
  });
});
