import { test, expect } from '../../support/local/fixtures';
import { T } from '../../support/local/dataset';
import { hasStrike, type TaskApp } from '../../support/ui';

/**
 * Yêu cầu người dùng 2026-10-01: trong danh sách "Đã xong" (quick-done) thẻ việc đã xong hiển thị như thẻ
 * thường — tiêu đề không gạch ngang, không mờ (màu chữ như thẻ thường), mô tả và dòng meta opacity 1.
 * Ở "Tất cả" thẻ đã xong vẫn gạch ngang + mờ. Kiểm bằng computed style, không dựa tên class.
 *
 * So sánh T1 (mở, ưu tiên Cao, người giao khác tôi) với D1 (đã xong, ưu tiên Cao, người giao khác tôi).
 */

const DESC = { [T.T1]: 'Lời chào, giới thiệu', [T.D1]: 'Gom về 6 màu' } as Record<string, string>;

type Look = {
  titleColor: string;
  titleOpacity: number;
  descColor: string | null;
  descOpacity: number | null;
  priorityColor: string;
  cardOpacity: number;
  meta: Record<string, number | null>;
  strike: boolean;
};

/** Màu chữ + opacity hiệu dụng (nhân opacity/filter opacity của phần tử và mọi tổ tiên) của các phần trên thẻ. */
async function look(app: TaskApp, id: string): Promise<Look> {
  const item = app.item(id);
  await item.scrollIntoViewIfNeeded();
  await app.page.mouse.move(0, 0); // không hover thẻ
  const base = await item.evaluate((card, descText) => {
    const eff = (el: Element | null) => {
      if (!el) return null;
      let o = 1;
      for (let n: Element | null = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        o *= parseFloat(cs.opacity || '1');
        const m = cs.filter.match(/opacity\(([\d.]+)(%?)\)/);
        if (m) o *= m[2] ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
      }
      return Math.round(o * 1000) / 1000;
    };
    /** Phần tử trực tiếp chứa đoạn chữ đầu tiên (màu chữ thực tế người dùng thấy). */
    const textOwner = (root: Element | null, needle?: string) => {
      if (!root) return null;
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = w.nextNode())) {
        const t = n.textContent ?? '';
        if (needle ? t.includes(needle) : t.trim()) return n.parentElement;
      }
      return needle ? null : root;
    };
    const q = (tid: string) => card.querySelector(`[data-testid="${tid}"]`);
    const title = textOwner(q('task-title'))!;
    const desc = textOwner(card, descText);
    const prio = textOwner(q('task-priority'))!;
    return {
      titleColor: getComputedStyle(title).color,
      titleOpacity: eff(title)!,
      descColor: desc ? getComputedStyle(desc).color : null,
      descOpacity: eff(desc),
      priorityColor: getComputedStyle(prio).color,
      cardOpacity: eff(card)!,
      meta: Object.fromEntries(['task-due', 'task-priority', 'task-reporter', 'task-status'].map((t) => [t, eff(q(t))])),
    };
  }, DESC[id]);
  return { ...base, strike: await hasStrike(app.inItem(id, 'task-title')) };
}

/** Thẻ "mờ": màu tiêu đề khác thẻ thường hoặc có opacity < 1 ở tiêu đề / mô tả / cả thẻ. */
const dimmed = (l: Look, normal: Look) =>
  l.titleColor !== normal.titleColor || l.titleOpacity < 1 || l.cardOpacity < 1 || (l.descOpacity ?? 1) < 1;

test('AC3 "Đã xong": thẻ đã xong hiển thị như thẻ thường (không gạch ngang, không mờ); ở "Tất cả" vẫn gạch ngang + mờ', async ({ app }, testInfo) => {
  await app.openReady();
  await expect(app.item(T.T1)).toBeVisible();
  const open = await look(app, T.T1);
  expect(open.strike, 'thẻ mở không gạch ngang').toBe(false);
  expect(open.descColor, 'thẻ hiện mô tả rút gọn').not.toBeNull();

  // "Đã xong": D1 như thẻ thường.
  await app.quick('done');
  await expect(app.item(T.D1)).toBeVisible();
  const done = await look(app, T.D1);
  expect(done.strike, '"Đã xong": tiêu đề không gạch ngang').toBe(false);
  expect(done.titleColor, '"Đã xong": màu tiêu đề như thẻ mở').toBe(open.titleColor);
  expect(done.titleOpacity, '"Đã xong": tiêu đề opacity 1').toBe(1);
  expect(done.cardOpacity, '"Đã xong": thẻ opacity 1').toBe(1);
  expect(done.descColor, '"Đã xong": màu mô tả như thẻ mở').toBe(open.descColor);
  expect(done.descOpacity, '"Đã xong": mô tả opacity 1').toBe(1);
  expect(done.priorityColor, '"Đã xong": màu ưu tiên (cùng mức Cao) như thẻ mở').toBe(open.priorityColor);
  for (const [tid, o] of Object.entries(done.meta)) {
    expect(o, `"Đã xong": ${tid} phải có trên thẻ`).not.toBeNull();
    expect(o, `"Đã xong": ${tid} opacity 1`).toBe(1);
  }
  expect(dimmed(done, open), '"Đã xong": thẻ không mờ').toBe(false);

  // "Tất cả": thẻ mở giữ nguyên, thẻ đã xong gạch ngang + mờ như cũ.
  await app.quick('all');
  await expect(app.item(T.D1)).toBeVisible();
  await expect(app.item(T.T1)).toBeVisible();
  const allOpen = await look(app, T.T1);
  const allDone = await look(app, T.D1);
  expect(allOpen.strike).toBe(false);
  expect(allOpen.titleColor, '"Tất cả": thẻ mở như ở "Chưa xong"').toBe(open.titleColor);
  expect(dimmed(allOpen, open), '"Tất cả": thẻ mở không mờ').toBe(false);
  expect(allDone.strike, '"Tất cả": thẻ đã xong gạch ngang').toBe(true);
  expect(dimmed(allDone, allOpen), '"Tất cả": thẻ đã xong mờ (màu tiêu đề khác hoặc opacity < 1)').toBe(true);

  await testInfo.attach('computed-style', {
    body: JSON.stringify({ open, done, allOpen, allDone }, null, 2),
    contentType: 'application/json',
  });

  // Quay lại "Đã xong" → lại như thẻ thường.
  await app.quick('done');
  await expect(app.item(T.D1)).toBeVisible();
  const doneAgain = await look(app, T.D1);
  expect(doneAgain.strike).toBe(false);
  expect(dimmed(doneAgain, open)).toBe(false);
});
