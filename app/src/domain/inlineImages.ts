/**
 * Pictures inside the description (CONTRACT §5.3), done like Cogover's own editor (CKEditor + uploadimage):
 * a pasted picture is uploaded to the system file field `_attachments` (field id + object id), shown through
 * `/files/0/<id>/original/<name>?redirect=true&long_text_field_id=<description field id>`, and its FILE_METADATA
 * — `url` carrying the same `long_text_field_id` — is written to `_attachments` together with the description.
 * Pictures linked from the web (http/https) stay links, as in Cogover's editor.
 */
import { DESCRIPTION_FIELD_ID } from '../config';

export interface InlineImage {
  /** What the <img> points to. */
  src: string;
  fileId: string;
  /** FILE_METADATA for `_attachments` (url with long_text_field_id). */
  meta: Record<string, unknown>;
}

/** Image types the `_attachments` field takes; others (webp…) are converted to PNG before uploading. */
export const INLINE_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'tiff', 'tif'] as const;
const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/bmp': 'bmp',
  'image/svg+xml': 'svg', 'image/tiff': 'tiff', 'image/webp': 'webp', 'image/avif': 'avif',
};

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

function withField(url: URL, fieldId: string): URL {
  url.searchParams.set('long_text_field_id', fieldId);
  return url;
}

/**
 * Upload response → the <img> src and the `_attachments` entry (throws without a file id). `fieldId` is the
 * long-text field the picture belongs to (task `description` by default, a note's `content`).
 */
export function inlineImageFromUpload(data: unknown, origin: string, fieldId: string = DESCRIPTION_FIELD_ID): InlineImage {
  const meta = data && typeof data === 'object' && !Array.isArray(data) ? { ...(data as Record<string, unknown>) } : null;
  const fileId = str(meta?.file_id).trim();
  if (!meta || !fileId) throw new Error('Máy chủ không trả về thông tin ảnh vừa tải lên.');
  const name = str(meta.fileName).trim() || 'anh.png';
  const template = str(meta.url).trim() || `/files/${meta.acl === 'private' ? '' : '0/'}{file_id}/{resolution_size}/${encodeURIComponent(name)}?redirect=true`;
  const base = template.replace('{file_id}', encodeURIComponent(fileId));
  const stored = withField(new URL(base, origin), fieldId); // "{resolution_size}" stays a placeholder (as %7B…%7D)
  const src = withField(new URL(base.replace(/\{resolution_size\}|%7Bresolution_size%7D/i, 'original'), origin), fieldId);
  return { src: src.href, fileId, meta: { ...meta, url: stored.href } };
}

const decodeAmp = (s: string) => s.replace(/&amp;/g, '&');

/** The uploaded pictures still shown in `html` (the user may have deleted some before saving). */
export function inlineImagesIn(html: string, images: readonly InlineImage[]): InlineImage[] {
  const text = decodeAmp(html);
  const seen = new Set<string>();
  return images.filter(i => text.includes(i.src) && !seen.has(i.fileId) && seen.add(i.fileId));
}

/** `_attachments` after adding pictures: the task's own entries first, no file twice. */
export function mergeInlineMetas(existing: readonly Record<string, unknown>[], added: readonly InlineImage[]): Record<string, unknown>[] {
  const out = [...existing];
  const ids = new Set(existing.map(m => str(m.file_id)));
  for (const img of added) {
    if (ids.has(img.fileId)) continue;
    ids.add(img.fileId);
    out.push(img.meta);
  }
  return out;
}

/** `_attachments` as read from the API: array of objects or JSON strings; bad items skipped. */
export function parseInlineMetas(value: unknown): Record<string, unknown>[] {
  let v = value;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  const list = Array.isArray(v) ? v : [];
  const out: Record<string, unknown>[] = [];
  for (let item of list) {
    if (typeof item === 'string') {
      try {
        item = JSON.parse(item);
      } catch {
        continue;
      }
    }
    if (item && typeof item === 'object' && !Array.isArray(item) && str((item as Record<string, unknown>).file_id)) out.push(item as Record<string, unknown>);
  }
  return out;
}

export const extForType = (type: string) => EXT_BY_TYPE[type.toLowerCase()] ?? '';

/** A data: image URL → a File to upload; null when it is not an image or cannot be decoded. */
export function dataUrlToFile(url: string, base = 'anh-mo-ta'): File | null {
  const m = /^data:(image\/[a-z0-9.+-]+)((?:;(?!base64[;,])[^;,]*)*)(;base64)?,(.*)$/is.exec(url.trim());
  if (!m) return null;
  const type = m[1].toLowerCase();
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    if (m[3]) {
      const bin = atob(m[4].replace(/\s+/g, ''));
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else bytes = new Uint8Array(new TextEncoder().encode(decodeURIComponent(m[4])));
  } catch {
    return null;
  }
  if (!bytes.length) return null;
  return new File([bytes], `${base}.${extForType(type) || 'png'}`, { type });
}

function hexToDataUrl(hex: string, type: string): string {
  let bin = '';
  for (let i = 0; i + 1 < hex.length; i += 2) bin += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return `data:${type};base64,${btoa(bin)}`;
}

/** End (index of the closing brace) of the RTF group that opens at `start`; escaped braces are skipped. */
function groupEnd(rtf: string, start: number): number {
  let depth = 0;
  for (let i = start; i < rtf.length; i++) {
    if (rtf[i] === '\\') i++;
    else if (rtf[i] === '{') depth++;
    else if (rtf[i] === '}' && --depth === 0) return i;
  }
  return rtf.length;
}

/**
 * Groups whose pictures are not in the pasted HTML: Word's \nonshppict / \shprslt fallbacks (a WMF copy of
 * every picture — Word gives them a \bliptag too) and headers/footers. Removed before counting, as
 * Cogover's editor (CKEditor pastetools) does.
 */
const SKIPPED_GROUP = /\{\\(?:\*\\)?(?:nonshppict|shprslt|header[lrf]?|footer[lrf]?)\b/g;

function withoutSkippedGroups(rtf: string): string {
  let out = '';
  let from = 0;
  SKIPPED_GROUP.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SKIPPED_GROUP.exec(rtf))) {
    if (m.index < from) continue; // inside a group already removed
    out += rtf.slice(from, m.index);
    from = groupEnd(rtf, m.index) + 1;
    SKIPPED_GROUP.lastIndex = from;
  }
  return out + rtf.slice(from);
}

/**
 * Pictures Word puts in the clipboard RTF, in document order (one per <img> of the pasted HTML): a data:
 * URL for PNG/JPEG, null for kinds a browser cannot show (EMF/WMF).
 */
export function rtfImages(rtf: string): (string | null)[] {
  const out: (string | null)[] = [];
  const text = withoutSkippedGroups(rtf);
  const re = /\{\\pict\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    // the whole {\pict …} group: Word nests {\*\picprop{\sp{\sn …}{\sv …}}} inside it
    const end = groupEnd(text, m.index);
    let body = text.slice(m.index + 1, end);
    re.lastIndex = end;
    while (/\{[^{}]*\}/.test(body)) body = body.replace(/\{[^{}]*\}/g, ' '); // drop nested groups
    const type = /\\pngblip\b/.test(body) ? 'image/png' : /\\jpegblip\b/.test(body) ? 'image/jpeg' : '';
    const hex = body.replace(/\\[a-z]+-?\d* ?/gi, ' ').replace(/[^0-9a-f]/gi, '');
    out.push(type && hex.length >= 16 && hex.length % 2 === 0 ? hexToDataUrl(hex, type) : null);
  }
  return out;
}

/**
 * Word (desktop) pastes pictures as <img src="file:///…/clip_image001.png">, which a web page cannot read;
 * the same pictures are in the clipboard RTF. When the counts match they are swapped in, in order.
 * Pictures that cannot be recovered are left as file:// and dropped by the HTML converter.
 */
export function replaceWordImages(html: string, rtf: string): string {
  if (!rtf || !/<img[^>]+src\s*=\s*["']?file:/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const imgs = Array.from(doc.querySelectorAll('img')).filter(i => /^file:/i.test(i.getAttribute('src') ?? ''));
  const pictures = rtfImages(rtf);
  if (!imgs.length || imgs.length !== pictures.length) return html;
  imgs.forEach((img, i) => {
    const url = pictures[i];
    if (url) img.setAttribute('src', url);
  });
  return doc.documentElement.outerHTML;
}

/**
 * The file to upload for a picture: types `_attachments` refuses (webp, avif…) are redrawn as PNG when the
 * browser can decode them; otherwise the file goes as is (and the server explains).
 */
export async function uploadableImage(file: File): Promise<File> {
  const ext = extForType(file.type) || (/\.([a-z0-9]+)$/i.exec(file.name)?.[1] ?? '').toLowerCase();
  if ((INLINE_IMAGE_EXTS as readonly string[]).includes(ext)) return file;
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    return blob ? new File([blob], file.name.replace(/\.[a-z0-9]+$/i, '') + '.png', { type: 'image/png' }) : file;
  } catch {
    return file;
  }
}
