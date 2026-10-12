import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Page object hộp đen của cửa sổ Ghi chú (CONTRACT 9.6): data-testid + role/tên tiếng Việt.
 * Dùng cho bộ local (mock).
 */
export class NotesUi {
  constructor(readonly page: Page) {}

  /** Trang của cửa sổ Ghi chú. */
  root() {
    return this.page.getByTestId('notes-app');
  }

  tid(id: string) {
    return this.root().getByTestId(id);
  }

  /** Bấm icon Ghi chú trên dock và chờ cây sẵn sàng. */
  async openFromDock() {
    await this.page.getByTestId('dock-app-ghi-chu').click();
    await this.ready();
  }

  async ready() {
    await expect(this.tid('notes-tree').or(this.tid('shared-section')).first()).toBeVisible({ timeout: 30_000 });
    await expect(this.tid('notes-loading')).toHaveCount(0);
  }

  /** Toast đang hiện (mỗi cửa sổ có toast riêng; toast của cửa sổ khác bị ẩn bằng `hidden`). */
  toast() {
    return this.page.locator('[data-testid="toast"]:visible');
  }

  folderItem(id: string) {
    return this.root().locator(`[data-testid="folder-item"][data-id="${id}"]`);
  }

  /** Hàng bấm / kéo / thả của thư mục (phần tử mang `data-drop`). */
  folderRow(id: string) {
    return this.folderItem(id).locator(':scope > .row');
  }

  noteItem(id: string) {
    return this.root().locator(`[data-testid="note-item"][data-id="${id}"]`);
  }

  noteRow(id: string) {
    return this.noteItem(id).locator(':scope > .row');
  }

  /** Mở thư mục trong cây nếu đang thu gọn. */
  async expand(id: string) {
    const item = this.folderItem(id);
    if ((await item.getAttribute('aria-expanded')) !== 'true') await this.folderRow(id).click();
    await expect(item).toHaveAttribute('aria-expanded', 'true');
  }

  async openNote(id: string) {
    await this.noteRow(id).click();
    await expect(this.tid('note-view')).toHaveAttribute('data-note-id', id);
  }

  /** Mức (aria-level) của một mục trong cây. */
  async level(item: Locator) {
    return Number(await item.getAttribute('aria-level'));
  }

  /**
   * Kéo bằng chuột như người dùng (pointer events, CONTRACT 9.3): nhấn trên hàng nguồn, di ≥ 5px để bắt đầu kéo,
   * rồi di tới giữa đích (đích tính SAU khi bắt đầu kéo vì dải "Thả vào đây…" chỉ hiện lúc kéo).
   * Trả về hàm thả (mouse up); `drop()` gọi ngay khi không cần kiểm tra trạng thái giữa chừng.
   */
  async dragTo(source: Locator, target: () => Locator) {
    await source.scrollIntoViewIfNeeded();
    const a = (await source.boundingBox())!;
    const x0 = a.x + Math.min(40, a.width / 3);
    const y0 = a.y + a.height / 2;
    await this.page.mouse.move(x0, y0);
    await this.page.mouse.down();
    await this.page.mouse.move(x0 + 4, y0 + 4, { steps: 2 });
    await this.page.mouse.move(x0 + 10, y0 + 10, { steps: 2 });
    await expect(this.page.getByTestId('drag-ghost'), 'đã bắt đầu kéo (nhãn đi theo con trỏ)').toBeVisible();
    const b = (await target().boundingBox())!;
    await this.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
    return { release: () => this.page.mouse.up() };
  }
}
