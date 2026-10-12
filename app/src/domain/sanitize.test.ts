import { describe, expect, it } from 'vitest';
import { MENTION_STYLE } from './mentions';
import { sanitizeDescription, sanitizeForSave } from './sanitize';

describe('sanitizeDescription', () => {
  it('removes scripts, event handlers, inline styles and forms', () => {
    const out = sanitizeDescription(
      '<p style="color:red" onclick="alert(1)">Xin chào</p><script>alert(1)</script>' +
        '<img src="x" onerror="alert(1)"><iframe src="https://evil.test"></iframe><form><input></form>' +
        '<a href="javascript:alert(1)">bad</a>',
    );
    expect(out).not.toMatch(/script|onerror|onclick|style=|iframe|<form|<input|javascript:/i);
    expect(out).toContain('<p>Xin chào</p>');
  });

  it('keeps basic formatting, images and tables; links open in a new tab safely', () => {
    const out = sanitizeDescription(
      '<p><b>Đậm</b> <i>nghiêng</i></p><ul><li>một</li></ul><table><tbody><tr><td>1</td></tr></tbody></table>' +
        '<img src="https://x.test/a.png" alt="ảnh"><a href="https://cogover.com">link</a>',
    );
    expect(out).toContain('<b>Đậm</b>');
    expect(out).toContain('<li>một</li>');
    expect(out).toContain('<td>1</td>');
    expect(out).toMatch(/<img src="https:\/\/x.test\/a.png" alt="ảnh" loading="lazy">/);
    expect(out).toContain('<a href="https://cogover.com" target="_blank" rel="noopener noreferrer">link</a>');
  });

  it('returns an empty string for an empty description', () => {
    expect(sanitizeDescription('')).toBe('');
  });
});

describe('sanitizeForSave', () => {
  it('keeps exactly the tags and attributes the editor writes', () => {
    const html =
      '<h1>T</h1><p><strong>a</strong><em>b</em><u>c</u><s>d</s><code>e</code><br></p><ul><li>x<ol><li>y</li></ol></li></ul>' +
      '<blockquote><p>q</p></blockquote><p><a href="https://x.test" target="_blank" rel="noopener noreferrer">l</a><img src="/files/a.png" alt="h"></p>';
    expect(sanitizeForSave(html)).toBe(html);
  });

  it('removes anything else, unsafe links included, and fixes link targets', () => {
    expect(sanitizeForSave('<p class="slate-p" data-x="1" style="color:red" onclick="x()">a</p>')).toBe('<p>a</p>');
    expect(sanitizeForSave('<table><tr><td>t</td></tr></table><script>alert(1)</script><span>s</span>')).toBe('ts');
    expect(sanitizeForSave('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeForSave('<a href="https://x.test">x</a>')).toBe('<a href="https://x.test" target="_blank" rel="noopener noreferrer">x</a>');
    expect(sanitizeForSave('<img src="x" onerror="alert(1)" loading="lazy">')).toBe('<img src="x">');
    expect(sanitizeForSave('')).toBe('');
  });
});

describe('@mention spans (CONTRACT §5.3f)', () => {
  const mention = (attrs: string) => `<p>Nhờ <span data-autocomplete-type="mention" data-id="PER1" ${attrs}>@Lan</span></p>`;

  it('saves a mention with exactly Cogover’s attributes (fixed pill style), nothing else keeps them', () => {
    const out = sanitizeForSave(
      mention('data-parent-object-id="OT1" data-parent-record-id="TAS1" data-redirect="/o/task/TAS1?activityId={record_id}" data-mentioned="true" style="color:red" onclick="x()" class="k"') +
        '<p style="color:red" data-id="PER2" contenteditable="true">x <span data-autocomplete-type="other" style="a:b">y</span></p>',
    );
    const doc = new DOMParser().parseFromString(out, 'text/html');
    const span = doc.querySelector('[data-autocomplete-type="mention"]')!;
    expect(span.getAttribute('contenteditable')).toBe('false');
    expect(span.getAttribute('data-type')).toBe('autocomplete');
    expect(span.getAttribute('style')).toBe(MENTION_STYLE);
    expect(span.getAttribute('data-redirect')).toBe('/o/task/TAS1?activityId={record_id}');
    expect(span.getAttribute('data-mentioned')).toBe('true');
    expect(span.hasAttribute('onclick') || span.hasAttribute('class')).toBe(false);
    const other = doc.querySelectorAll('p')[1];
    expect(other.outerHTML).toBe('<p>x y</p>');
  });

  it('drops a redirect that is not a Workspace path and a bad notified marker', () => {
    const out = sanitizeForSave(mention('data-redirect="https://evil.test" data-mentioned="yes"'));
    expect(out).not.toMatch(/evil|data-mentioned/);
    expect(out).toContain('data-id="PER1"');
  });

  it('shows a mention as a pill marker only (no inline style, no ids)', () => {
    const out = sanitizeDescription(mention(`style="${MENTION_STYLE}"`) + '<p><b data-autocomplete-type="mention">z</b></p>');
    expect(out).toBe('<p>Nhờ <span data-autocomplete-type="mention">@Lan</span></p><p><b>z</b></p>');
  });
});
