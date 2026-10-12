/** Lower-case and strip Vietnamese diacritics so "hoa" finds "Hoa". */
export function fold(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TR', 'TABLE', 'BLOCKQUOTE', 'PRE',
  'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'FIGURE', 'FIGCAPTION', 'HR', 'DL', 'DT', 'DD',
]);
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'HEAD', 'TITLE']);

/** Parses HTML into an inert document (no scripts run, nothing loads). */
function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

const looksLikeHtml = (s: string) => /<[a-z!/][\s\S]*>/i.test(s) || /&[a-z#0-9]+;/i.test(s);

/** Text with one "\n" between blocks / at <br>, collapsing HTML whitespace like a browser would. */
function blockText(html: string): string {
  if (!looksLikeHtml(html)) return html.replace(/\r\n?/g, '\n');
  const doc = parse(html);
  let out = '';
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      let text = (node.nodeValue ?? '').replace(/[ \t\r\n\f]+/g, ' ');
      if (out === '' || out.endsWith('\n') || out.endsWith(' ')) text = text.replace(/^ /, '');
      out += text;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = (node as Element).tagName;
    if (SKIP_TAGS.has(tag)) return;
    if (tag === 'BR') {
      out = out.replace(/ $/, '') + '\n';
      return;
    }
    if (tag === 'IMG') return;
    const block = BLOCK_TAGS.has(tag);
    if (block && out && !out.endsWith('\n')) out = out.replace(/ $/, '') + '\n';
    node.childNodes.forEach(visit);
    if (block && !out.endsWith('\n')) out = out.replace(/ $/, '') + '\n';
    if ((tag === 'TD' || tag === 'TH') && !out.endsWith('\n') && !out.endsWith(' ')) out += ' ';
  };
  doc.body.childNodes.forEach(visit);
  return out;
}

/** Single-line plain text (cards, search). */
export function htmlToText(html: string): string {
  if (!html) return '';
  return blockText(html).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}
