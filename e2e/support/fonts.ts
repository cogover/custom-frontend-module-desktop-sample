import type { Locator, Page } from '@playwright/test';
import { FONT_PX, HEADING_PX } from './model';

/**
 * Kiểm cỡ chữ theo AC39 (CONTRACT mục 5 "Cỡ chữ"): mọi chữ đang hiển thị 13.5px; `h1` / `h2` 20px (phần tử con
 * trong h1/h2 được 20px hoặc 13.5px); chỉ chữ cái trong avatar khác. Quét phần tử có chữ trực tiếp + ô nhập / nút /
 * vùng soạn đang hiển thị trong `rootSelector` (mặc định cả trang, gồm popover / dialog / toast gắn vào body).
 * Trả về danh sách vi phạm dạng "<mô tả>: <cỡ chữ>".
 */
export async function fontViolations(page: Page, rootSelector = 'body'): Promise<string[]> {
  return page.evaluate(
    ({ rootSelector, base, heading }) => {
      const root = document.querySelector(rootSelector);
      if (!root) return [`không thấy ${rootSelector}`];
      const shown = (el: Element) => {
        if (el.getClientRects().length === 0) return false;
        const cs = getComputedStyle(el);
        return cs.visibility !== 'hidden' && cs.display !== 'none';
      };
      const describe = (el: Element) => {
        const tid = el.closest('[data-testid]')?.getAttribute('data-testid');
        const cls = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
        const text = (el.textContent ?? (el as HTMLInputElement).value ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);
        return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${tid ? ` [${tid}]` : ''} "${text}"`;
      };
      const controls = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea, select:not([aria-hidden="true"]), button, [contenteditable="true"]';
      const out: string[] = [];
      const seen = new Set<Element>();
      for (const el of [root, ...root.querySelectorAll('*')]) {
        if (seen.has(el)) continue;
        const hasText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
        if (!hasText && !el.matches(controls)) continue;
        if (el.closest('.avatar, svg, [aria-hidden="true"] select')) continue;
        if (!shown(el)) continue;
        seen.add(el);
        const px = parseFloat(getComputedStyle(el).fontSize);
        const inHeading = el.closest('h1, h2');
        const isHeading = el.matches('h1, h2');
        const ok = isHeading && hasText ? px === heading : inHeading ? px === heading || px === base : px === base;
        if (!ok) out.push(`${describe(el)}: ${px}px`);
      }
      return out;
    },
    { rootSelector, base: FONT_PX, heading: HEADING_PX },
  );
}

/** Cỡ chữ (px) của một phần tử. */
export const fontPx = (l: Locator) => l.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
