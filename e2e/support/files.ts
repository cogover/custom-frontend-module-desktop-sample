import fs from 'node:fs';
import zlib from 'node:zlib';
import type { Locator, Page, TestInfo } from '@playwright/test';

/**
 * Tạo file thử nghiệm cho các ca đính kèm (CONTRACT mục 4 "File đính kèm", AC21).
 * Không đọc source app — chỉ sinh dữ liệu đầu vào.
 */

/** Giới hạn phía client theo contract: 50 MB/file (khớp `max_size` của field). */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
/** Tối đa 10 file mỗi công việc (gồm file đã có + đang tải, không tính file lỗi). */
export const MAX_FILES_PER_TASK = 10;

/** Ghi chú khi vượt giới hạn 10 file mỗi công việc. */
export const tooManyNote = (skipped: number) => `Mỗi công việc đính kèm tối đa 10 file — đã bỏ qua ${skipped} file.`;
/** form-error khi bấm Lưu/Tạo mà còn file lỗi. */
export const pendingErrorsMsg = (n: number) => `Còn ${n} file chưa tải lên được. Bỏ file lỗi (bấm ×) rồi lưu lại.`;
/** Lý do tiếng Việt cho file bị server từ chối loại (`r: 15`). */
export const typeNotAllowed = (ext: string) => `Không nhận loại file .${ext}`;
export const TOO_LARGE_REASON = 'File lớn hơn 50 MB';

export type InputFile = { name: string; mimeType: string; buffer: Buffer };

function pngChunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

/** PNG RGB 8-bit hợp lệ w×h (màu theo toạ độ + seed để mỗi lần chạy có nội dung khác). */
export function makePng(w = 8, h = 8, seed = 0): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = w * 3 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0; // filter None
    for (let x = 0; x < w; x++) {
      const i = y * stride + 1 + x * 3;
      raw[i] = (x * 32 + seed) & 255;
      raw[i + 1] = (y * 32 + seed * 7) & 255;
      raw[i + 2] = ((x + y) * 16 + seed * 13) & 255;
    }
  }
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** PDF 1 trang hợp lệ (xref đúng offset) chứa một dòng chữ ASCII. */
export function makePdf(text: string): Buffer {
  const ascii = text.replace(/[^\x20-\x7e]/g, '?').replace(/[\\()]/g, (c) => `\\${c}`);
  const stream = `BT /F1 18 Tf 72 720 Td (${ascii}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** JPEG thật do canvas của trình duyệt mã hoá (luôn hợp lệ). */
export async function makeJpeg(page: Page, w = 16, h = 16, seed = 0): Promise<Buffer> {
  const b64 = await page.evaluate(
    async ({ w, h, seed }) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      if (!g) throw new Error('Không có canvas 2d');
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          g.fillStyle = `rgb(${(x * 16 + seed) & 255}, ${(y * 16 + seed * 3) & 255}, ${((x + y) * 8) & 255})`;
          g.fillRect(x, y, 1, 1);
        }
      const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob trả null'))), 'image/jpeg', 0.92));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (const x of bytes) s += String.fromCharCode(x);
      return btoa(s);
    },
    { w, h, seed },
  );
  const buf = Buffer.from(b64, 'base64');
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('Canvas không tạo được JPEG');
  return buf;
}

/**
 * File thưa (sparse) đúng `size` byte trong thư mục output của test — dùng cho file > 50 MB
 * (Playwright không nhận buffer ≥ 50 MB trong setInputFiles; đường dẫn file thì được).
 */
export function sparseFile(testInfo: TestInfo, name: string, size: number): string {
  const p = testInfo.outputPath(name);
  fs.writeFileSync(p, '');
  fs.truncateSync(p, size);
  return p;
}

/**
 * Chọn file tạo ngay trong trang (bộ nhớ trình duyệt) vào input file, như người dùng chọn qua hộp thoại:
 * gán `files` bằng DataTransfer rồi phát sự kiện `change`. Dùng cho file lớn (≥ 50 MB) mà vẫn cần
 * request upload có nội dung (file trên đĩa không hiện nội dung trong request bị chặn bằng route).
 */
export async function chooseGeneratedFiles(input: Locator, files: { name: string; size: number; type: string }[]) {
  await input.evaluate((el, list) => {
    const dt = new DataTransfer();
    for (const f of list) {
      const bytes = new Uint8Array(f.size);
      bytes.fill(0x41);
      dt.items.add(new File([bytes], f.name, { type: f.type }));
    }
    (el as HTMLInputElement).files = dt.files;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, files);
}
