/**
 * Description HTML ⇄ Plate value, without the editor runtime (stays in the main chunk).
 *
 * Saved format = clean semantic HTML that Cogover's own editor understands (CONTRACT §5.3):
 * p, br, strong, em, u, s, code, h1–h3, ul/ol/li (nested), blockquote, a[href] (http/https/mailto,
 * target=_blank rel=noopener noreferrer) and img — no classes, data attributes or styles — except the
 * @mention span, written exactly as Cogover's editor writes it (CONTRACT §5.3f).
 */
import { MENTION_STYLE } from '../domain/mentions';

// ---- node shapes (the subset of Plate's value this editor produces) ----

export const MARKS = ['bold', 'italic', 'underline', 'strikethrough', 'code'] as const;
export type MarkKey = (typeof MARKS)[number];

export interface RteText {
  text: string;
  bold?: true;
  italic?: true;
  underline?: true;
  strikethrough?: true;
  code?: true;
}
export interface RteLink {
  type: 'a';
  url: string;
  target?: string;
  children: RteInline[];
}
export interface RteImage {
  type: 'img';
  url: string;
  alt?: string;
  children: [{ text: '' }];
}
/** An @mention: Cogover notifies `personId` about the record `recordId` (of object type `objectId`). */
export interface RteMention {
  type: 'mention';
  personId: string;
  /** Shown after "@". */
  name: string;
  objectId: string;
  recordId: string;
  redirect: string;
  /** Already notified (the backend wrote `data-mentioned="true"`): kept so saving again does not notify twice. */
  mentioned?: true;
  children: [{ text: '' }];
}
export type RteInline = RteText | RteLink | RteImage | RteMention;
export type TextBlockType = 'p' | 'h1' | 'h2' | 'h3';
export interface RteTextBlock {
  type: TextBlockType;
  children: RteInline[];
}
export interface RteQuote {
  type: 'blockquote';
  children: RteBlock[];
}
export interface RteList {
  type: 'ul' | 'ol';
  children: RteListItem[];
}
export interface RteListItem {
  type: 'li';
  children: (RteListContent | RteList)[];
}
export interface RteListContent {
  type: 'lic';
  children: RteInline[];
}
export type RteBlock = RteTextBlock | RteQuote | RteList;
export type RteValue = RteBlock[];

type AnyNode = { type?: string; text?: string; children?: AnyNode[]; [k: string]: unknown };

export const emptyValue = (): RteValue => [{ type: 'p', children: [{ text: '' }] }];

// ---- URLs ----

/** Links keep http, https and mailto only (CONTRACT §5.3). */
export function isAllowedHref(href: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(href.trim());
}

/** Images: Cogover file paths ("/files/0/…"), http(s) and inline data images; never other schemes. */
export function isAllowedImageSrc(src: string): boolean {
  const s = src.trim();
  if (!s) return false;
  if (/^data:image\//i.test(s)) return true;
  if (/^https?:\/\//i.test(s) || s.startsWith('//')) return true;
  return !/^[a-z][a-z0-9+.-]*:/i.test(s); // relative path, no scheme
}

const escapeText = (s: string) => s.replace(/[&<>]/g, c => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
const escapeAttr = (s: string) => escapeText(s).replace(/"/g, '&quot;');

// ---- HTML → value ----

/**
 * Elements the editor cannot represent: editing would lose them, so the description stays read-only
 * ("Mô tả có định dạng chưa hỗ trợ — hãy sửa trên Cogover") and is never sent back.
 */
const UNSUPPORTED_TAGS = new Set([
  'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'CAPTION', 'COLGROUP', 'COL',
  'IFRAME', 'FRAME', 'FRAMESET', 'VIDEO', 'AUDIO', 'SOURCE', 'TRACK', 'EMBED', 'OBJECT', 'PARAM',
  'CANVAS', 'SVG', 'MATH', 'PICTURE', 'MAP', 'AREA', 'FORM', 'INPUT', 'SELECT', 'TEXTAREA', 'BUTTON',
  'PRE', 'HR', 'H4', 'H5', 'H6', 'SUB', 'SUP', 'DETAILS', 'SUMMARY', 'DL', 'DT', 'DD', 'FIGURE',
  'FIGCAPTION', 'MARK', 'FONT', 'CENTER', 'MARQUEE',
]);

/** Inline styles that change how the text looks (colours, sizes, alignment…). */
const VISIBLE_STYLE = /(^|;)\s*(color|background(-color)?|font(-size|-family)?|text-align|margin-left|padding-left)\s*:/i;

export interface ParsedDescription {
  value: RteValue;
  /** Why the description cannot be edited here (e.g. "TABLE"); null when it can. */
  unsupported: string | null;
}

const looksLikeHtml = (s: string) => /<[a-z!/][\s\S]*>/i.test(s) || /&[a-z#0-9]+;/i.test(s);

const isMentionEl = (el: Element) => el.tagName === 'SPAN' && el.getAttribute('data-autocomplete-type') === 'mention' && !!el.getAttribute('data-id');

function findUnsupported(doc: Document): string | null {
  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    if (UNSUPPORTED_TAGS.has(el.tagName)) return el.tagName;
    if (isMentionEl(el)) continue; // its pill style is Cogover's own, the editor keeps the span as is
    const style = el.getAttribute('style');
    if (style && VISIBLE_STYLE.test(style)) return 'style';
    if (el.tagName === 'A') {
      const href = el.getAttribute('href')?.trim() ?? '';
      if (href && !href.startsWith('#') && !isAllowedHref(href)) return 'link';
    }
    if (el.tagName === 'IMG' && !isAllowedImageSrc(el.getAttribute('src') ?? '')) return 'image';
  }
  return null;
}

/** Never content: dropped with everything inside (the input is parsed inert, nothing runs). */
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'TITLE', 'META', 'LINK', 'HEAD']);

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE',
  'NAV', 'ADDRESS',
  // only reached when pasting (on load they make the description unsupported): kept as plain paragraphs
  'H4', 'H5', 'H6', 'PRE', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'DL', 'DT', 'DD', 'FIGURE', 'FIGCAPTION', 'DETAILS', 'SUMMARY', 'HR',
]);
const MARK_TAGS: Record<string, MarkKey> = {
  STRONG: 'bold', B: 'bold', EM: 'italic', I: 'italic', U: 'underline', INS: 'underline',
  S: 'strikethrough', STRIKE: 'strikethrough', DEL: 'strikethrough', CODE: 'code', KBD: 'code', TT: 'code',
};

/** Marks while walking the DOM: `false` is an explicit "not bold" (font-weight:400 inside <b>…). */
type Marks = Partial<Record<MarkKey, boolean>>;

/** Only the marks that are on, as stored on a text node. */
function onMarks(m: Marks): Partial<Record<MarkKey, true>> {
  const out: Partial<Record<MarkKey, true>> = {};
  for (const k of MARKS) if (m[k]) out[k] = true;
  return out;
}

/** Marks inside `el`: the inherited ones, its tag (<b>, <em>…), then its inline style, which wins. */
function marksIn(el: Element, base: Marks): Marks {
  const mark = MARK_TAGS[el.tagName];
  return { ...base, ...(mark ? { [mark]: true } : {}), ...styleMarks(el) };
}

const BLOCK_SELECTOR = () => Array.from(BLOCK_TAGS, t => t.toLowerCase()).join(',');

/**
 * An inline element wrapping whole blocks — Google Docs puts everything it copies inside
 * <b style="font-weight:normal" id="docs-internal-guid-…">: it is only a wrapper, its blocks are kept.
 */
const wrapsBlocks = (n: Node): n is Element =>
  n.nodeType === Node.ELEMENT_NODE && !BLOCK_TAGS.has((n as Element).tagName) && !SKIP_TAGS.has((n as Element).tagName) && (n as Element).querySelector(BLOCK_SELECTOR()) !== null;

const isBlockEl = (n: Node): n is Element => n.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((n as Element).tagName);

/** Inline content of an element, with HTML whitespace collapsed as a browser renders it. */
function inlineOf(nodes: ArrayLike<Node>, marks: Marks = {}, inLink = false): RteInline[] {
  const out: RteInline[] = [];
  const pushText = (text: string, m: Marks) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && 'text' in last && sameMarks(last, m)) last.text += text;
    else out.push({ text, ...onMarks(m) });
  };
  const visit = (node: Node, m: Marks) => {
    if (node.nodeType === Node.TEXT_NODE) {
      pushText((node.nodeValue ?? '').replace(/[ \t\r\n\f]+/g, ' '), m);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName;
    if (SKIP_TAGS.has(tag)) return;
    if (tag === 'BR') return pushText('\n', m);
    if (tag === 'IMG') {
      const src = el.getAttribute('src') ?? '';
      // kept: http/https, Cogover paths, data: images (when pasting, the editor uploads those to
      // `_attachments` and drops what it cannot upload — CONTRACT §5.3); file:// (Word) never passes
      if (!isAllowedImageSrc(src)) return;
      const alt = el.getAttribute('alt') ?? '';
      out.push({ type: 'img', url: src, ...(alt ? { alt } : {}), children: [{ text: '' }] });
      return;
    }
    // an @mention (never from a paste: it would notify about another record)
    if (!pasting && isMentionEl(el)) {
      out.push({
        type: 'mention',
        personId: el.getAttribute('data-id')!,
        name: (el.textContent ?? '').replace(/\u00a0/g, ' ').trim().replace(/^@/, ''),
        objectId: el.getAttribute('data-parent-object-id') ?? '',
        recordId: el.getAttribute('data-parent-record-id') ?? '',
        redirect: el.getAttribute('data-redirect') ?? '',
        ...(el.getAttribute('data-mentioned') === 'true' ? { mentioned: true as const } : {}),
        children: [{ text: '' }],
      });
      return;
    }
    if (tag === 'A' && !inLink) {
      const href = el.getAttribute('href')?.trim() ?? '';
      const children = inlineOf(el.childNodes, m, true);
      if (href && isAllowedHref(href) && children.some(c => !('text' in c) || c.text)) {
        out.push({ type: 'a', url: href, target: '_blank', children });
      } else {
        for (const c of children) {
          if ('text' in c) pushText(c.text, marksOf(c));
          else out.push(c);
        }
      }
      return;
    }
    if (isMsoListMarker(el)) return; // Word's typed bullet / number ("·", "1.") in front of a list paragraph
    const next = marksIn(el, m);
    el.childNodes.forEach(c => visit(c, next));
    if (tag === 'TD' || tag === 'TH') pushText(' ', m); // pasted table cells: keep words apart
  };
  Array.from(nodes).forEach(n => visit(n, marks));
  return out;
}

/**
 * Formatting written as inline style (pasted from Word/Google Docs, older Cogover content), both ways:
 * Google Docs writes font-weight:400 / font-style:normal / text-decoration:none on every plain run.
 */
function styleMarks(el: Element): Marks {
  const style = (el as HTMLElement).style;
  if (!style) return {};
  const m: Marks = {};
  const weight = style.fontWeight.trim();
  if (/^(bold|bolder|[6-9]00)$/.test(weight)) m.bold = true;
  else if (/^(normal|lighter|[1-5]00)$/.test(weight)) m.bold = false;
  if (/^(italic|oblique)/.test(style.fontStyle)) m.italic = true;
  else if (style.fontStyle === 'normal') m.italic = false;
  const deco = `${style.textDecoration} ${style.textDecorationLine}`.trim();
  if (/underline/.test(deco)) m.underline = true;
  if (/line-through/.test(deco)) m.strikethrough = true;
  if (/^none(\s+none)?$/.test(deco)) {
    m.underline = false;
    m.strikethrough = false;
  }
  return m;
}

// ---- Word (desktop) lists: paragraphs with "mso-list:l0 level2 lfo1" and a typed bullet/number ----

const msoStyle = (el: Element) => el.getAttribute('style') ?? '';

/** The typed bullet or number Word writes before a list paragraph (style "mso-list:Ignore"). */
const isMsoListMarker = (el: Element) => /mso-list\s*:\s*ignore/i.test(msoStyle(el));

/** Nesting level (1, 2…) of a Word list paragraph, or 0 when it is not one. */
function msoListLevel(n: Node): number {
  if (n.nodeType !== Node.ELEMENT_NODE || !isBlockEl(n)) return 0;
  const m = /mso-list\s*:\s*l\d+\s+level(\d+)/i.exec(msoStyle(n));
  return m ? Math.max(1, Number(m[1])) : 0;
}

/** "1." "a)" "(iv)" → numbered list; "·" "o" "§" "-" → bullets. */
function msoListOrdered(p: Element): boolean {
  const marker = Array.from(p.querySelectorAll('*')).find(isMsoListMarker);
  const text = (marker?.textContent ?? '').replace(/[\s\u00a0]+/g, '');
  return /^\(?[0-9a-z]{1,5}[.)]/i.test(text);
}

/** Consecutive Word list paragraphs → real nested lists. */
function msoLists(paras: Element[], base: Marks): RteList[] {
  const roots: RteList[] = [];
  const stack: { level: number; list: RteList }[] = [];
  for (const p of paras) {
    const level = msoListLevel(p);
    const type = msoListOrdered(p) ? 'ol' : 'ul';
    const item: RteListItem = { type: 'li', children: [{ type: 'lic', children: tidyInline(inlineOf(p.childNodes, marksIn(p, base))) }] };
    while (stack.length && stack[stack.length - 1].level > level) stack.pop();
    const top = stack[stack.length - 1];
    if (top && top.level === level && top.list.type === type) {
      top.list.children.push(item);
      continue;
    }
    if (top && top.level === level) stack.pop(); // same level, other kind of list: a new list
    const list: RteList = { type, children: [item] };
    const parent = stack[stack.length - 1];
    const parentItem = parent?.list.children[parent.list.children.length - 1];
    if (parentItem) parentItem.children.push(list);
    else roots.push(list);
    stack.push({ level, list });
  }
  return roots;
}

function marksOf(t: RteText): Marks {
  const m: Marks = {};
  for (const k of MARKS) if (t[k]) m[k] = true;
  return m;
}

function sameMarks(a: RteText, b: Marks): boolean {
  return MARKS.every(k => Boolean(a[k]) === Boolean(b[k]));
}

/** Trims the collapsed spaces at the edges of a block and drops a trailing <br> (browsers don't show it). */
function tidyInline(children: RteInline[]): RteInline[] {
  const list = children.map(c => ('text' in c ? { ...c } : c));
  const first = list[0];
  if (first && 'text' in first) first.text = first.text.replace(/^ +/, '').replace(/\n /g, '\n');
  for (const c of list) if ('text' in c) c.text = c.text.replace(/ \n/g, '\n').replace(/\n /g, '\n');
  const last = list[list.length - 1];
  if (last && 'text' in last) {
    last.text = last.text.replace(/ +$/, '');
    if (last.text.endsWith('\n') && last.text.trim()) last.text = last.text.slice(0, -1);
    else if (last.text === '\n' && list.length > 1) last.text = '';
  }
  const kept = list.filter((c, i) => !('text' in c) || c.text !== '' || list.length === 1 || i === 0);
  if (kept.length === 0 || kept.every(c => 'text' in c && c.text.replace(/\n/g, '') === '')) return [{ text: '' }];
  return kept;
}

/** Blocks from a list of DOM nodes; loose inline content between blocks becomes a paragraph. */
function blocksOf(nodes: ArrayLike<Node>, base: Marks = {}): RteBlock[] {
  const out: RteBlock[] = [];
  let pending: Node[] = [];
  const flush = () => {
    if (!pending.length) return;
    const inline = tidyInline(inlineOf(pending, base));
    const blank = inline.length === 1 && 'text' in inline[0] && inline[0].text === '';
    // whitespace between blocks is not a paragraph; an explicit <br> on its own is a blank line
    if (!blank || pending.some(n => n.nodeName === 'BR')) out.push({ type: 'p', children: inline });
    pending = [];
  };
  const list = Array.from(nodes);
  for (let i = 0; i < list.length; i++) {
    const node = list[i];
    if (msoListLevel(node)) {
      // a run of Word list paragraphs (whitespace between them does not break the run)
      const paras: Element[] = [];
      let j = i;
      for (; j < list.length; j++) {
        const n = list[j];
        if (msoListLevel(n)) paras.push(n as Element);
        else if (!(n.nodeType === Node.TEXT_NODE && !(n.nodeValue ?? '').trim()) && n.nodeType !== Node.COMMENT_NODE) break;
      }
      flush();
      out.push(...msoLists(paras, base));
      i = j - 1;
      continue;
    }
    if (wrapsBlocks(node)) {
      flush();
      out.push(...blocksOf(node.childNodes, marksIn(node, base)));
      continue;
    }
    if (!isBlockEl(node)) {
      pending.push(node);
      continue;
    }
    flush();
    out.push(...blockOf(node, base));
  }
  flush();
  return pasting ? mergeAdjacentLists(out) : out;
}

/**
 * Pasting: lists split into one <ul> per item (Word for the web wraps each item in its own container)
 * become one list again. Not on load, so a saved description keeps its exact structure.
 */
function mergeAdjacentLists(blocks: RteBlock[]): RteBlock[] {
  const out: RteBlock[] = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (last && (b.type === 'ul' || b.type === 'ol') && last.type === b.type) last.children.push(...b.children);
    else out.push(b);
  }
  return out;
}

/** Word's title / subtitle paragraph styles read as headings. */
const MSO_HEADING: Record<string, TextBlockType> = { MsoTitle: 'h1', MsoSubtitle: 'h2' };

function blockOf(el: Element, base: Marks = {}): RteBlock[] {
  const m = { ...base, ...styleMarks(el) };
  switch (el.tagName) {
    case 'H1':
    case 'H2':
    case 'H3':
      return [{ type: el.tagName.toLowerCase() as TextBlockType, children: tidyInline(inlineOf(el.childNodes, m)) }];
    case 'P': {
      const heading = MSO_HEADING[el.getAttribute('class') ?? ''];
      return [{ type: heading ?? 'p', children: tidyInline(inlineOf(el.childNodes, m)) }];
    }
    case 'BLOCKQUOTE': {
      const inner = blocksOf(el.childNodes, m);
      return [{ type: 'blockquote', children: inner.length ? inner : emptyValue() }];
    }
    case 'UL':
    case 'OL':
      return [listOf(el, m)];
    case 'LI':
      return [{ type: 'ul', children: [itemOf(el, base)] }]; // stray <li>
    case 'HR':
      return [];
    default: // DIV, SECTION…: a container when it holds blocks, otherwise a paragraph
      return Array.from(el.childNodes).some(n => isBlockEl(n) || wrapsBlocks(n))
        ? blocksOf(el.childNodes, m)
        : [{ type: 'p', children: tidyInline(inlineOf(el.childNodes, m)) }];
  }
}

function listOf(el: Element, base: Marks = {}): RteList {
  const items: RteListItem[] = [];
  let loose: Node[] = [];
  const flushLoose = () => {
    const inline = tidyInline(inlineOf(loose, base));
    if (loose.length && !(inline.length === 1 && 'text' in inline[0] && inline[0].text === '')) {
      items.push({ type: 'li', children: [{ type: 'lic', children: inline }] });
    }
    loose = [];
  };
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE && (child as Element).tagName === 'LI') {
      flushLoose();
      items.push(itemOf(child as Element, base));
    } else if (child.nodeType === Node.ELEMENT_NODE && /^(UL|OL)$/.test((child as Element).tagName)) {
      flushLoose();
      // a list directly inside a list belongs to the previous item
      const nested = listOf(child as Element, base);
      const prev = items[items.length - 1];
      if (prev) prev.children.push(nested);
      else items.push({ type: 'li', children: [{ type: 'lic', children: [{ text: '' }] }, nested] });
    } else loose.push(child);
  }
  flushLoose();
  if (!items.length) items.push({ type: 'li', children: [{ type: 'lic', children: [{ text: '' }] }] });
  return { type: el.tagName === 'OL' ? 'ol' : 'ul', children: items };
}

function itemOf(li: Element, base: Marks = {}): RteListItem {
  const m = { ...base, ...styleMarks(li) };
  const lists: RteList[] = [];
  const content: Node[] = [];
  for (const child of Array.from(li.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE && /^(UL|OL)$/.test((child as Element).tagName)) lists.push(listOf(child as Element, m));
    else content.push(child);
  }
  // <li><p>a</p><p>b</p></li> → "a" line break "b" (a list item holds one text block)
  const parts: RteInline[] = [];
  let lineOpen = false;
  for (const node of content) {
    if (isBlockEl(node)) {
      const inline = tidyInline(inlineOf(node.childNodes, { ...m, ...styleMarks(node) }));
      if (lineOpen) parts.push({ text: '\n' });
      parts.push(...inline);
      lineOpen = true;
    } else {
      const inline = inlineOf([node], m);
      if (inline.length) {
        parts.push(...inline);
        lineOpen = true;
      }
    }
  }
  return { type: 'li', children: [{ type: 'lic', children: tidyInline(mergeTexts(parts)) }, ...lists] };
}

function mergeTexts(list: RteInline[]): RteInline[] {
  const out: RteInline[] = [];
  for (const c of list) {
    const last = out[out.length - 1];
    if ('text' in c && last && 'text' in last && sameMarks(last, marksOf(c))) last.text += c.text;
    else out.push('text' in c ? { ...c } : c);
  }
  return out;
}

/**
 * Description HTML (from Cogover) → editor value. Scripts and styles are dropped, attributes other than
 * href/src/alt are ignored; elements the editor cannot keep mark the description `unsupported`.
 */
/** Converting pasted HTML (Word, Google Docs, web pages) rather than a saved description. */
let pasting = false;

export function htmlToValue(html: string, { paste = false }: { paste?: boolean } = {}): ParsedDescription {
  pasting = paste;
  try {
    return parseDescription(html);
  } finally {
    pasting = false;
  }
}

function parseDescription(html: string): ParsedDescription {
  if (!html || !html.trim()) return { value: emptyValue(), unsupported: null };
  if (!looksLikeHtml(html)) {
    // legacy plain text: one paragraph per line
    const lines = html.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
    return { value: lines.map(line => ({ type: 'p', children: [{ text: line }] })), unsupported: null };
  }
  // DOMParser builds an inert document (no scripts run, no images load); only text, href, src and alt
  // are read from it and everything is escaped again on the way out
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const unsupported = findUnsupported(doc);
  const value = blocksOf(doc.body.childNodes);
  return { value: value.length ? value : emptyValue(), unsupported };
}

// ---- value → HTML ----

const MARK_HTML: [MarkKey, string][] = [
  ['bold', 'strong'],
  ['italic', 'em'],
  ['underline', 'u'],
  ['strikethrough', 's'],
  ['code', 'code'],
];

function textHtml(t: AnyNode): string {
  let html = escapeText(String(t.text ?? '')).replace(/\n/g, '<br>');
  if (!html) return '';
  for (let i = MARK_HTML.length - 1; i >= 0; i--) {
    const [mark, tag] = MARK_HTML[i];
    if (t[mark]) html = `<${tag}>${html}</${tag}>`;
  }
  return html;
}

function inlineHtml(nodes: AnyNode[] | undefined): string {
  return (nodes ?? [])
    .map(n => {
      if (typeof n.text === 'string' && !n.type) return textHtml(n);
      if (n.type === 'a') {
        const inner = inlineHtml(n.children);
        const url = String(n.url ?? '').trim();
        return url && isAllowedHref(url) ? `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${inner}</a>` : inner;
      }
      if (n.type === 'img') {
        const url = String(n.url ?? '').trim();
        if (!isAllowedImageSrc(url)) return '';
        const alt = typeof n.alt === 'string' && n.alt ? ` alt="${escapeAttr(n.alt)}"` : '';
        return `<img src="${escapeAttr(url)}"${alt}>`;
      }
      if (n.type === 'mention') return mentionHtml(n);
      return inlineHtml(n.children); // unknown inline: keep its text
    })
    .join('');
}

/** The span Cogover's editor writes for "@Name" (the backend notifies that person and adds data-mentioned). */
function mentionHtml(n: AnyNode): string {
  const name = escapeText(String(n.name ?? ''));
  const personId = String(n.personId ?? '').trim();
  if (!personId) return name ? `@${name}` : '';
  const attrs = [
    'contenteditable="false"',
    'data-autocomplete-type="mention"',
    `data-id="${escapeAttr(personId)}"`,
    `data-parent-object-id="${escapeAttr(String(n.objectId ?? ''))}"`,
    `data-parent-record-id="${escapeAttr(String(n.recordId ?? ''))}"`,
    `data-redirect="${escapeAttr(String(n.redirect ?? ''))}"`,
    'data-type="autocomplete"',
    `style="${MENTION_STYLE}"`,
    ...(n.mentioned ? ['data-mentioned="true"'] : []),
  ];
  return `<span ${attrs.join(' ')}>@${name}</span>`;
}

/** "<br>" keeps an empty block visible (as Cogover's editor writes blank lines). */
const filled = (html: string) => html || '<br>';

const isElementBlock = (n: AnyNode) => typeof n.type === 'string' && n.type !== 'a' && n.type !== 'img' && n.type !== 'mention';

function blockHtml(n: AnyNode): string {
  switch (n.type) {
    case 'h1':
    case 'h2':
    case 'h3':
      return `<${n.type}>${filled(inlineHtml(n.children))}</${n.type}>`;
    case 'blockquote':
      return `<blockquote>${blocksHtml(n.children)}</blockquote>`;
    case 'ul':
    case 'ol':
      return `<${n.type}>${(n.children ?? []).map(itemHtml).join('')}</${n.type}>`;
    case 'li':
      return `<ul>${itemHtml(n)}</ul>`;
    default:
      // p, lic, or an unknown container (its blocks are kept, the wrapper is not)
      if (n.type !== 'p' && n.type !== 'lic' && (n.children ?? []).some(isElementBlock)) return blocksHtml(n.children);
      return `<p>${filled(inlineHtml(n.children))}</p>`;
  }
}

function itemHtml(li: AnyNode): string {
  const parts = (li.children ?? []).map(c => (c.type === 'ul' || c.type === 'ol' ? blockHtml(c) : c.type === 'lic' ? inlineHtml(c.children) : blockHtml(c)));
  return `<li>${parts.join('')}</li>`;
}

function blocksHtml(nodes: AnyNode[] | undefined): string {
  return (nodes ?? []).map(blockHtml).join('');
}

const isBlankParagraph = (n: AnyNode) =>
  n.type === 'p' && (n.children ?? []).every(c => typeof c.text === 'string' && !c.type && !c.text.replace(/\n/g, '').trim());

/** Editor value → clean HTML; '' for an empty description. Blank paragraphs at the start/end are dropped. */
export function valueToHtml(value: readonly unknown[]): string {
  const nodes = [...(value as AnyNode[])];
  while (nodes.length && isBlankParagraph(nodes[0])) nodes.shift();
  while (nodes.length && isBlankParagraph(nodes[nodes.length - 1])) nodes.pop();
  return blocksHtml(nodes);
}
