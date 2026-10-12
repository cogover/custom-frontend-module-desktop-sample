import { marked } from 'marked';
import { sanitizeDescription } from '../domain/sanitize';
import { htmlToText } from '../domain/text';
import type { NoteContent } from './types';

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Plain text as HTML: blank lines split paragraphs, single line breaks stay. */
export function plainToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .filter(p => p.trim())
    .map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** GitHub-flavoured Markdown (tables, fenced code, task lists) → HTML; sanitised by the caller. */
export function markdownToHtml(md: string): string {
  return marked.parse(md, { async: false, gfm: true }) as string;
}

/** The content as safe HTML for display (no scripts, handlers, styles, forms or frames). */
export function contentToHtml(c: NoteContent): string {
  if (!c.value) return '';
  const raw = c.format === 3 ? markdownToHtml(c.value) : c.format === 1 ? plainToHtml(c.value) : c.value;
  return sanitizeDescription(raw);
}

/** Single-line plain text of the content (search, "empty" check). */
export function contentText(c: NoteContent): string {
  if (!c.value) return '';
  if (c.format === 1) return c.value.replace(/\s+/g, ' ').trim();
  return htmlToText(c.format === 3 ? markdownToHtml(c.value) : c.value);
}

const BLOCKS = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TR', 'PRE', 'BLOCKQUOTE', 'UL', 'OL', 'TABLE', 'HR']);

/** Rich text → several lines of plain text (format switch in the editor): blocks on their own line, "- " for list items. */
export function htmlToPlain(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let out = '';
  const newline = () => {
    if (out && !out.endsWith('\n')) out += '\n';
  };
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += (node.nodeValue ?? '').replace(/\s+/g, ' ');
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = (node as Element).tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE') return;
    if (tag === 'BR') {
      out += '\n';
      return;
    }
    const block = BLOCKS.has(tag);
    if (block) newline();
    if (tag === 'LI') out += '- ';
    node.childNodes.forEach(walk);
    if (block) newline();
  };
  doc.body.childNodes.forEach(walk);
  return out
    .split('\n')
    .map(l => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The content converted when the editor switches format (rich ↔ Markdown ↔ plain). */
export function convertContent(value: string, from: 1 | 2 | 3, to: 1 | 2 | 3): string {
  if (from === to || !value) return value;
  if (to === 2) return from === 3 ? markdownToHtml(value) : plainToHtml(value);
  return from === 2 ? htmlToPlain(value) : value;
}
