import { test, expect } from '../../support/local/fixtures';
import { F, FOLDER_NAME, N, NOTE_TITLE, seedNotes } from '../../support/local/notes-dataset';
import { NOTES_OBJECTS } from '../../support/model';
import { NotesUi } from '../../support/notes-ui';

/**
 * AC37 / CONTRACT 9.3 "Kéo thả trong cây" (2026-10-04) và nút `new-folder` luôn tạo ở gốc.
 * Mock: thư mục Công việc ⊃ Họp, Cá nhân; ghi chú gốc "Ghi chú gốc".
 */
const FOLDER = NOTES_OBJECTS.folder.slug;
const NOTE = NOTES_OBJECTS.note.slug;

test.describe('AC37 cây Ghi chú: kéo thả, tạo thư mục ở gốc', () => {
  test.beforeEach(async ({ app, mock }) => {
    seedNotes(mock);
    await app.open();
    await app.ready();
    await new NotesUi(app.page).openFromDock();
  });

  test('AC37 kéo thư mục "Cá nhân" thả lên "Công việc" → ô đích xanh, dải "Thả vào đây…" chỉ hiện lúc kéo; 10201 chỉ parent_folder; toast; thành thư mục con', async ({ mock, page }) => {
    const notes = new NotesUi(page);
    await expect(notes.tid('tree-root-drop'), 'chưa kéo thì không có dải thả về gốc').toHaveCount(0);
    expect(await notes.level(notes.folderItem(F.HOME))).toBe(1);

    const drag = await notes.dragTo(notes.folderRow(F.HOME), () => notes.folderRow(F.WORK));
    await expect(notes.tid('tree-root-drop')).toBeVisible();
    await expect(notes.tid('tree-root-drop')).toHaveText('Thả vào đây để đưa ra thư mục gốc');
    await expect(notes.folderRow(F.WORK), 'ô đích hợp lệ có data-drop-target="ok"').toHaveAttribute('data-drop-target', 'ok');
    await expect(page.getByTestId('drag-ghost')).toContainText(FOLDER_NAME[F.HOME]);
    expect(mock.genericWrites(FOLDER), 'chưa thả thì chưa ghi').toHaveLength(0);
    await drag.release();

    await expect.poll(() => mock.genericWrites(FOLDER, 'update').length).toBe(1);
    const w = mock.genericWrites(FOLDER, 'update')[0];
    expect(w.body.data, 'chỉ gửi parent_folder (+ id, object_type, workspace_id)').toEqual({
      object_type: NOTES_OBJECTS.folder.id,
      workspace_id: 'WSDEMO0000001',
      parent_folder: F.WORK,
      id: F.HOME,
    });
    await expect(notes.toast()).toContainText(`Đã chuyển thư mục “${FOLDER_NAME[F.HOME]}” vào “${FOLDER_NAME[F.WORK]}”`);
    await expect(page.getByTestId('drag-ghost')).toHaveCount(0);
    await expect(notes.tid('tree-root-drop')).toHaveCount(0);
    await expect(notes.folderItem(F.WORK)).toHaveAttribute('aria-expanded', 'true');
    await expect(notes.folderItem(F.WORK).locator(`[data-testid="folder-item"][data-id="${F.HOME}"]`)).toBeVisible();
    expect(await notes.level(notes.folderItem(F.HOME))).toBe(2);
    expect(mock.record(FOLDER, F.HOME)?.parent_folder).toBe(F.WORK);
    expect(mock.violations).toEqual([]);
  });

  test('AC37 kéo thư mục con "Họp" thả lên dải "Thả vào đây…" → parent_folder null, về gốc; toast "ra thư mục gốc"', async ({ mock, page }) => {
    const notes = new NotesUi(page);
    await notes.expand(F.WORK);
    expect(await notes.level(notes.folderItem(F.MEET))).toBe(2);
    const drag = await notes.dragTo(notes.folderRow(F.MEET), () => notes.tid('tree-root-drop'));
    await expect(notes.tid('tree-root-drop')).toHaveAttribute('data-drop-target', 'ok');
    await drag.release();
    await expect.poll(() => mock.genericWrites(FOLDER, 'update').map((r) => r.body.data)).toEqual([
      { object_type: NOTES_OBJECTS.folder.id, workspace_id: 'WSDEMO0000001', parent_folder: null, id: F.MEET },
    ]);
    await expect(notes.toast()).toContainText(`Đã chuyển thư mục “${FOLDER_NAME[F.MEET]}” ra thư mục gốc`);
    await expect.poll(() => notes.level(notes.folderItem(F.MEET))).toBe(1);
    expect(mock.violations).toEqual([]);
  });

  test('AC37 kéo ghi chú gốc thả lên thư mục "Cá nhân" → 10201 notes_content chỉ folder; thả lên dải đầu → folder null', async ({ mock, page }) => {
    const notes = new NotesUi(page);
    let drag = await notes.dragTo(notes.noteRow(N.ROOT), () => notes.folderRow(F.HOME));
    await expect(notes.folderRow(F.HOME)).toHaveAttribute('data-drop-target', 'ok');
    await drag.release();
    await expect.poll(() => mock.genericWrites(NOTE, 'update').map((r) => r.body.data)).toEqual([
      { object_type: NOTES_OBJECTS.note.id, workspace_id: 'WSDEMO0000001', folder: F.HOME, id: N.ROOT },
    ]);
    await expect(notes.toast()).toContainText(`Đã chuyển “${NOTE_TITLE[N.ROOT]}” vào “${FOLDER_NAME[F.HOME]}”`);
    await expect(notes.folderItem(F.HOME).locator(`[data-testid="note-item"][data-id="${N.ROOT}"]`)).toBeVisible();
    await expect(notes.tid('note-view'), 'kết thúc kéo không mở ghi chú').toHaveCount(0);

    drag = await notes.dragTo(notes.noteRow(N.ROOT), () => notes.tid('tree-root-drop'));
    await drag.release();
    await expect.poll(() => mock.genericWrites(NOTE, 'update').length).toBe(2);
    expect(mock.genericWrites(NOTE, 'update')[1].body.data.folder).toBeNull();
    await expect(notes.toast()).toContainText(`Đã chuyển “${NOTE_TITLE[N.ROOT]}” ra thư mục gốc`);
    await expect.poll(() => notes.level(notes.noteItem(N.ROOT))).toBe(1);
    expect(mock.violations).toEqual([]);
  });

  test('AC37 không cho thả thư mục vào chính nó / thư mục con / nơi đang ở (ô đích không xanh, không ghi); Esc huỷ kéo; bấm không di = click thường', async ({ mock, page }) => {
    const notes = new NotesUi(page);
    await notes.expand(F.WORK);
    // "Công việc" thả vào thư mục con "Họp"
    let drag = await notes.dragTo(notes.folderRow(F.WORK), () => notes.folderRow(F.MEET));
    await expect(notes.folderRow(F.MEET)).toHaveAttribute('data-drop-target', 'no');
    await drag.release();
    // "Họp" thả vào chính cha của nó (nơi đang ở)
    drag = await notes.dragTo(notes.folderRow(F.MEET), () => notes.folderRow(F.WORK));
    await expect(notes.folderRow(F.WORK)).toHaveAttribute('data-drop-target', 'no');
    await drag.release();
    // ghi chú gốc thả về gốc (đang ở gốc)
    drag = await notes.dragTo(notes.noteRow(N.ROOT), () => notes.tid('tree-root-drop'));
    await expect(notes.tid('tree-root-drop')).toHaveAttribute('data-drop-target', 'no');
    await drag.release();
    // Esc huỷ: nhãn kéo biến mất, thả sau đó không ghi
    drag = await notes.dragTo(notes.folderRow(F.HOME), () => notes.folderRow(F.WORK));
    await expect(notes.folderRow(F.WORK)).toHaveAttribute('data-drop-target', 'ok');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('drag-ghost')).toHaveCount(0);
    await drag.release();
    await page.waitForTimeout(400);
    expect(mock.genericWrites(FOLDER), 'không có request ghi thư mục').toHaveLength(0);
    expect(mock.genericWrites(NOTE), 'không có request ghi ghi chú').toHaveLength(0);
    expect(await notes.level(notes.folderItem(F.HOME))).toBe(1);

    // bấm không di chuột = click thường: thu gọn thư mục / mở ghi chú
    await notes.folderRow(F.WORK).click();
    await expect(notes.folderItem(F.WORK)).toHaveAttribute('aria-expanded', 'false');
    await notes.openNote(N.ROOT);
    expect(mock.writes()).toHaveLength(0);
  });

  test('AC37 nút "Tạo thư mục" ở đầu mục Thư mục luôn tạo ở gốc, kể cả khi đang mở ghi chú trong thư mục con', async ({ mock, page }) => {
    const notes = new NotesUi(page);
    await notes.expand(F.WORK);
    await notes.expand(F.MEET);
    await notes.openNote(N.MEET);
    await notes.tid('new-folder').click();
    const box = notes.tid('folder-name-input');
    await expect(box).toBeFocused();
    await box.fill('Lưu trữ');
    await box.press('Enter');
    await expect.poll(() => mock.genericWrites(FOLDER, 'create').length).toBe(1);
    const d = mock.genericWrites(FOLDER, 'create')[0].body.data;
    expect(d.name).toBe('Lưu trữ');
    expect(d.parent_folder, 'tạo ở gốc dù đang mở ghi chú trong "Họp"').toBeNull();
    expect(d.owner).toBe(mock.meId);
    const row = notes.root().getByRole('treeitem', { name: 'Lưu trữ' });
    await expect(row).toBeVisible();
    expect(await notes.level(row)).toBe(1);
    await expect(notes.toast()).toContainText('Đã tạo thư mục “Lưu trữ”');
    expect(mock.violations).toEqual([]);
  });
});
