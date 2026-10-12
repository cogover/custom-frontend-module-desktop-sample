import type { Page } from '@playwright/test';
import { test, expect } from '../../support/local/fixtures';
import { T } from '../../support/local/dataset';
import { N, NOTE_TITLE, seedNotes } from '../../support/local/notes-dataset';
import { NotesUi } from '../../support/notes-ui';

/**
 * AC38 / CONTRACT 9.1 (2026-10-04): URL `?app=tasks|notes|settings&q=<từ khoá>#/task|note/<id>` theo cửa sổ ở trước,
 * refresh về đúng app / mục / từ khoá; chuyển app → URL theo app mới; đóng cửa sổ ở trước → URL sạch.
 */

/** app, q, hash của URL hiện tại. */
const url = (page: Page) => {
  const u = new URL(page.url());
  return { app: u.searchParams.get('app'), q: u.searchParams.get('q'), hash: u.hash };
};
const front = (page: Page) => page.locator('.desktop');

test.describe('AC38 URL giữ app / mục / từ khoá', () => {
  test.beforeEach(({ mock }) => seedNotes(mock));

  test('AC38 Công việc → ?app=tasks; mở Ghi chú → ?app=notes, refresh vẫn Ghi chú; mở ghi chú → #/note/<id>, refresh mở lại đúng ghi chú', async ({ app, page }) => {
    await app.openReady();
    await expect.poll(() => url(page)).toEqual({ app: 'tasks', q: null, hash: '' });

    const notes = new NotesUi(page);
    await notes.openFromDock();
    await expect(front(page)).toHaveAttribute('data-front', 'ghi-chu');
    await expect.poll(() => url(page)).toEqual({ app: 'notes', q: null, hash: '' });

    await page.reload();
    await notes.ready();
    await expect(front(page), 'refresh vẫn ở Ghi chú').toHaveAttribute('data-front', 'ghi-chu');
    await expect(page.getByTestId('dock-app-cong-viec'), 'Công việc chưa mở sau refresh').not.toHaveAttribute('data-running', 'true');

    await notes.openNote(N.ROOT);
    await expect.poll(() => url(page)).toEqual({ app: 'notes', q: null, hash: `#/note/${N.ROOT}` });
    await page.reload();
    await expect(notes.tid('note-view')).toHaveAttribute('data-note-id', N.ROOT);
    await expect(notes.tid('note-title')).toHaveText(NOTE_TITLE[N.ROOT]);
    await expect(front(page)).toHaveAttribute('data-front', 'ghi-chu');
  });

  test('AC38 tìm kiếm → q (sau khi ngừng gõ), refresh giữ từ khoá; chuyển app → URL theo app mới, không sót q / link của app kia', async ({ app, page }) => {
    await app.openReady();
    const notes = new NotesUi(page);
    await notes.openFromDock();
    await notes.tid('notes-search').fill('biên bản');
    await expect.poll(() => url(page).q, { message: 'q ghi sau khi ngừng gõ' }).toBe('biên bản');
    await expect(notes.noteItem(N.MEET)).toBeVisible();
    await notes.openNote(N.MEET);
    await expect.poll(() => url(page)).toEqual({ app: 'notes', q: 'biên bản', hash: `#/note/${N.MEET}` });

    await page.reload();
    await notes.ready();
    await expect(notes.tid('notes-search'), 'refresh giữ từ khoá').toHaveValue('biên bản');
    await expect(notes.root().getByTestId('note-item')).toHaveCount(1);
    await expect(notes.tid('note-view')).toHaveAttribute('data-note-id', N.MEET);

    // chuyển sang Công việc: URL theo app mới, không còn q / #/note của Ghi chú
    await page.getByTestId('dock-app-cong-viec').click();
    await app.ready();
    await expect.poll(() => url(page)).toEqual({ app: 'tasks', q: null, hash: '' });
    await expect(app.tid('search'), 'q của Ghi chú không áp cho Công việc').toHaveValue('');

    await app.search('onboarding');
    await expect.poll(() => url(page).q).toBe('onboarding');
    await app.expectIds([T.T1]);
    await page.reload();
    await app.ready();
    await expect(app.tid('search')).toHaveValue('onboarding');
    await app.expectIds([T.T1]);
    expect(url(page).app).toBe('tasks');

    // mở lại Ghi chú (cửa sổ mới sau refresh): q của Công việc không sang Ghi chú
    await notes.openFromDock();
    await expect.poll(() => url(page)).toEqual({ app: 'notes', q: null, hash: '' });
    await expect(notes.tid('notes-search')).toHaveValue('');
  });

  test('AC38 mở task → #/task/<id>, refresh mở lại popup; link #/task/… khi Ghi chú ở trước → Công việc lên trước; đóng cửa sổ ở trước → URL sạch, refresh mở Công việc', async ({ app, page }) => {
    await app.openReady();
    await app.openTask(T.T3);
    await expect.poll(() => url(page)).toEqual({ app: 'tasks', q: null, hash: `#/task/${T.T3}` });
    await page.reload();
    await expect(app.dialog()).toBeVisible({ timeout: 15_000 });
    await expect(app.view()).toContainText('Nghiên cứu ứng dụng đối thủ');
    await page.keyboard.press('Escape');
    await expect(app.dialog()).toBeHidden();
    await expect.poll(() => url(page).hash, { message: 'đóng popup → bỏ hash' }).toBe('');

    const notes = new NotesUi(page);
    await notes.openFromDock();
    await expect(front(page)).toHaveAttribute('data-front', 'ghi-chu');
    await page.evaluate((id) => (window.location.hash = `#/task/${id}`), T.T4);
    await expect(front(page), 'link #/task/… đưa Công việc lên trước').toHaveAttribute('data-front', 'cong-viec');
    await expect(app.view()).toContainText('Kiến trúc thông tin cho mục Thư viện');
    await expect.poll(() => url(page)).toEqual({ app: 'tasks', q: null, hash: `#/task/${T.T4}` });
    await page.keyboard.press('Escape');
    await expect(app.dialog()).toBeHidden();

    // đóng cửa sổ ở trước (Công việc) → URL sạch
    await app.search('thư viện');
    await expect.poll(() => url(page).q).toBe('thư viện');
    await page.locator('[data-testid="win-close"]:visible').click();
    await expect(front(page)).not.toHaveAttribute('data-front', /.*/);
    await expect.poll(() => url(page)).toEqual({ app: null, q: null, hash: '' });
    await page.reload();
    await app.ready();
    await expect(front(page), 'URL sạch → mở Công việc như lần đầu').toHaveAttribute('data-front', 'cong-viec');
    await expect(app.tid('search')).toHaveValue('');
  });

  test('AC38 tải trang: link mục thắng ?app=; slug lạ (cong-viec, ghi-chu) bị bỏ qua; ?app=settings mở Cài đặt', async ({ app, page }) => {
    await page.goto(`/?app=tasks#/note/${N.ROOT}`);
    const notes = new NotesUi(page);
    await expect(notes.tid('note-view')).toHaveAttribute('data-note-id', N.ROOT, { timeout: 15_000 });
    await expect(front(page)).toHaveAttribute('data-front', 'ghi-chu');

    await page.goto('/?app=ghi-chu');
    await app.ready();
    await expect(front(page), 'slug lạ → Công việc').toHaveAttribute('data-front', 'cong-viec');
    await page.goto('/?app=cong-viec');
    await app.ready();
    await expect(front(page)).toHaveAttribute('data-front', 'cong-viec');

    await page.goto('/?app=settings');
    await expect(page.getByTestId('settings-app')).toBeVisible();
    await expect(front(page)).toHaveAttribute('data-front', 'cai-dat');

    await page.goto('/?app=notes&q=gốc');
    await notes.ready();
    await expect(notes.tid('notes-search')).toHaveValue('gốc');
    await expect(notes.root().getByTestId('note-item')).toHaveCount(1);
    await expect(notes.noteItem(N.ROOT)).toBeVisible();
  });
});
