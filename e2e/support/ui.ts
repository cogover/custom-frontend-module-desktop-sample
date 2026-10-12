import { expect, type Locator, type Page } from '@playwright/test';
import { SORT_LABEL, type SortField } from './model';

export type Quick = 'open' | 'all' | 'done';

/** Dữ liệu clipboard để dán vào mô tả (file truyền dạng base64 để tạo File trong trang). */
export interface PasteData {
  html?: string;
  text?: string;
  rtf?: string;
  files?: { name: string; type: string; base64: string }[];
}

/** Phím di chuyển con trỏ theo nền tảng (macOS không dùng Home/End để di chuyển con trỏ). */
export const KEYS =
  process.platform === 'darwin'
    ? { docStart: 'Meta+ArrowUp', lineEnd: 'Meta+ArrowRight' }
    : { docStart: 'Control+Home', lineEnd: 'End' };
/** Vùng soạn nội dung ghi chú: testid nằm trên chính contenteditable (như `field-desc`) hoặc bao ngoài nó. */
export const ACTIVITY_EDITOR_SEL =
  '[data-testid="activity-content-editor"][contenteditable="true"], [data-testid="activity-content-editor"] [contenteditable="true"]';
export type DueFilter ='all' | 'overdue' | 'today' | 'tomorrow' | 'month' | 'custom';
/** Vai trò chọn nhiều (contract 2026-10-01): Tôi giao / Giao cho tôi / Tôi theo dõi. */
export type Role = 'reporter' | 'assignee' | 'cc';
export const ALL_ROLES: Role[] = ['reporter', 'assignee', 'cc'];
export const DEFAULT_ROLES: Role[] = ['assignee'];

/**
 * Page object hộp đen: chỉ dùng data-testid trong CONTRACT mục 6 + role/label tiếng Việt.
 * Các helper chấp nhận cả control gốc (select/radio) lẫn Radix (button + role=option).
 */
export class TaskApp {
  constructor(
    readonly page: Page,
    readonly appPath: string,
  ) {}

  tid(id: string) {
    return this.page.getByTestId(id);
  }

  async open(hash = '') {
    await this.page.goto(this.appPath + hash);
  }

  /** Chờ hết loading và danh sách sẵn sàng (có thẻ hoặc trạng thái rỗng). */
  async ready() {
    await expect(this.tid('list-title')).toBeVisible({ timeout: 15_000 });
    await expect(this.tid('app-loading')).toBeHidden({ timeout: 15_000 });
    await expect(this.items().first().or(this.tid('empty-state'))).toBeVisible({ timeout: 15_000 });
  }

  async openReady(hash = '') {
    await this.open(hash);
    await this.ready();
  }

  /* ---------------- danh sách ---------------- */

  items() {
    return this.page.getByTestId('task-item');
  }

  item(id: string) {
    return this.page.locator(`[data-testid="task-item"][data-task-id="${id}"]`);
  }

  inItem(id: string, testId: string) {
    return this.item(id).getByTestId(testId);
  }

  /** ID các thẻ đang hiển thị, theo thứ tự DOM. */
  async visibleIds(): Promise<string[]> {
    return this.items().evaluateAll((els) =>
      els
        .filter((e) => (e as HTMLElement).getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden')
        .map((e) => e.getAttribute('data-task-id') ?? ''),
    );
  }

  async expectIds(expected: string[], opts: { ordered?: boolean; timeout?: number } = {}) {
    const { ordered = false, timeout = 5_000 } = opts;
    await expect
      .poll(async () => {
        const ids = await this.visibleIds();
        return ordered ? ids : [...ids].sort();
      }, { timeout, message: 'Danh sách task hiển thị' })
      .toEqual(ordered ? expected : [...expected].sort());
  }

  async count(name: 'open' | 'all' | 'done') {
    return Number((await this.tid(`count-${name}`).innerText()).replace(/[^\d]/g, ''));
  }

  async expectCounts(c: { open?: number; all?: number; done?: number }) {
    for (const [k, v] of Object.entries(c)) {
      await expect(this.tid(`count-${k}`), `count-${k}`).toHaveText(new RegExp(`^\\s*${v}\\s*$`));
    }
  }

  /** Double-click đúng vào chữ của tiêu đề (không phụ thuộc testid đặt trên thẻ p hay span). */
  async dblclickTitle(id: string) {
    const title = this.inItem(id, 'task-title');
    await title.scrollIntoViewIfNeeded();
    const pt = await title.evaluate((el) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) if (n.textContent?.trim()) break;
      const r = document.createRange();
      r.selectNodeContents(n ?? el);
      const b = r.getClientRects()[0] ?? r.getBoundingClientRect();
      return { x: b.left + Math.min(b.width / 2, 30), y: b.top + b.height / 2 };
    });
    await this.page.mouse.dblclick(pt.x, pt.y);
  }

  /* ---------------- bộ lọc / sắp xếp / tìm kiếm ---------------- */

  async quick(name: Quick) {
    await this.tid(`quick-${name}`).click();
  }

  async due(name: DueFilter) {
    await this.ensurePanelOpen(`due-filter-${name}`);
    await this.tid(`due-filter-${name}`).click();
  }

  /**
   * Chọn "Tuỳ chọn" rồi chọn ngày từ/đến (YYYY-MM-DD) trên Date Picker (contract 3a).
   * Đầu nào `undefined` thì giữ nguyên (Date Picker không có thao tác xoá ngày trong contract).
   */
  async dueRange(from?: string, to?: string) {
    await this.due('custom');
    if (from) await this.pickDate(this.tid('due-from'), from);
    if (to) await this.pickDate(this.tid('due-to'), to);
  }

  /** Bật/tắt một checkbox vai trò. */
  async toggleRole(name: Role) {
    await this.ensurePanelOpen(`role-filter-${name}`);
    await this.tid(`role-filter-${name}`).click();
  }

  /**
   * Vai trò đang áp (theo thứ tự Tôi giao / Giao cho tôi / Tôi theo dõi). Chip "Tất cả" (`role-filter-all`, 2026-10-04)
   * = cả ba vai trò (ba chip hiện không tick).
   */
  async roles(): Promise<Role[]> {
    if ((await this.tid('role-filter-all').count()) > 0 && (await isSelected(this.tid('role-filter-all')))) return [...ALL_ROLES];
    const out: Role[] = [];
    for (const r of ALL_ROLES) if (await isSelected(this.tid(`role-filter-${r}`))) out.push(r);
    return out;
  }

  /** Chip "Tất cả" của nhóm Vai trò đang bật. */
  async rolesAll(): Promise<boolean> {
    return (await this.tid('role-filter-all').count()) > 0 && isSelected(this.tid('role-filter-all'));
  }

  /**
   * Đặt đúng tập vai trò (≥ 1). Cả ba → bấm "Tất cả". Còn lại đi từng bước như người dùng: đang "Tất cả" thì bấm một vai trò
   * cần (→ chỉ vai trò đó); bỏ tick vai trò thừa khi còn ≥ 2 vai trò (không bỏ vai trò cuối → sẽ thành "Tất cả");
   * tick thêm vai trò thiếu (không bao giờ thành đủ ba vì vai trò thừa đã bỏ trước).
   */
  async setRoles(wanted: Role[]) {
    if (!wanted.length) throw new Error('setRoles: cần ít nhất một vai trò (bỏ tick vai trò cuối → "Tất cả")');
    await this.ensurePanelOpen('role-filter-assignee');
    const want = ALL_ROLES.filter((r) => wanted.includes(r));
    const same = (a: Role[]) => a.length === want.length && a.every((r, i) => r === want[i]);
    for (let step = 0; step < 8; step++) {
      const cur = await this.roles();
      if (same(cur)) break;
      if (want.length === ALL_ROLES.length) {
        await this.tid('role-filter-all').click();
        continue;
      }
      if (await this.rolesAll()) {
        await this.toggleRole(want[0]);
        continue;
      }
      const extra = cur.find((r) => !want.includes(r));
      if (extra && cur.length > 1) {
        await this.toggleRole(extra);
        continue;
      }
      const missing = want.find((r) => !cur.includes(r));
      if (missing) await this.toggleRole(missing);
    }
    await expect.poll(() => this.roles(), { message: 'vai trò đang áp' }).toEqual(want);
  }

  async sort(field: SortField, dir?: 'asc' | 'desc') {
    await this.ensurePanelOpen('sort-by');
    await chooseOption(this.page, this.tid('sort-by'), SORT_LABEL[field]);
    if (dir) await this.tid(`sort-dir-${dir}`).click();
  }

  async search(text: string) {
    await this.tid('search').fill(text);
  }

  /** Mobile (≤880px) có thể thu gọn panel "Bộ lọc & sắp xếp" (details/summary). */
  async ensurePanelOpen(testId: string) {
    const target = this.tid(testId);
    if (await target.isVisible()) return;
    const summary = this.page.getByText('Bộ lọc & sắp xếp', { exact: false }).first();
    if (await summary.isVisible()) await summary.click();
    await expect(target).toBeVisible();
  }

  /** Popover lịch (shadcn Calendar, contract 3a). */
  calendar() {
    return this.page.getByTestId('calendar');
  }

  /**
   * Chọn ngày YYYY-MM-DD trên Date Picker: bấm nút trigger → popover `calendar` → điều hướng tháng
   * (nút tháng trước/sau) tới khi thấy ô ngày → bấm. Ô ngày nhận diện qua accessible name chứa ngày
   * (react-day-picker) hoặc `data-day` ISO; trigger phải hiện `dd/MM/yyyy` sau khi chọn.
   */
  async pickDate(trigger: Locator, iso: string) {
    const [y, m, d] = iso.split('-').map(Number);
    await trigger.click();
    const cal = this.calendar();
    await expect(cal).toBeVisible();
    const refText = (await trigger.innerText()).match(/(\d{2})\/(\d{2})\/(\d{4})/);
    const refMonth = refText
      ? Number(refText[3]) * 12 + Number(refText[2]) - 1
      : await this.page.evaluate(() => {
          const t = new Date(Date.now() + 7 * 3600_000);
          return t.getUTCFullYear() * 12 + t.getUTCMonth();
        });
    const targetMonth = y * 12 + m - 1;
    const firstDir: 1 | -1 = targetMonth >= refMonth ? 1 : -1;
    let idx = await findDayButton(cal, y, m, d);
    for (const dir of [firstDir, -firstDir as 1 | -1]) {
      for (let i = 0; idx < 0 && i < 30; i++) {
        await clickCalendarNav(cal, dir);
        idx = await findDayButton(cal, y, m, d);
      }
      if (idx >= 0) break;
    }
    if (idx < 0) throw new Error(`Không tìm thấy ngày ${iso} trên lịch`);
    await cal.locator('button').nth(idx).click();
    const shown = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
    await expect(trigger, `nút ngày phải hiện ${shown}`).toContainText(shown);
    // Đóng popover nếu app không tự đóng (Esc chỉ đóng popover, không đóng popup chứa nó).
    if (await cal.isVisible()) await this.page.keyboard.press('Escape');
    await expect(cal).toBeHidden();
  }

  /* ---------------- trình soạn Mô tả (Plate.js, contenteditable) ---------------- */

  /** Vùng soạn mô tả (contenteditable `field-desc`). */
  desc() {
    return this.tid('field-desc');
  }

  /**
   * Văn bản người dùng đã nhập trong trình soạn (bỏ placeholder và phần tử contenteditable=false như ảnh),
   * gộp các dòng trống liên tiếp. <textarea> (bản cũ) → value.
   */
  async descText(): Promise<string> {
    const t = await this.desc().evaluate((el) => {
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el.value;
      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('[contenteditable="false"], [data-slate-placeholder], [aria-hidden="true"]').forEach((n) => n.remove());
      // Mỗi khối (p/h*/li/blockquote/div) thành một dòng.
      clone.querySelectorAll('p, h1, h2, h3, li, blockquote, div, br').forEach((n) => n.append('\n'));
      return clone.textContent ?? '';
    });
    return t.replace(/\u00a0/g, ' ').replace(/\ufeff/g, '').replace(/[ \t]*\n[ \t\n]*/g, '\n').trim();
  }

  /** Chờ 2 khung hình để editor (Slate/Plate) đồng bộ selection/focus — như người dùng nhìn thấy rồi mới gõ tiếp. */
  async settle() {
    await this.page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  }

  /**
   * Chờ editor nhận vùng chọn mới: slate-react đồng bộ selection từ sự kiện selectionchange có throttle ~100ms,
   * nên sau click/Ctrl+A/phím di chuyển cần chờ quá ngưỡng đó trước khi gõ/xoá (người dùng thật luôn chậm hơn).
   */
  async settleSelection() {
    await this.settle();
    await this.page.waitForTimeout(150);
  }

  /** Bấm vào vùng soạn và chờ nó nhận focus. */
  async focusDesc() {
    await this.desc().click({ position: { x: 8, y: 8 } });
    await expect(this.desc()).toBeFocused();
    await this.settleSelection();
  }

  /** Đặt con trỏ vào cuối dòng đầu tiên của trình soạn (bằng bàn phím, không phụ thuộc vị trí click). */
  async caretEndOfFirstLine() {
    await this.focusDesc();
    // macOS: Home/End không di chuyển con trỏ — dùng Cmd+↑ / Cmd+→ như người dùng Mac.
    await this.page.keyboard.press(KEYS.docStart);
    await this.settleSelection();
    await this.page.keyboard.press(KEYS.lineEnd);
    await this.settleSelection();
  }

  /** Vùng soạn mô tả khi trình soạn đã mount (contenteditable — trước đó có thể là bản xem tĩnh). */
  descEditor() {
    return this.page.locator('[data-testid="field-desc"][contenteditable="true"]');
  }

  /**
   * Dán vào mô tả như Ctrl/Cmd+V, con trỏ ở cuối nội dung. Slate/Plate trên Chromium nhận dán qua sự kiện
   * `beforeinput` (`inputType: 'insertFromPaste'` kèm `dataTransfer`), không qua ClipboardEvent('paste') giả lập.
   */
  async pasteDesc(data: PasteData) {
    await expect(this.descEditor(), 'trình soạn mô tả đã mount').toBeVisible({ timeout: 15_000 });
    await this.focusDesc();
    await this.page.evaluate(() => {
      const box = document.querySelector('[data-testid="field-desc"][contenteditable="true"]') as HTMLElement;
      box.focus();
      const sel = window.getSelection()!;
      sel.selectAllChildren(box);
      sel.collapseToEnd();
    });
    await this.settleSelection();
    const accepted = await this.page.evaluate((d) => {
      const box = document.querySelector('[data-testid="field-desc"][contenteditable="true"]') as HTMLElement;
      const dt = new DataTransfer();
      if (d.html !== undefined) dt.setData('text/html', d.html);
      if (d.text !== undefined) dt.setData('text/plain', d.text);
      if (d.rtf !== undefined) dt.setData('text/rtf', d.rtf);
      for (const f of d.files ?? []) {
        const bin = atob(f.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        dt.items.add(new File([bytes], f.name, { type: f.type }));
      }
      const ev = new InputEvent('beforeinput', { inputType: 'insertFromPaste', dataTransfer: dt, bubbles: true, cancelable: true });
      box.dispatchEvent(ev);
      return ev.defaultPrevented;
    }, data);
    expect(accepted, 'trình soạn phải nhận sự kiện dán (beforeinput insertFromPaste)').toBe(true);
    await this.settle();
  }

  /** Ảnh trong vùng soạn mô tả. */
  descImages() {
    return this.descEditor().locator('img');
  }

  /* ---------------- Hoạt động (CONTRACT 3c) ---------------- */

  /** Mỗi mục timeline (`activity-item`, kèm `data-activity-id`, `data-type`). */
  activityItems() {
    return this.page.getByTestId('activity-item');
  }

  activityItem(id: string) {
    return this.page.locator(`[data-testid="activity-item"][data-activity-id="${id}"]`);
  }

  /** ID các mục timeline theo thứ tự DOM. */
  async activityIds(): Promise<string[]> {
    return this.activityItems().evaluateAll((els) => els.map((e) => e.getAttribute('data-activity-id') ?? ''));
  }

  /** Vùng soạn nội dung ghi chú (`activity-content-editor`, contenteditable như Mô tả). */
  activityEditor() {
    return this.page.locator(ACTIVITY_EDITOR_SEL);
  }

  /** Bấm vào vùng soạn ghi chú và chờ nó nhận focus. */
  async focusActivityEditor() {
    const ed = this.activityEditor();
    await expect(ed, 'trình soạn ghi chú đã mount').toBeVisible({ timeout: 15_000 });
    await ed.click({ position: { x: 8, y: 8 } });
    await expect(ed).toBeFocused();
    await this.settleSelection();
  }

  /** Văn bản trong vùng soạn ghi chú (bỏ placeholder/phần tử không sửa được). */
  async activityEditorText(): Promise<string> {
    const t = await this.activityEditor().evaluate((el) => {
      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('[contenteditable="false"], [data-slate-placeholder], [aria-hidden="true"]').forEach((n) => n.remove());
      clone.querySelectorAll('p, h1, h2, h3, li, blockquote, div, br').forEach((n) => n.append('\n'));
      return clone.textContent ?? '';
    });
    return t.replace(/ /g, ' ').replace(/﻿/g, '').replace(/[ \t]*\n[ \t\n]*/g, '\n').trim();
  }

  /** Dán vào ô soạn ghi chú như Ctrl/Cmd+V (beforeinput insertFromPaste + dataTransfer), con trỏ ở cuối. */
  async pasteActivity(data: PasteData) {
    await this.focusActivityEditor();
    await this.page.evaluate((sel) => {
      const box = document.querySelector(sel) as HTMLElement;
      box.focus();
      const s = window.getSelection()!;
      s.selectAllChildren(box);
      s.collapseToEnd();
    }, ACTIVITY_EDITOR_SEL);
    await this.settleSelection();
    const accepted = await this.page.evaluate(
      ({ sel, d }) => {
        const box = document.querySelector(sel) as HTMLElement;
        const dt = new DataTransfer();
        if (d.html !== undefined) dt.setData('text/html', d.html);
        if (d.text !== undefined) dt.setData('text/plain', d.text);
        if (d.rtf !== undefined) dt.setData('text/rtf', d.rtf);
        for (const f of d.files ?? []) {
          const bin = atob(f.base64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          dt.items.add(new File([bytes], f.name, { type: f.type }));
        }
        const ev = new InputEvent('beforeinput', { inputType: 'insertFromPaste', dataTransfer: dt, bubbles: true, cancelable: true });
        box.dispatchEvent(ev);
        return ev.defaultPrevented;
      },
      { sel: ACTIVITY_EDITOR_SEL, d: data },
    );
    expect(accepted, 'trình soạn ghi chú phải nhận sự kiện dán (beforeinput insertFromPaste)').toBe(true);
    await this.settle();
  }

  /* ---------------- sửa nhanh trong popup xem (CONTRACT 3d) ---------------- */

  /** Lựa chọn người trong danh sách đang mở (Combobox người giao/được giao hoặc danh sách người theo dõi). */
  personOption(id: string) {
    return this.page.locator(`[data-testid="person-option"][data-person-id="${id}"]`);
  }

  /** Chọn người trong Combobox của popup xem (`view-reporter` / `view-assignee`). */
  async pickViewPerson(testId: 'view-reporter' | 'view-assignee', personId: string, filterText?: string) {
    await this.tid(testId).click();
    await expect(this.page.getByTestId('person-option').first()).toBeVisible();
    if (filterText) await this.typeInPeopleSearch(filterText);
    await this.personOption(personId).click();
    await expect(this.personOption(personId)).toBeHidden();
  }

  /** Bấm một nút trên thanh công cụ rich-text rồi chờ editor ổn định. */
  async rte(name: string) {
    await this.tid(`rte-${name}`).click();
    await this.settle();
  }

  /** Xoá hết rồi gõ từng dòng (Enter giữa các dòng → đoạn mới), như người dùng gõ phím. */
  async typeDescription(lines: string[]) {
    await this.focusDesc();
    await this.page.keyboard.press('ControlOrMeta+a');
    // Chờ vùng chọn phủ hết nội dung trước khi xoá (Slate đồng bộ selection bất đồng bộ).
    await expect
      .poll(() =>
        this.page.evaluate(() => {
          const ed = document.querySelector('[data-testid="field-desc"]') as HTMLElement | null;
          const sel = window.getSelection();
          if (!ed || !sel) return false;
          if (ed instanceof HTMLTextAreaElement) return ed.selectionStart === 0 && ed.selectionEnd === ed.value.length;
          const clone = ed.cloneNode(true) as HTMLElement;
          clone.querySelectorAll('[contenteditable="false"], [data-slate-placeholder], [aria-hidden="true"]').forEach((n) => n.remove());
          const text = (clone.textContent ?? '').replace(/[\s\ufeff]+/g, '');
          return sel.toString().replace(/[\s\ufeff]+/g, '') === text;
        }),
      { message: 'Ctrl/Cmd+A phải chọn hết mô tả' })
      .toBe(true);
    await this.settleSelection();
    await this.page.keyboard.press('Backspace');
    await expect.poll(() => this.descText(), { message: 'mô tả đã được xoá trống' }).toBe('');
    await this.settle();
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) {
        await this.page.keyboard.press('Enter');
        await this.settle();
      }
      await this.page.keyboard.type(lines[i]);
    }
    await this.settle();
  }

  /** Chọn Mức ưu tiên trong form (Select `field-priority`, contract 2026-10-01). */
  async pickPriority(slug: 'urgent' | 'high' | 'medium' | 'low') {
    const label = { urgent: 'Khẩn cấp', high: 'Cao', medium: 'Trung bình', low: 'Thấp' }[slug];
    await chooseOption(this.page, this.tid('field-priority'), label);
    await expect(this.tid('field-priority')).toContainText(label);
  }

  /** Chọn giờ HH:mm trên Select giờ (mốc 30 phút). */
  async pickTime(trigger: Locator, hhmm: string) {
    await chooseOption(this.page, trigger, hhmm);
    await expect(trigger).toContainText(hhmm);
  }

  /* ---------------- popup ---------------- */

  dialog() {
    return this.tid('task-dialog');
  }

  view() {
    return this.tid('task-view');
  }

  form() {
    return this.tid('task-form');
  }

  /** Các điểm trên vùng tối quanh popup (trái, trên, phải), đã kiểm là không nằm trong popup. */
  async outsideDialogPoints() {
    const box = await this.dialog().boundingBox();
    if (!box) throw new Error('Popup chưa mở');
    const vp = this.page.viewportSize()!;
    const candidates = [
      { x: Math.round(box.x / 2), y: Math.round(box.y + box.height / 2), where: 'bên trái popup' },
      { x: Math.round(box.x + box.width / 2), y: Math.round(box.y / 2), where: 'phía trên popup' },
      { x: Math.round((box.x + box.width + vp.width) / 2), y: Math.round(box.y + box.height - 20), where: 'bên phải popup' },
    ].filter((p) => p.x > 2 && p.y > 2 && p.x < vp.width - 2 && p.y < vp.height - 2);
    expect(candidates.length, 'có vùng tối quanh popup để bấm').toBeGreaterThan(0);
    for (const p of candidates) {
      const inside = await this.page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return !!el?.closest('[data-testid="task-dialog"], [role="dialog"]');
      }, p);
      expect(inside, `điểm ${p.where} (${p.x},${p.y}) nằm ngoài popup`).toBe(false);
    }
    return candidates;
  }

  /** Bấm ra ngoài popup (từng điểm vùng tối) như người dùng; sau mỗi cú bấm popup phải còn mở. */
  async clickOutsideDialog() {
    for (const p of await this.outsideDialogPoints()) {
      await this.page.mouse.click(p.x, p.y);
      await this.page.waitForTimeout(150);
      await expect(this.dialog(), `bấm ${p.where} không đóng popup`).toBeVisible();
    }
  }

  /** Click vào vùng trống của thẻ (không trúng checkbox/tiêu đề/select/nút xoá). */
  async clickCardBlank(id: string) {
    const card = this.item(id);
    await card.scrollIntoViewIfNeeded();
    const box = await card.boundingBox();
    if (!box) throw new Error(`Không thấy thẻ ${id}`);
    await card.click({ position: { x: Math.round(box.width * 0.55), y: 4 } });
  }

  async openTask(id: string) {
    await this.clickCardBlank(id);
    await expect(this.dialog()).toBeVisible();
    await expect(this.view()).toBeVisible();
  }

  /**
   * Xoá qua popup (CONTRACT mục 5 #5, 2026-10-04: thẻ không còn nút xoá): mở popup xem → `form-delete` → hộp xác nhận.
   * Trả về khi `confirm-delete` đã hiện (chưa bấm Xoá / Huỷ).
   */
  async openDeleteConfirm(id: string) {
    if (!(await this.view().isVisible())) await this.openTask(id);
    await this.tid('form-delete').click();
    await expect(this.tid('confirm-delete')).toBeVisible();
  }

  async openCreate() {
    await this.tid('open-create').click();
    await expect(this.dialog()).toBeVisible();
    await expect(this.form()).toBeVisible();
  }

  /** Chọn nhân sự trong ô chọn có tìm kiếm (Radix Popover). */
  async pickPerson(field: 'field-reporter' | 'field-assignee', personId: string, filterText?: string) {
    await this.tid(field).click();
    const option = this.page.locator(`[data-testid="person-option"][data-person-id="${personId}"]`);
    await expect(this.page.getByTestId('person-option').first()).toBeVisible();
    if (filterText) await this.typeInPeopleSearch(filterText);
    await option.click();
    await expect(option).toBeHidden();
  }

  /**
   * Chọn nhiều người trong ô chọn nhiều (`field-ccs` của form tạo, `view-ccs` của popup xem): bấm mở danh sách,
   * tick đúng tập `ids` (bỏ tick người thừa), Esc đóng danh sách (Esc chỉ đóng danh sách, không đóng popup).
   */
  async pickPeople(testId: 'field-ccs' | 'view-ccs', ids: string[]) {
    await this.tid(testId).click();
    await expect(this.page.getByTestId('person-option').first()).toBeVisible();
    const options = this.page.getByTestId('person-option');
    const checkedNow = await options.evaluateAll((els) =>
      els.filter((e) => e.getAttribute('data-checked') === 'true').map((e) => e.getAttribute('data-person-id') ?? ''),
    );
    for (const id of checkedNow) if (!ids.includes(id)) await this.personOption(id).click();
    for (const id of ids) {
      if (checkedNow.includes(id)) continue;
      await this.personOption(id).click();
      await expect(this.personOption(id)).toHaveAttribute('data-checked', 'true');
    }
    await this.page.keyboard.press('Escape');
    await expect(this.page.getByTestId('person-option')).toHaveCount(0);
    await expect(this.tid(testId)).toHaveAttribute('data-count', String(ids.length));
  }

  /** Gõ vào ô tìm trong popover chọn người; ưu tiên ô đang focus. */
  async typeInPeopleSearch(text: string) {
    const focusedIsInput = await this.page.evaluate(() => {
      const el = document.activeElement;
      return !!el && (el.tagName === 'INPUT' || el.getAttribute('role') === 'combobox');
    });
    if (focusedIsInput) {
      await this.page.keyboard.press('ControlOrMeta+a');
      await this.page.keyboard.type(text);
      return;
    }
    const container = this.page.getByTestId('person-option').first().locator('xpath=ancestor::*[.//input][1]');
    await container.locator('input').first().fill(text);
  }

  /* ---------------- toast ---------------- */

  toast() {
    return this.tid('toast');
  }
}

/* ---------------- helper chung ---------------- */

/**
 * Chọn option theo nhãn. Ưu tiên Select kiểu Radix/shadcn (trigger mang testid → option role="option");
 * chỉ dùng selectOption khi testid là <select> gốc đang hiển thị (tương thích ngược).
 */
export async function chooseOption(page: Page, target: Locator, label: string | RegExp) {
  const select = await resolveNativeSelect(target);
  if (select) {
    const value = await select.evaluate((el, src) => {
      const re = typeof src === 'string' ? null : new RegExp(src.source, src.flags);
      const opt = [...(el as HTMLSelectElement).options].find((o) =>
        re ? re.test(o.textContent ?? '') : (o.textContent ?? '').trim() === src,
      );
      return opt?.value ?? null;
    }, typeof label === 'string' ? label : { source: label.source, flags: label.flags });
    if (value === null) throw new Error(`Không có option "${label}"`);
    await select.selectOption(value);
    return;
  }
  await target.click();
  const option = page.getByRole('option', { name: label, exact: typeof label === 'string' });
  await expect(option.first(), `option "${label}"`).toBeVisible();
  await option.first().click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

/** <select> gốc đang hiển thị (không tính select ẩn aria-hidden mà Radix chèn để hỗ trợ form). */
export async function resolveNativeSelect(target: Locator): Promise<Locator | null> {
  const tag = await target.evaluate((el) => el.tagName);
  if (tag === 'SELECT' && (await target.isVisible())) return target;
  const inner = target.locator('select');
  if ((await inner.count()) > 0 && (await inner.first().isVisible())) return inner.first();
  return null;
}

/** Nhãn option đang chọn (Select trigger hiển thị giá trị). */
export async function selectedOptionLabel(target: Locator): Promise<string> {
  const select = await resolveNativeSelect(target);
  if (select) return select.evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.textContent?.trim() ?? '');
  return (await target.innerText()).replace(/\s+/g, ' ').trim();
}

/** Danh sách nhãn option theo thứ tự (mở Select, đọc, Esc). */
export async function optionLabels(page: Page, target: Locator): Promise<string[]> {
  const select = await resolveNativeSelect(target);
  if (select) return select.evaluate((el) => [...(el as HTMLSelectElement).options].map((o) => (o.textContent ?? '').trim()));
  await target.click();
  await expect(page.getByRole('option').first()).toBeVisible();
  const labels = (await page.getByRole('option').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  return labels;
}

/* ---------------- Calendar (react-day-picker qua shadcn) ---------------- */

const EN_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** Chỉ số (trong cal.locator('button')) của ô ngày y-m-d đang hiển thị, -1 nếu không có. */
export async function findDayButton(cal: Locator, y: number, m: number, d: number): Promise<number> {
  return cal.evaluate(
    (root, { y, m, d, en }) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      const iso = `${y}-${pad(m)}-${pad(d)}`;
      const buttons = [...root.querySelectorAll('button')];
      const visible = (b: Element) => (b as HTMLElement).getClientRects().length > 0 && !(b as HTMLButtonElement).disabled;
      // 1) data-day ISO (react-day-picker v9 đặt trên ô ngày).
      let i = buttons.findIndex((b) => visible(b) && (b.getAttribute('data-day') === iso || b.closest('[data-day]')?.getAttribute('data-day') === iso));
      if (i >= 0) return i;
      // 2) accessible name chứa ngày.
      const dayRe = new RegExp(`(^|\\D)0?${d}(\\D|$)`);
      const monthRe = new RegExp(`(tháng\\s*0?${m}(\\D|$))|(\\/0?${m}\\/)|(-${pad(m)}-)|(${en[m - 1]})`, 'i');
      i = buttons.findIndex((b) => {
        if (!visible(b) || !b.closest('[role="grid"], table')) return false;
        // aria-label của ô ngày; nếu không có thì nhãn lưới (tháng/năm) + số ngày, bỏ ngày ngoài tháng.
        const own = b.getAttribute('aria-label');
        if (!own && b.closest('[data-outside], .rdp-outside, [class*="outside"]')) return false;
        const name = (own || `${b.closest('[aria-label]')?.getAttribute('aria-label') ?? ''} ${b.textContent ?? ''}`).replace(/\s+/g, ' ');
        if (!name.includes(String(y))) return false;
        const rest = name.replace(String(y), ' ');
        return monthRe.test(rest) && dayRe.test(rest.replace(monthRe, ' '));
      });
      return i;
    },
    { y, m, d, en: EN_MONTHS },
  );
}

/** Bấm nút tháng sau (dir=1) / tháng trước (dir=-1) của lịch. */
export async function clickCalendarNav(cal: Locator, dir: 1 | -1) {
  const nameRe = dir === 1 ? /next|sau|tiếp|kế/i : /prev|trước/i;
  const byName = cal.getByRole('button', { name: nameRe });
  if ((await byName.count()) > 0) {
    await byName.first().click();
    return;
  }
  // Dự phòng: nút ngoài lưới ngày, trái = trước, phải = sau.
  const idx = await cal.evaluate((root, dir) => {
    const buttons = [...root.querySelectorAll('button')];
    const nav = buttons
      .map((b, i) => ({ i, b, x: b.getBoundingClientRect().x }))
      .filter(({ b }) => !b.closest('[role="grid"], table') && (b as HTMLElement).getClientRects().length > 0);
    nav.sort((a, b) => a.x - b.x);
    return (dir === 1 ? nav.at(-1) : nav[0])?.i ?? -1;
  }, dir);
  if (idx < 0) throw new Error('Không thấy nút điều hướng tháng trên lịch');
  await cal.locator('button').nth(idx).click();
}

/** YYYY-MM-DD → dd/MM/yyyy (định dạng hiển thị trên nút Date Picker). */
export const ddmmyyyy = (iso: string) => iso.split('-').reverse().join('/');

/** Trạng thái "đang chọn" của chip/radio/nút toggle (checked, aria-pressed/checked/selected, data-state). */
export async function isSelected(target: Locator): Promise<boolean> {
  return target.evaluate((el) => {
    const on = (e: Element | null) => {
      if (!e) return false;
      if ((e as HTMLInputElement).checked === true) return true;
      for (const a of ['aria-pressed', 'aria-checked', 'aria-selected', 'aria-current']) {
        const v = e.getAttribute(a);
        if (v === 'true' || v === 'page') return true;
      }
      const ds = e.getAttribute('data-state');
      return ds === 'on' || ds === 'checked' || ds === 'active';
    };
    return on(el) || on(el.querySelector('input'));
  });
}

export async function expectSelected(target: Locator, selected = true) {
  await expect.poll(() => isSelected(target), { message: 'trạng thái được chọn' }).toBe(selected);
}

/** Nhãn hiển thị của một control (label bao ngoài, label liên kết, aria-label hoặc text của chính nó). */
export async function controlLabel(target: Locator): Promise<string> {
  return target.evaluate((el) => {
    const lbl = el.closest('label') ?? (el as HTMLInputElement).labels?.[0] ?? null;
    const text = lbl?.textContent || el.getAttribute('aria-label') || el.textContent || el.parentElement?.textContent || '';
    return text.replace(/\s+/g, ' ').trim();
  });
}

/** Checkbox (input gốc, wrapper chứa input, hoặc Radix Checkbox) đang được tick. */
export async function isChecked(target: Locator): Promise<boolean> {
  return target.evaluate((el) => {
    const input = (el.matches('input') ? el : el.querySelector('input[type="checkbox"]')) as HTMLInputElement | null;
    if (input) return input.checked;
    const box = el.matches('[role="checkbox"]') ? el : el.querySelector('[role="checkbox"]') ?? el;
    return box.getAttribute('aria-checked') === 'true' || box.getAttribute('data-state') === 'checked';
  });
}

/** title giải thích của checkbox trên thẻ (trên chính nó, phần tử bao gần nhất trong thẻ, hoặc phần tử con). */
export async function checkboxTitle(cb: Locator): Promise<string> {
  return cb.evaluate((el) => {
    const own = el.getAttribute('title') || el.querySelector('[title]')?.getAttribute('title');
    if (own) return own;
    for (let p = el.parentElement; p && !p.matches('[data-testid="task-item"]'); p = p.parentElement) {
      const t = p.getAttribute('title');
      if (t) return t;
    }
    return '';
  });
}

/** Phần tử (hoặc control bên trong) bị vô hiệu. */
export async function isDisabled(target: Locator): Promise<boolean> {
  return target.evaluate((el) => {
    const dis = (e: Element | null) =>
      !!e &&
      ((e as HTMLButtonElement).disabled === true ||
        e.getAttribute('aria-disabled') === 'true' ||
        e.hasAttribute('data-disabled') ||
        (e as HTMLInputElement).readOnly === true);
    return dis(el) || dis(el.querySelector('input,select,button,textarea'));
  });
}

/** Nút/ô bị vô hiệu hoặc không render. */
export async function expectDisabledOrAbsent(target: Locator, what: string) {
  const n = await target.count();
  if (n === 0) return;
  for (let i = 0; i < n; i++) {
    const el = target.nth(i);
    if (!(await el.isVisible())) continue;
    expect(await isDisabled(el), `${what} phải bị vô hiệu`).toBe(true);
  }
}

/** Có gạch ngang tiêu đề (text-decoration line-through hoặc gạch bằng gradient nền như mẫu). */
export async function hasStrike(target: Locator): Promise<boolean> {
  return target.evaluate((root) => {
    const nodes = [root, ...root.querySelectorAll('*')];
    return nodes.some((n) => {
      const cs = getComputedStyle(n);
      if (cs.textDecorationLine.includes('line-through')) return true;
      if (cs.backgroundImage.includes('gradient')) {
        const w = cs.backgroundSize.split(' ')[0];
        return !!w && w !== '0px' && w !== '0%' && w !== 'auto';
      }
      return false;
    });
  });
}

/** Trạng thái theme hiện tại (để so sánh trước/sau). */
export async function themeState(page: Page) {
  return page.evaluate(() => {
    const html = document.documentElement;
    const toggle = document.querySelector('[data-testid="theme-toggle"]');
    const elements: Element[] = [html, document.body, ...document.body.querySelectorAll(':scope > *, :scope > * > *')];
    // Ảnh nền có thể nằm trên phần tử hoặc lớp giả ::before/::after (ví dụ body::before cố định).
    const layers: CSSStyleDeclaration[] = [];
    for (const el of elements)
      for (const pseudo of [null, '::before', '::after']) {
        const cs = getComputedStyle(el, pseudo);
        if (pseudo && cs.content === 'none') continue;
        layers.push(cs);
      }
    const images = layers.map((cs) => cs.backgroundImage).filter((b) => b && b !== 'none');
    const color = layers.map((cs) => cs.backgroundColor).find((c) => c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') ?? null;
    const rgb = color?.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
    const lum = rgb.length >= 3 ? (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 : null;
    // So sánh toàn bộ chuỗi các lớp ảnh nền (data URI / lớp phủ sáng-tối trùng phần đầu) bằng độ dài + hash.
    const all = images.join(' | ') || 'none';
    let h = 0;
    for (let i = 0; i < all.length; i++) h = (h * 31 + all.charCodeAt(i)) >>> 0;
    return {
      dataTheme: html.getAttribute('data-theme'),
      ariaPressed: toggle?.getAttribute('aria-pressed') ?? null,
      bgImage: `${all.length}:${h.toString(16)}`,
      hasBgImage: images.length > 0,
      bgColor: color,
      luminance: lum,
    };
  });
}

/** Bấm link và lấy sự kiện download (trên trang hiện tại hoặc tab mới mở ra), null nếu không có. */
export async function clickAndGetDownload(page: import('@playwright/test').Page, link: import('@playwright/test').Locator) {
  const onPage = page.waitForEvent('download', { timeout: 15_000 }).catch(() => null);
  const viaPopup = page
    .context()
    .waitForEvent('page', { timeout: 15_000 })
    .then((p) => p.waitForEvent('download', { timeout: 15_000 }))
    .catch(() => null);
  await link.click();
  return (await onPage) ?? (await viaPopup);
}
