import { test, expect } from '../../support/local/fixtures';
import { bulkTasks, NAME, P, T } from '../../support/local/dataset';

/** title/aria-label của ô Người giao (trên chính ô hoặc phần tử con). */
const reporterLabel = (cell: import('@playwright/test').Locator) =>
  cell.evaluate((el) => {
    const nodes = [el, ...el.querySelectorAll('*')];
    for (const n of nodes) {
      const v = n.getAttribute('aria-label') || n.getAttribute('title');
      if (v) return v.trim();
    }
    return '';
  });

test.describe('AC17 desktop: chỉ panel danh sách cuộn', () => {
  test('AC17 1440×900 với 40 việc: trang không cuộn, danh sách cuộn', async ({ app, mock, page }) => {
    mock.setTasks(bulkTasks(40, { prefix: 'O', status: 'new' }));
    await app.openReady();
    await expect(app.items()).toHaveCount(40);
    const info = await page.evaluate(() => {
      const doc = document.scrollingElement!;
      const item = document.querySelector('[data-testid="task-item"]');
      let el = item?.parentElement ?? null;
      while (el && el !== document.body && el !== document.documentElement) {
        const cs = getComputedStyle(el);
        if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) break;
        el = el.parentElement;
      }
      const scroller = el && el !== document.body && el !== document.documentElement ? el : null;
      if (scroller) scroller.setAttribute('data-e2e-scroller', '1');
      return { docOverflow: doc.scrollHeight - window.innerHeight, hasScroller: !!scroller };
    });
    expect(info.docOverflow, 'trang (document) không được cuộn dọc ở desktop').toBeLessThanOrEqual(1);
    expect(info.hasScroller, 'phải có panel danh sách tự cuộn').toBe(true);
    const scroller = page.locator('[data-e2e-scroller="1"]');
    const box = (await scroller.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 200));
    await page.mouse.wheel(0, 800);
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
});

test.describe('AC17 ô Người giao trên thẻ theo bố cục', () => {
  test('AC17 desktop 4 cột: chỉ avatar, tên trong title/aria-label "Người giao: <tên>", trống → "—"', async ({ app, mock }) => {
    mock.task(T.T8)!.reporter = null;
    await app.openReady();
    const cell = app.inItem(T.T1, 'task-reporter');
    await expect(cell).toBeVisible();
    expect(await reporterLabel(cell)).toBe(`Người giao: ${NAME[P.LAN]}`);
    await expect(cell, 'không hiện tên dạng chữ ở desktop').not.toContainText(NAME[P.LAN], { useInnerText: true });
    const empty = app.inItem(T.T8, 'task-reporter');
    await expect(empty).toContainText('—');
    expect(await reporterLabel(empty)).toBe('Chưa có người giao');
  });
});

test.describe('AC17 mobile 375px', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  const noHorizontalScroll = (page: import('@playwright/test').Page) =>
    page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      vw: window.innerWidth,
    }));

  test('AC17 danh sách, popup xem và form tạo không cuộn ngang ở 375px', async ({ app, page }) => {
    await app.openReady();
    let w = await noHorizontalScroll(page);
    expect(w.vw).toBe(375);
    expect(w.doc, 'danh sách: không cuộn ngang').toBeLessThanOrEqual(375);
    expect(w.body).toBeLessThanOrEqual(375);
    for (const box of await app.items().evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right)))
      expect(box, 'thẻ không tràn ngang').toBeLessThanOrEqual(375.5);

    await app.openTask(T.T7);
    w = await noHorizontalScroll(page);
    expect(w.doc, 'popup xem: không cuộn ngang').toBeLessThanOrEqual(375);
    const dlg = (await app.dialog().boundingBox())!;
    expect(dlg.x).toBeGreaterThanOrEqual(0);
    expect(dlg.x + dlg.width).toBeLessThanOrEqual(375.5);
    await page.keyboard.press('Escape');

    await app.openCreate();
    w = await noHorizontalScroll(page);
    expect(w.doc, 'form tạo: không cuộn ngang').toBeLessThanOrEqual(375);
    const dlg2 = (await app.dialog().boundingBox())!;
    expect(dlg2.x + dlg2.width).toBeLessThanOrEqual(375.5);
  });

  test('AC17 bố cục hẹp (375px): ô Người giao hiện avatar + tên', async ({ app }) => {
    await app.openReady();
    await expect(app.inItem(T.T1, 'task-reporter')).toContainText(NAME[P.LAN], { useInnerText: true });
  });
});
