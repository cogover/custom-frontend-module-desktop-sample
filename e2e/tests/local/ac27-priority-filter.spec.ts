import type { Page } from '@playwright/test';
import { test, expect } from '../../support/local/fixtures';
import { T } from '../../support/local/dataset';
import { expectSelected, isSelected, type TaskApp } from '../../support/ui';

/**
 * AC27 Bộ lọc "Mức ưu tiên" (CONTRACT mục 5 điểm 1b, 2026-10-03): chip checkbox Tất cả / Khẩn cấp / Cao / Trung bình / Thấp.
 * Mặc định "Tất cả"; tick một/vài mức → OR; tick đủ 4 hoặc bấm "Tất cả" → về "Tất cả"; task không có ưu tiên chỉ hiện khi "Tất cả";
 * không đổi số đếm bộ lọc nhanh; "đang lọc" (badge +1, Đặt lại bộ lọc); áp cho cả việc đã xong đã tải; nhớ trong view (`prios`).
 * Dữ liệu (vai trò mặc định "Giao cho tôi"): mở T1 Cao, T3 Trung bình, T4 Cao, T6 (trống), T7 Khẩn cấp, T8 Trung bình;
 * đã xong D1 Cao, D3 Thấp.
 */

type Prio = 'urgent' | 'high' | 'medium' | 'low';
const PRIOS: Prio[] = ['urgent', 'high', 'medium', 'low'];
const OPEN_ALL = [T.T1, T.T3, T.T4, T.T6, T.T7, T.T8];
const COUNTS = { open: 6, done: 2, all: 8 };

async function togglePrio(app: TaskApp, p: Prio | 'all') {
  await app.ensurePanelOpen(`prio-filter-${p}`);
  await app.tid(`prio-filter-${p}`).click();
}

async function selectedPrios(app: TaskApp): Promise<string[]> {
  const out: string[] = [];
  for (const p of ['all', ...PRIOS]) if (await isSelected(app.tid(`prio-filter-${p}`))) out.push(p);
  return out;
}

/** Số trên badge "Bộ lọc & sắp xếp" (0 khi không có badge). */
async function badgeCount(page: Page): Promise<number> {
  const summary = page.getByText('Bộ lọc & sắp xếp', { exact: false }).first();
  const text = (await summary.innerText()).replace('Bộ lọc & sắp xếp', '');
  const m = text.match(/\d+/);
  return m ? Number(m[0]) : 0;
}

/** Nút "Đặt lại bộ lọc" trong panel bộ lọc (không phải nút của trạng thái rỗng). */
const panelReset = (page: Page) =>
  page.getByRole('button', { name: 'Đặt lại bộ lọc', exact: true }).and(page.locator(':not([data-testid="empty-reset"])'));

test.describe('AC27 bộ lọc Mức ưu tiên', () => {
  test('AC27 mặc định "Tất cả": đủ 5 chip theo thứ tự, không lọc (gồm việc không có ưu tiên), không badge/Đặt lại', async ({ app, page }) => {
    await app.openReady();
    await app.ensurePanelOpen('prio-filter-all');
    expect(await selectedPrios(app)).toEqual(['all']);
    const labels: string[] = [];
    for (const p of ['all', ...PRIOS]) {
      const t = await app.tid(`prio-filter-${p}`).evaluate((el) => (el.closest('label') ?? el).textContent?.replace(/\s+/g, ' ').trim() ?? '');
      labels.push(t);
    }
    expect(labels).toEqual(['Tất cả', 'Khẩn cấp', 'Cao', 'Trung bình', 'Thấp']);
    await app.expectIds(OPEN_ALL);
    await app.expectCounts(COUNTS);
    expect(await badgeCount(page)).toBe(0);
    await expect(panelReset(page)).toHaveCount(0);
  });

  test('AC27 tick một mức → chỉ việc mức đó; thêm mức → OR; số đếm không đổi; badge +1 và nút Đặt lại', async ({ app, page }) => {
    await app.openReady();
    const badge0 = await badgeCount(page);
    await togglePrio(app, 'high');
    expect(await selectedPrios(app), 'tick một mức bỏ "Tất cả"').toEqual(['high']);
    await app.expectIds([T.T1, T.T4]);
    await app.expectCounts(COUNTS);
    expect(await badgeCount(page), 'đang lọc → badge +1').toBe(badge0 + 1);
    await expect(panelReset(page)).toBeVisible();

    await togglePrio(app, 'urgent');
    expect(await selectedPrios(app)).toEqual(['urgent', 'high']);
    await app.expectIds([T.T1, T.T4, T.T7]);
    await app.expectCounts(COUNTS);
    expect(await badgeCount(page), 'nhiều mức vẫn tính một bộ lọc').toBe(badge0 + 1);

    // Bỏ tick một mức → còn lại mức kia.
    await togglePrio(app, 'high');
    expect(await selectedPrios(app)).toEqual(['urgent']);
    await app.expectIds([T.T7]);

    // Trung bình: việc không có ưu tiên (T6) không hiện khi đang lọc.
    await togglePrio(app, 'urgent');
    await togglePrio(app, 'medium');
    await app.expectIds([T.T3, T.T8]);
    await app.expectCounts(COUNTS);
  });

  test('AC27 tick đủ 4 mức → về "Tất cả" (bỏ tick các mức); bấm "Tất cả" khi đang lọc → về "Tất cả"', async ({ app, page }) => {
    await app.openReady();
    for (const p of PRIOS) await togglePrio(app, p);
    await expect.poll(() => selectedPrios(app), { message: 'đủ 4 mức → Tất cả' }).toEqual(['all']);
    await app.expectIds(OPEN_ALL);
    expect(await badgeCount(page)).toBe(0);

    await togglePrio(app, 'low');
    await togglePrio(app, 'medium');
    expect(await selectedPrios(app)).toEqual(['medium', 'low']);
    await togglePrio(app, 'all');
    await expect.poll(() => selectedPrios(app)).toEqual(['all']);
    await app.expectIds(OPEN_ALL);
    await expect(panelReset(page)).toHaveCount(0);
  });

  test('AC27 Đặt lại bộ lọc → về "Tất cả"; lọc không còn việc → rỗng với phụ đề nhắc mức ưu tiên; áp cho cả việc đã xong đã tải', async ({ app, page }) => {
    await app.openReady();
    await togglePrio(app, 'urgent');
    await app.expectIds([T.T7]);
    await panelReset(page).click();
    await expect.poll(() => selectedPrios(app)).toEqual(['all']);
    await app.expectIds(OPEN_ALL);

    // "Chưa xong" không có việc Thấp → rỗng do lọc.
    await togglePrio(app, 'low');
    await expect(app.tid('empty-state')).toBeVisible();
    await expect(app.tid('empty-state')).toContainText('Chọn khoảng hạn chót, vai trò hoặc mức ưu tiên khác, hoặc đặt lại bộ lọc.');
    await expect(app.tid('empty-reset')).toBeVisible();
    await app.expectCounts(COUNTS);
    // "Tất cả" (việc đã xong đã tải): D3 Thấp hiện.
    await app.quick('all');
    await app.expectIds([T.D3]);
    await app.quick('done');
    await app.expectIds([T.D3]);
    await app.tid('empty-reset').or(panelReset(page)).first().click();
    await expect.poll(() => selectedPrios(app)).toEqual(['all']);
    await app.expectIds([T.D1, T.D3]);
  });

  test('AC27 nhớ qua refresh (view có mảng prios); giá trị lạ trong view → "Tất cả"', async ({ app, page }) => {
    await app.openReady();
    await togglePrio(app, 'urgent');
    await togglePrio(app, 'high');
    await app.expectIds([T.T1, T.T4, T.T7]);
    // View được lưu trong localStorage dạng mảng `prios` (tìm theo nội dung, không phụ thuộc tên key).
    const saved = await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        try {
          const v = JSON.parse(localStorage.getItem(k) ?? '');
          if (v && typeof v === 'object' && Array.isArray(v.prios)) return { key: k, prios: v.prios as string[] };
        } catch {
          /* không phải JSON */
        }
      }
      return null;
    });
    expect(saved, 'view trong localStorage có mảng prios').not.toBeNull();
    expect([...saved!.prios].sort()).toEqual(['high', 'urgent']);

    await page.reload();
    await app.ready();
    await app.ensurePanelOpen('prio-filter-all');
    expect(await selectedPrios(app)).toEqual(['urgent', 'high']);
    await app.expectIds([T.T1, T.T4, T.T7]);

    // Giá trị lạ → Tất cả.
    await page.evaluate((key) => {
      const v = JSON.parse(localStorage.getItem(key)!);
      v.prios = ['khong-hop-le'];
      localStorage.setItem(key, JSON.stringify(v));
    }, saved!.key);
    await page.reload();
    await app.ready();
    await app.ensurePanelOpen('prio-filter-all');
    await expectSelected(app.tid('prio-filter-all'));
    expect(await selectedPrios(app)).toEqual(['all']);
    await app.expectIds(OPEN_ALL);
  });

  test('AC27 chip chọn nhiều (Vai trò, Mức ưu tiên) có ô tick nhỏ (.chip.multi .chip-box); Hạn chót (chọn một) giữ chip trơn', async ({ app }) => {
    await app.openReady();
    await app.ensurePanelOpen('prio-filter-all');
    const hasBox = (id: string) =>
      app.tid(id).evaluate((el) => {
        const chip = el.closest('.chip') ?? el.closest('label') ?? el;
        return chip.matches('.chip.multi') && !!chip.querySelector('.chip-box');
      });
    for (const id of ['prio-filter-all', 'prio-filter-high', 'role-filter-assignee', 'role-filter-cc']) expect(await hasBox(id), id).toBe(true);
    for (const id of ['due-filter-all', 'due-filter-today']) expect(await hasBox(id), `${id} giữ chip trơn`).toBe(false);
  });
});
