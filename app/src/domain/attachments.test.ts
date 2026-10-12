import { describe, expect, it } from 'vitest';
import {
  MAX_FILE_BYTES,
  attachmentFromUpload,
  attachmentHref,
  attachmentsField,
  extOf,
  fileKind,
  fileProblem,
  uploadProblem,
  MAX_FILES_PER_TASK,
  formatBytes,
  parseAttachments,
  sameAttachments,
} from './attachments';

const meta = (id: string, name = `${id}.pdf`, size = 1000) => ({
  fileName: name,
  fileSize: size,
  file_id: id,
  acl: 'private',
  fileExt: name.split('.').pop(),
  fileType: 'application/pdf',
  resolutionSizes: [],
  fileServerUrlTemplate: `/files/{file_id}/{resolution_size}/${name}`,
  url: `https://acme.cogover.example/files/0/{file_id}/{resolution_size}/${name}`,
});

describe('attachment_files parsing', () => {
  it('reads objects and JSON strings, keeping the metadata verbatim', () => {
    const list = parseAttachments([JSON.stringify(meta('F1', 'Báo cáo Q3.pdf', 2048)), meta('F2', 'so-lieu.XLSX')]);
    expect(list.map(a => [a.fileId, a.fileName, a.fileSize, a.fileExt])).toEqual([
      ['F1', 'Báo cáo Q3.pdf', 2048, 'pdf'],
      ['F2', 'so-lieu.XLSX', 1000, 'xlsx'],
    ]);
    expect(list[0].meta).toEqual(meta('F1', 'Báo cáo Q3.pdf', 2048));
    expect(list[1].meta).toEqual(meta('F2', 'so-lieu.XLSX'));
  });

  it('accepts a JSON string of the list or a single object; skips broken, id-less and repeated items', () => {
    expect(parseAttachments(JSON.stringify([meta('F1')])).map(a => a.fileId)).toEqual(['F1']);
    expect(parseAttachments(meta('F9')).map(a => a.fileId)).toEqual(['F9']);
    expect(parseAttachments(['{oops', { fileName: 'x' }, 42, null, meta('F1'), JSON.stringify(meta('F1'))]).map(a => a.fileId)).toEqual(['F1']);
    expect(parseAttachments(null)).toEqual([]);
    expect(parseAttachments(undefined)).toEqual([]);
    expect(parseAttachments('not json')).toEqual([]);
    expect(parseAttachments([{ file_id: 'F3' }])[0]).toMatchObject({ fileId: 'F3', fileName: 'F3', fileSize: 0, fileExt: '' });
  });

  it('turns an upload response into an attachment, or refuses one without a file id', () => {
    expect(attachmentFromUpload(meta('F5', 'a.png')).fileId).toBe('F5');
    expect(() => attachmentFromUpload({ fileName: 'a.png' })).toThrow('Máy chủ không trả về thông tin file vừa tải lên.');
  });
});

describe('attachment_files payload', () => {
  const [a, b, c] = parseAttachments([meta('A'), meta('B'), meta('C')]);

  it('sends nothing when the list did not change', () => {
    expect(attachmentsField([a, b], [a, b])).toBeUndefined();
    expect(attachmentsField([], [])).toBeUndefined();
    expect(sameAttachments([a, b], [a, b])).toBe(true);
  });

  it('sends the whole list (kept + new) as the original metadata', () => {
    expect(attachmentsField([a, b], [b, c])).toEqual([meta('B'), meta('C')]);
    expect(attachmentsField([], [a])).toEqual([meta('A')]);
    expect(sameAttachments([a, b], [b, a])).toBe(false);
  });

  it('sends null when every file was removed ([] is refused by the Workspace)', () => {
    expect(attachmentsField([a, b], [])).toBeNull();
  });
});

describe('attachment helpers', () => {
  it('links to the same-origin original file itself (?redirect=true), names encoded', () => {
    expect(attachmentHref({ fileId: 'F1', fileName: 'Báo cáo #3?.pdf' })).toBe('/files/F1/original/B%C3%A1o%20c%C3%A1o%20%233%3F.pdf?redirect=true');
    expect(attachmentHref({ fileId: 'F/2', fileName: 'a&b.png' })).toBe('/files/F%2F2/original/a%26b.png?redirect=true');
  });

  it('formats sizes the Vietnamese way', () => {
    expect(formatBytes(0)).toBe('');
    expect(formatBytes(820)).toBe('820 B');
    expect(formatBytes(12 * 1024 + 300)).toBe('12 KB');
    expect(formatBytes(1.54 * 1024 * 1024)).toBe('1,5 MB');
    expect(formatBytes(12.4 * 1024 * 1024)).toBe('12 MB');
  });

  it('knows the kind of a file from its extension, then its MIME type', () => {
    expect(fileKind('a.PNG')).toBe('image');
    expect(fileKind('a.pdf')).toBe('pdf');
    expect(fileKind('a.xlsx')).toBe('sheet');
    expect(fileKind('a.docx')).toBe('doc');
    expect(fileKind('a.pptx')).toBe('slide');
    expect(fileKind('a.zip')).toBe('archive');
    expect(fileKind('a.mp4')).toBe('video');
    expect(fileKind('a.mp3')).toBe('audio');
    expect(fileKind('a.txt')).toBe('text');
    expect(fileKind('scan', 'image/jpeg')).toBe('image');
    expect(fileKind('clip', 'video/webm')).toBe('video');
    expect(fileKind('voice', 'audio/ogg')).toBe('audio');
    expect(fileKind('doc', 'application/pdf')).toBe('pdf');
    expect(fileKind('note', 'text/plain')).toBe('text');
    expect(fileKind('blob', 'application/octet-stream')).toBe('other');
    expect(extOf('archive.tar.gz')).toBe('gz');
    expect(extOf('no-extension')).toBe('');
  });

  it('refuses files over 20 MB and empty files before uploading', () => {
    expect(fileProblem({ size: MAX_FILE_BYTES })).toBeNull();
    expect(fileProblem({ size: MAX_FILE_BYTES + 1 })).toBe('File lớn hơn 50 MB');
    expect(fileProblem({ size: 0 })).toBe('File rỗng');
  });
});

describe('upload failures in Vietnamese', () => {
  it('names the refused extension, keeps other server messages, and matches the field limits', () => {
    expect(uploadProblem('file type not allowed', 'Ảnh chụp.PNG')).toBe('Không nhận loại file .png');
    expect(uploadProblem('File type not allowed', 'khong-duoi')).toBe('Không nhận loại file này');
    expect(uploadProblem('Maximum upload size exceeded', 'lon.mp4')).toBe('File lớn hơn 50 MB');
    expect(uploadProblem('Không kết nối được máy chủ.', 'a.pdf')).toBe('Không kết nối được máy chủ.');
    expect(MAX_FILE_BYTES).toBe(52_428_800); // field max_size
    expect(MAX_FILES_PER_TASK).toBe(10); // field multiple_limit.max
  });
});
