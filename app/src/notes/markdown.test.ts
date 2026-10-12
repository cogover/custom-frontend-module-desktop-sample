import { describe, expect, it } from 'vitest';
import notesCss from './notes.css?raw';
import { contentText, contentToHtml, convertContent, htmlToPlain, markdownToHtml, plainToHtml } from './markdown';

describe('note content → HTML', () => {
  it('plain text: blank lines split paragraphs, line breaks stay, HTML is escaped', () => {
    expect(plainToHtml('Dòng 1\nDòng 2\n\n<b>Đoạn 2</b>')).toBe('<p>Dòng 1<br>Dòng 2</p><p>&lt;b&gt;Đoạn 2&lt;/b&gt;</p>');
  });

  it('Markdown (GFM tables, fenced code) is rendered and then sanitised', () => {
    const html = contentToHtml({ format: 3, value: '## Tiêu đề\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```\nnpm run build\n```\n\n<script>alert(1)</script><img src=x onerror=alert(1)>' });
    expect(html).toContain('<h2>Tiêu đề</h2>');
    expect(html).toContain('<table>');
    expect(html).toContain('<pre><code>npm run build');
    expect(html).not.toMatch(/<script|onerror/);
    expect(markdownToHtml('**đậm**')).toContain('<strong>đậm</strong>');
  });

  it('rich text is sanitised as stored; empty content → ""', () => {
    expect(contentToHtml({ format: 2, value: '<p style="color:red" onclick="x()">A</p>' })).toBe('<p>A</p>');
    expect(contentToHtml({ format: 2, value: '' })).toBe('');
  });

  it('one-line plain text of each format (search)', () => {
    expect(contentText({ format: 1, value: ' a\n b ' })).toBe('a b');
    expect(contentText({ format: 2, value: '<p>Xin</p><p>chào</p>' })).toBe('Xin chào');
    expect(contentText({ format: 3, value: '# Tiêu đề\n\n- mục' })).toBe('Tiêu đề mục');
    expect(contentText({ format: 3, value: '' })).toBe('');
  });

  it('switching format converts what is there (rich ↔ Markdown ↔ plain)', () => {
    expect(htmlToPlain('<h2>Đầu</h2><p>Một<br>Hai</p><ul><li>x</li><li>y</li></ul>')).toBe('Đầu\nMột\nHai\n- x\n- y');
    expect(htmlToPlain('')).toBe('');
    expect(convertContent('# A', 3, 2)).toContain('<h1>A</h1>');
    expect(convertContent('a\n\nb', 1, 2)).toBe('<p>a</p><p>b</p>');
    expect(convertContent('<p>a</p>', 2, 3)).toBe('a');
    expect(convertContent('# A', 3, 1)).toBe('# A');
    expect(convertContent('x', 2, 2)).toBe('x');
  });
});

describe('notes.css', () => {
  it('follows the stylesheet rules of Công việc: no transitions, animations or filters', () => {
    expect(notesCss).not.toMatch(/transition|animation|@keyframes|backdrop-filter|filter:/);
    expect(notesCss).toMatch(/\.notes-logo\{background:linear-gradient\(180deg,#FFD15C 0%,#F5A524 100%\)/);
    // one pane at a time on tablets / phones
    expect(notesCss).toMatch(/\.notes-board\[data-pane="tree"\] \.notes-content\{display:none\}/);
    expect(notesCss).toMatch(/\.notes-board\[data-pane="note"\] \.notes-side\{display:none\}/);
  });

  it('editor: wide (1440px), folder · format · tags on one row; share options: the icon alone, centred', () => {
    expect(notesCss).toMatch(/\.note-editor\{height:100%;max-width:1440px;[^}]*padding:26px 40px 24px;/);
    // the content field takes the height left and scrolls inside; "Phóng to" covers the window
    expect(notesCss).toContain('.note-body{flex:1;min-height:240px;display:flex;flex-direction:column}');
    expect(notesCss).toMatch(/\.note-body\[data-expanded\]\{position:absolute;inset:0;/);
    expect(notesCss).toMatch(/\.input\.notes-text\{flex:1;[^}]*resize:none;overflow-y:auto\}/);
    expect(notesCss).not.toMatch(/\.note-editor \.rte-content\{min-height/);
    expect(notesCss).toContain('.editor-row{display:flex;flex-wrap:wrap;align-items:flex-start;gap:16px}');
    expect(notesCss).toContain('.editor-row>.field-tags{flex:1.4 1 220px}');
    expect(notesCss).toMatch(/\.vis-option\{[^}]*align-items:center;/);
    expect(notesCss).toContain('.vis-option:has(input:focus-visible){outline:2px solid var(--accent);outline-offset:2px}'); // no ring on click
    expect(notesCss).not.toMatch(/\.vis-option:focus-within/);
    expect(notesCss).toContain('.doc-actions .icon-btn[aria-pressed="true"],.doc-actions .icon-btn[data-on]{color:var(--accent)}');
    expect(notesCss).toContain('.field>.vis-option{padding:12px 16px;font-weight:400;color:var(--ink)}'); // beats .field>label{padding:0}
    expect(notesCss).toMatch(/\.vis-icon\{[^}]*color:var\(--ink-3\)\}/);
    expect(notesCss).not.toMatch(/\.vis-icon\{[^}]*background/);
  });
});
