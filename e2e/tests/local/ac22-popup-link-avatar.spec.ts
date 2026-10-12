import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../../support/local/fixtures';
import { P, T } from '../../support/local/dataset';
import { descShape } from '../../support/paste';
import type { TaskApp } from '../../support/ui';

/**
 * AC22 (CONTRACT mục 5, đoạn "Nút popup chế độ xem", 2026-10-02):
 *  - Bấm ra ngoài popup (vùng tối quanh popup) KHÔNG đóng popup — cả xem, tạo, sửa; ✕ / Esc / Huỷ vẫn đóng như cũ;
 *    nội dung đang nhập giữ nguyên.
 *  - Popover nhập liên kết của mô tả có nút ✕ `rte-link-close` (aria-label "Đóng", title "Đóng (Esc)"): đóng như Esc,
 *    không áp dụng liên kết, popup task vẫn mở.
 *  - Avatar người (ảnh và chữ cái đầu) hình tròn.
 */

test.describe('AC22 popup không đóng khi bấm ra ngoài', () => {
  test('AC22/AC11 popup xem: bấm ra ngoài không đóng; ✕ và Esc vẫn đóng', async ({ app, page, mock }) => {
    await app.openReady();
    await app.openTask(T.T3);
    await app.clickOutsideDialog();
    await expect(app.view()).toBeVisible();
    await expect(app.view()).toContainText('Nghiên cứu ứng dụng đối thủ');
    await app.tid('dialog-close').click();
    await expect(app.dialog()).toBeHidden();

    await app.openTask(T.T3);
    await app.clickOutsideDialog();
    await page.keyboard.press('Escape');
    await expect(app.dialog(), 'Esc vẫn đóng popup xem sau khi bấm ra ngoài').toBeHidden();
    expect(mock.writes()).toHaveLength(0);
  });

  test('AC22/AC10 popup tạo: bấm ra ngoài không đóng, tiêu đề + mô tả đang nhập giữ nguyên; Huỷ và Esc vẫn đóng', async ({ app, page, mock }) => {
    await app.openReady();
    await app.openCreate();
    await app.tid('field-title').fill('Việc đang soạn dở');
    await app.focusDesc();
    await page.keyboard.type('Mô tả đang gõ dở');
    await app.clickOutsideDialog();
    await expect(app.form()).toBeVisible();
    await expect(app.tid('field-title')).toHaveValue('Việc đang soạn dở');
    await expect.poll(() => app.descText(), { message: 'mô tả đang gõ còn nguyên' }).toBe('Mô tả đang gõ dở');
    expect(mock.creates(), 'bấm ra ngoài không tạo task').toHaveLength(0);

    // Vẫn gõ tiếp được sau khi bấm ra ngoài, rồi tạo bình thường.
    await app.tid('field-title').fill('Việc đang soạn dở (xong)');
    await app.tid('form-submit').click();
    await expect.poll(() => mock.creates().length).toBe(1);
    expect(mock.creates()[0].body.data.subject).toBe('Việc đang soạn dở (xong)');
    expect((await descShape(page, mock.creates()[0].body.data.description)).text).toBe('Mô tả đang gõ dở');
    await expect(app.dialog()).toBeHidden();

    await app.openCreate();
    await app.clickOutsideDialog();
    await app.tid('form-cancel').click();
    await expect(app.dialog(), 'Huỷ vẫn đóng popup tạo').toBeHidden();
    await app.openCreate();
    await app.clickOutsideDialog();
    await page.keyboard.press('Escape');
    await expect(app.dialog(), 'Esc vẫn đóng popup tạo').toBeHidden();
    expect(mock.creates()).toHaveLength(1);
  });

  test('AC22/AC11 popup sửa: bấm ra ngoài vẫn ở chế độ sửa với nội dung đang nhập; Esc về xem, không lưu', async ({ app, page, mock }) => {
    await app.openReady();
    await app.openTask(T.T3);
    await app.tid('form-edit').click();
    await expect(app.form()).toBeVisible();
    await app.tid('field-title').fill('Tên đang sửa dở');
    await app.clickOutsideDialog();
    await expect(app.form(), 'vẫn ở chế độ sửa').toBeVisible();
    await expect(app.tid('field-title')).toHaveValue('Tên đang sửa dở');
    expect(mock.updates(), 'bấm ra ngoài không lưu').toHaveLength(0);
    await page.keyboard.press('Escape');
    await expect(app.view()).toBeVisible();
    await expect(app.view()).not.toContainText('Tên đang sửa dở');
    await expect(app.dialog()).toBeVisible();
    expect(mock.updates()).toHaveLength(0);
  });
});

test.describe('AC22 popover liên kết của mô tả', () => {
  /** Gõ chữ rồi chọn hết, mở popover liên kết. */
  async function openLinkPopover(app: TaskApp, page: Page, text: string) {
    await app.focusDesc();
    if (text) await page.keyboard.type(text);
    await page.keyboard.press('ControlOrMeta+a');
    await app.settleSelection();
    await app.rte('link');
    const pop = app.tid('rte-link-popover');
    await expect(pop).toBeVisible();
    return pop;
  }

  test('AC22 nút ✕ (Đóng, title "Đóng (Esc)") đóng popover, không áp dụng liên kết, popup task vẫn mở', async ({ app, page, mock }) => {
    await app.openReady();
    await app.openCreate();
    await app.tid('field-title').fill('Việc thử nút đóng liên kết');
    const pop = await openLinkPopover(app, page, 'Tài liệu tham khảo');
    const close = app.tid('rte-link-close');
    await expect(close).toBeVisible();
    await expect(close).toHaveAccessibleName('Đóng');
    await expect(close).toHaveAttribute('title', 'Đóng (Esc)');
    await pop.getByRole('textbox', { name: 'Liên kết' }).fill('https://example.com/khong-ap-dung');
    await close.click();
    await expect(pop).toBeHidden();
    await expect(app.dialog(), 'popup task vẫn mở').toBeVisible();
    await expect(app.form()).toBeVisible();
    await expect(app.descEditor().locator('a'), 'không áp dụng liên kết').toHaveCount(0);
    await expect.poll(() => app.descText()).toBe('Tài liệu tham khảo');

    // Esc trong popover: cũng chỉ đóng popover, không áp dụng.
    const pop2 = await openLinkPopover(app, page, '');
    await pop2.getByRole('textbox', { name: 'Liên kết' }).fill('https://example.com/khong-ap-dung-esc');
    await page.keyboard.press('Escape');
    await expect(pop2).toBeHidden();
    await expect(app.dialog()).toBeVisible();
    await expect(app.descEditor().locator('a')).toHaveCount(0);

    await app.tid('form-submit').click();
    await expect.poll(() => mock.creates().length).toBe(1);
    const shape = await descShape(page, mock.creates()[0].body.data.description);
    expect(shape.text).toBe('Tài liệu tham khảo');
    expect(mock.creates()[0].body.data.description).not.toContain('<a');
  });

  test('AC22 đối chứng: Áp dụng trong popover liên kết → <a href target=_blank rel=noopener noreferrer>', async ({ app, page, mock }) => {
    await app.openReady();
    await app.openCreate();
    await app.tid('field-title').fill('Việc có liên kết');
    const pop = await openLinkPopover(app, page, 'Tài liệu tham khảo');
    await pop.getByRole('textbox', { name: 'Liên kết' }).fill('https://example.com/tai-lieu');
    await app.tid('rte-link-save').click();
    await expect(pop).toBeHidden();
    await expect(app.descEditor().locator('a')).toHaveCount(1);
    await app.tid('form-submit').click();
    await expect.poll(() => mock.creates().length).toBe(1);
    const html = mock.creates()[0].body.data.description as string;
    const a = await page.evaluate((h) => {
      const el = new DOMParser().parseFromString(h, 'text/html').querySelector('a');
      return el && { href: el.getAttribute('href'), target: el.getAttribute('target'), rel: el.getAttribute('rel'), text: el.textContent };
    }, html);
    expect(a).toMatchObject({ href: 'https://example.com/tai-lieu', target: '_blank', text: 'Tài liệu tham khảo' });
    expect(a!.rel ?? '').toContain('noopener');
    expect(a!.rel ?? '').toContain('noreferrer');
  });
});

/** Mọi `.avatar` đang hiển thị trong scope: hình vuông, bo tròn ≥ nửa cạnh (hoặc 50%); ảnh bên trong bị cắt tròn. */
async function avatarShapes(scope: Locator) {
  return scope.locator('.avatar').evaluateAll((els) =>
    els
      .filter((el) => (el as HTMLElement).getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden')
      .map((el) => {
        const round = (e: Element) => {
          const cs = getComputedStyle(e);
          const r = e.getBoundingClientRect();
          const half = Math.min(r.width, r.height) / 2;
          return (['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'] as const).every((k) => {
            const v = cs[k];
            return v.trim().endsWith('%') ? parseFloat(v) >= 50 : parseFloat(v) >= half - 0.5;
          });
        };
        const r = el.getBoundingClientRect();
        const img = el.querySelector('img');
        const cs = getComputedStyle(el);
        const clips = ['hidden', 'clip'].includes(cs.overflowX) && ['hidden', 'clip'].includes(cs.overflowY);
        return {
          label: (el.closest('[title]')?.getAttribute('title') ?? el.textContent ?? '').slice(0, 40),
          square: Math.abs(r.width - r.height) < 1,
          round: round(el),
          radius: cs.borderTopLeftRadius,
          hasImg: !!img,
          imgRound: !img || round(img) || (round(el) && clips),
        };
      }),
  );
}

function expectRound(shapes: Awaited<ReturnType<typeof avatarShapes>>, where: string) {
  expect(shapes.length, `${where}: có avatar`).toBeGreaterThan(0);
  for (const s of shapes) {
    expect(s.square, `${where}: avatar "${s.label}" vuông`).toBe(true);
    expect(s.round, `${where}: avatar "${s.label}" tròn (border-radius ${s.radius})`).toBe(true);
    expect(s.imgRound, `${where}: ảnh avatar "${s.label}" cắt tròn`).toBe(true);
  }
}

test.describe('AC22 avatar tròn', () => {
  test('AC22 avatar (ảnh và chữ cái) hình tròn: thẻ + dải người giao, popup xem, ô chọn người', async ({ app, page }) => {
    await app.openReady();
    await app.setRoles(['reporter', 'assignee', 'cc']);
    const list = await avatarShapes(page.locator('body'));
    expectRound(list, 'danh sách');
    expect(list.some((s) => s.hasImg), 'có avatar ảnh (Nguyễn Thị Lan)').toBe(true);
    expect(list.some((s) => !s.hasImg), 'có avatar chữ cái').toBe(true);
    expectRound(await avatarShapes(app.inItem(T.T1, 'task-reporter')), 'cột Người giao của thẻ');

    await app.openTask(T.T7); // người theo dõi nhiều người: avatar chồng
    expectRound(await avatarShapes(app.dialog()), 'popup xem');
    await page.keyboard.press('Escape');
    await expect(app.dialog()).toBeHidden();

    await app.openCreate();
    expectRound(await avatarShapes(app.tid('field-reporter')), 'ô chọn Người giao');
    await app.tid('field-assignee').click();
    await expect(page.getByTestId('person-option').first()).toBeVisible();
    const opts = await avatarShapes(page.getByTestId('person-option'));
    expectRound(opts, 'danh sách chọn người');
    expect(opts.some((s) => s.hasImg), 'option có avatar ảnh').toBe(true);
    await expect(page.locator(`[data-testid="person-option"][data-person-id="${P.LAN}"] .avatar`)).toHaveCount(1);
  });
});
