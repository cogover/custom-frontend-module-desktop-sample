/**
 * File attachments (field `attachment_files`, CONTRACT §4 "File đính kèm").
 * The FILE_METADATA object returned by the upload is kept verbatim: it is what the record stores.
 */

/**
 * Client-side limits, matching field `attachment_files` (CONTRACT §4: `max_size` 50 MB, `multiple_limit.max` 10 files
 * per task — the server refuses an 11th with r: 608) plus at most 3 uploads at once.
 */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_FILES_PER_TASK = 10;
export const UPLOAD_CONCURRENCY = 3;

export interface Attachment {
  fileId: string;
  fileName: string;
  /** bytes; 0 when unknown */
  fileSize: number;
  fileExt: string;
  fileType: string;
  /** FILE_METADATA as Cogover returned it — written back as is. */
  meta: Record<string, unknown>;
}

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

function parseOne(item: unknown): Attachment | null {
  let v = item;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const meta = v as Record<string, unknown>;
  const fileId = str(meta.file_id ?? meta.fileId).trim();
  if (!fileId) return null;
  const fileName = str(meta.fileName ?? meta.file_name ?? meta.name).trim() || fileId;
  const size = Number(meta.fileSize ?? meta.file_size ?? 0);
  return {
    fileId,
    fileName,
    fileSize: Number.isFinite(size) && size > 0 ? size : 0,
    fileExt: str(meta.fileExt ?? '').replace(/^\./, '').toLowerCase() || extOf(fileName),
    fileType: str(meta.fileType ?? ''),
    meta,
  };
}

/** `attachment_files` as read from the API: array of objects or JSON strings (or a JSON string of one); bad items are skipped. */
export function parseAttachments(value: unknown): Attachment[] {
  let v = value;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  const list = Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : [];
  const seen = new Set<string>();
  const out: Attachment[] = [];
  for (const item of list) {
    const a = parseOne(item);
    if (a && !seen.has(a.fileId)) {
      seen.add(a.fileId);
      out.push(a);
    }
  }
  return out;
}

/** Upload response → attachment (throws when it has no file id). */
export function attachmentFromUpload(data: unknown): Attachment {
  const a = parseOne(data);
  if (!a) throw new Error('Máy chủ không trả về thông tin file vừa tải lên.');
  return a;
}

export const sameAttachments = (a: readonly Attachment[], b: readonly Attachment[]) =>
  a.length === b.length && a.every((x, i) => x.fileId === b[i].fileId);

/**
 * Value to write for `attachment_files`: undefined = unchanged (do not send), null = all removed
 * (`[]` is rejected with r: 607), otherwise the whole list (kept + new) as metadata objects.
 */
export function attachmentsField(before: readonly Attachment[], after: readonly Attachment[]): Record<string, unknown>[] | null | undefined {
  if (sameAttachments(before, after)) return undefined;
  return after.length ? after.map(a => a.meta) : null;
}

/**
 * Same-origin download link (session cookie). `?redirect=true` makes the file server answer with the file
 * itself; without it the answer is only a JSON `{"url": …}` pointing at a signed copy (CONTRACT §4).
 */
export const attachmentHref = (a: Pick<Attachment, 'fileId' | 'fileName'>) =>
  `/files/${encodeURIComponent(a.fileId)}/original/${encodeURIComponent(a.fileName)}?redirect=true`;

export function extOf(name: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : '';
}

/** "820 B", "12 KB", "1,5 MB" (Vietnamese decimal comma). */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${(mb < 10 ? Math.round(mb * 10) / 10 : Math.round(mb)).toString().replace('.', ',')} MB`;
}

export type FileKind = 'image' | 'pdf' | 'sheet' | 'doc' | 'slide' | 'archive' | 'video' | 'audio' | 'text' | 'other';

const KIND_BY_EXT: Record<string, FileKind> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', bmp: 'image', heic: 'image',
  pdf: 'pdf',
  xls: 'sheet', xlsx: 'sheet', csv: 'sheet', ods: 'sheet',
  doc: 'doc', docx: 'doc', odt: 'doc', rtf: 'doc',
  ppt: 'slide', pptx: 'slide', odp: 'slide', key: 'slide',
  zip: 'archive', rar: 'archive', '7z': 'archive', gz: 'archive', tar: 'archive',
  mp4: 'video', mov: 'video', avi: 'video', mkv: 'video', webm: 'video',
  mp3: 'audio', wav: 'audio', m4a: 'audio', ogg: 'audio',
  txt: 'text', md: 'text', json: 'text', xml: 'text', log: 'text',
};

export function fileKind(name: string, mime = ''): FileKind {
  const byExt = KIND_BY_EXT[extOf(name)];
  if (byExt) return byExt;
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('text/')) return 'text';
  return 'other';
}

/** Why a picked file is refused before uploading; null when it may go. */
export function fileProblem(file: { size: number }): string | null {
  if (file.size > MAX_FILE_BYTES) return `File lớn hơn ${MAX_FILE_BYTES / 1024 / 1024} MB`;
  if (file.size === 0) return 'File rỗng';
  return null;
}

/**
 * Upload failure → what to tell the user. The file server answers in English (r: 15 "file type not allowed" when the
 * extension is not in the field's `file_type` list); known answers are put in Vietnamese, others are kept as sent.
 */
export function uploadProblem(message: string, fileName: string): string {
  const ext = extOf(fileName);
  if (/file type not allowed/i.test(message)) return ext ? `Không nhận loại file .${ext}` : 'Không nhận loại file này';
  if (/size|too large|exceed/i.test(message)) return `File lớn hơn ${MAX_FILE_BYTES / 1024 / 1024} MB`;
  return message;
}
