import type { Page } from '@playwright/test';

/**
 * Dữ liệu clipboard mẫu cho AC22 "Dán vào mô tả" (CONTRACT mục 5 điểm 3b). Dựng theo cấu trúc clipboard
 * thật của Google Docs / Word desktop — không đọc source app.
 */

/** Field `description` (long text) — tham số `long_text_field_id` trên link ảnh (CONTRACT 3b). */
export const DESC_FIELD_ID = 'OFDEMOTASKDSC';
/** Field hệ thống `_attachments` (file-media, is_public) của Object task. */
export const INLINE_FIELD_ID = 'OFDEMOTASKIMG';

/** Dòng trạng thái khi đang tải ảnh dán vào. */
export const imagesUploading = (n: number) => `Đang tải ${n} ảnh lên…`;
/** Dòng lỗi khi ảnh dán vào không tải lên được. */
export const imageUploadError = (reason: string) => `Không tải được ảnh dán vào: ${reason}`;
/** Nhãn nút lưu khi đang tải ảnh. */
export const SUBMIT_UPLOADING_IMAGES = 'Đang tải ảnh…';

export const pngDataUrl = (png: Buffer) => `data:image/png;base64,${png.toString('base64')}`;

/* ---------------- Google Docs ---------------- */

const GD_RUN = 'font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-variant:normal;vertical-align:baseline;white-space:pre;white-space:pre-wrap;';
const run = (style: string, text: string) => `<span style="${GD_RUN}${style}">${text}</span>`;
const plain = (text: string) => run('font-weight:400;font-style:normal;text-decoration:none;', text);
const gdP = (inner: string) => `<p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;">${inner}</p>`;
const gdLi = (level: number, type: string, inner: string) =>
  `<li dir="ltr" style="list-style-type:${type};font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;text-decoration:none;vertical-align:baseline;white-space:pre;" aria-level="${level}">` +
  `<p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;" role="presentation">${inner}</p></li>`;

/**
 * Clipboard HTML kiểu Google Docs: mọi thứ bọc trong `<b style="font-weight:normal" id="docs-internal-guid-…">`
 * (chỉ là vỏ), định dạng ghi bằng style của span (kể cả giá trị "thường" 400/normal/none), tiêu đề h1/h2,
 * danh sách `<li><p>` với danh sách con là `<ul>` nằm ngay trong `<ul>` cha (như Google Docs xuất), dòng trống `<br>`.
 */
export function googleDocsHtml(opts: { imageDataUrl?: string } = {}) {
  const img = opts.imageDataUrl
    ? gdP(`<span style="${GD_RUN}"><span style="border:none;display:inline-block;overflow:hidden;width:16px;height:16px;"><img src="${opts.imageDataUrl}" width="16" height="16" style="margin-left:0px;margin-top:0px;" /></span></span>`)
    : '';
  return (
    '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-5e1f0c2a-7fff-4c1d-9a3b-0e2d4f6a8b10">' +
    `<h1 dir="ltr" style="line-height:1.38;margin-top:20pt;margin-bottom:6pt;">${run('font-size:20pt;font-weight:400;font-style:normal;text-decoration:none;', 'Kế hoạch quý 4')}</h1>` +
    gdP(
      plain('Chữ thường ') +
        run('font-weight:700;font-style:normal;text-decoration:none;', 'chữ đậm') +
        plain(' ') +
        run('font-weight:400;font-style:italic;text-decoration:none;', 'chữ nghiêng') +
        plain(' ') +
        run('font-weight:400;font-style:normal;text-decoration:underline;-webkit-text-decoration-skip:none;text-decoration-skip-ink:none;', 'gạch chân') +
        plain(' ') +
        run('font-weight:400;font-style:normal;text-decoration:line-through;-webkit-text-decoration-skip:none;text-decoration-skip-ink:none;', 'gạch ngang'),
    ) +
    '<br />' +
    `<h2 dir="ltr" style="line-height:1.38;margin-top:18pt;margin-bottom:6pt;">${run('font-size:16pt;font-weight:400;font-style:normal;text-decoration:none;', 'Việc cần làm')}</h2>` +
    '<ul style="margin-top:0;margin-bottom:0;padding-inline-start:48px;">' +
    gdLi(1, 'disc', plain('Mục A')) +
    '<ul style="margin-top:0;margin-bottom:0;padding-inline-start:48px;">' +
    gdLi(2, 'circle', plain('Mục A.1')) +
    '</ul>' +
    gdLi(1, 'disc', run('font-weight:700;font-style:normal;text-decoration:none;', 'Mục B')) +
    '</ul>' +
    '<br />' +
    '<ol style="margin-top:0;margin-bottom:0;padding-inline-start:48px;">' +
    gdLi(1, 'decimal', plain('Bước 1')) +
    gdLi(1, 'decimal', plain('Bước 2')) +
    '</ol>' +
    img +
    '</b><br class="Apple-interchange-newline">'
  );
}

/* ---------------- Word desktop ---------------- */

const wordLi = (level: number, list: string, marker: string, text: string, symbol = false) =>
  `<p class=MsoListParagraphCxSpMiddle style='margin-left:${0.5 * level}in;mso-add-space:auto;text-indent:-.25in;mso-list:${list} level${level} lfo${list === 'l0' ? 1 : 2}'>` +
  `<![if !supportLists]><span style='${symbol ? 'font-family:Symbol;mso-fareast-font-family:Symbol;mso-bidi-font-family:Symbol' : 'mso-bidi-font-family:Calibri'}'>` +
  `<span style='mso-list:Ignore'>${marker}<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>` +
  `${text}<o:p></o:p></p>\n`;

/**
 * Clipboard HTML kiểu Word desktop (Windows/macOS): `MsoTitle`, `MsoSubtitle`, đoạn `mso-list:lN levelM`
 * với ký hiệu đầu dòng trong `<span style='mso-list:Ignore'>`, chữ đậm/nghiêng/gạch bằng b/i/u/s, dòng trống `&nbsp;`.
 * `imageSrc` (tuỳ chọn): ảnh kiểu Word `file:///…/clip_image001.png` (ảnh thật nằm trong RTF).
 */
export function wordDesktopHtml(opts: { imageSrc?: string } = {}) {
  const img = opts.imageSrc
    ? `<p class=MsoNormal><span style='mso-no-proof:yes'><!--[if gte vml 1]><v:shape id="Picture_x0020_1" style='width:12pt;height:12pt'><v:imagedata src="${opts.imageSrc}" o:title=""/></v:shape><![endif]--><![if !vml]><img width=16 height=16 src="${opts.imageSrc}" v:shapes="Picture_x0020_1"><![endif]></span><o:p></o:p></p>\n`
    : '';
  return (
    `<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">` +
    `<head><meta http-equiv=Content-Type content="text/html; charset=utf-8"><meta name=ProgId content=Word.Document><meta name=Generator content="Microsoft Word 15">` +
    `<style><!-- p.MsoNormal{margin:0in;font-size:12.0pt;font-family:"Calibri",sans-serif;} p.MsoTitle{font-size:28.0pt;} @list l0:level1{mso-level-number-format:bullet;} --></style></head>` +
    `<body lang=EN-US style='tab-interval:.5in;word-wrap:break-word'><!--StartFragment-->` +
    `<p class=MsoTitle>Báo cáo tuần<o:p></o:p></p>\n` +
    `<p class=MsoSubtitle>Phòng kinh doanh<o:p></o:p></p>\n` +
    `<p class=MsoNormal>Văn bản <b>in đậm</b>, <i>in nghiêng</i>, <u>gạch dưới</u> và <s>gạch bỏ</s>.<o:p></o:p></p>\n` +
    wordLi(1, 'l0', '·', 'Ý chính một', true) +
    wordLi(2, 'l0', 'o', 'Ý phụ', false) +
    wordLi(1, 'l0', '·', '<b>Ý chính hai</b>', true) +
    `<p class=MsoNormal><o:p>&nbsp;</o:p></p>\n` +
    wordLi(1, 'l1', '1.', 'Bước một') +
    wordLi(1, 'l1', '2.', 'Bước hai') +
    wordLi(2, 'l1', 'a)', 'Bước con') +
    img +
    `<!--EndFragment--></body></html>`
  );
}

/**
 * RTF Word đặt cạnh HTML trong clipboard: ảnh nằm trong nhóm `{\*\shppict{\pict … \pngblip \bliptagN …<hex>}}`
 * kèm bản `{\nonshppict{\pict \wmetafile8 …}}` (bản thay thế cho trình đọc cũ — phải bỏ qua).
 */
export function wordRtfWithPng(png: Buffer) {
  const hex = png.toString('hex').replace(/(.{128})/g, '$1\r\n');
  return (
    '{\\rtf1\\adeflang1025\\ansi\\ansicpg1252\\uc1\\adeff31507\\deff0{\\fonttbl{\\f0\\fbidi \\froman\\fcharset0\\fprq2 Times New Roman;}}' +
    '{\\pard\\plain Báo cáo tuần\\par}' +
    '{\\*\\shppict{\\pict{\\*\\picprop\\shplid1025{\\sp{\\sn shapeType}{\\sv 75}}}\\picscalex100\\picscaley100\\piccropl0\\piccropr0\\piccropt0\\piccropb0' +
    '\\picw423\\pich423\\picwgoal240\\pichgoal240\\pngblip\\bliptag-1532870134{\\*\\blipuid a4a3c50a1d4f6e0b7c8d9e0f1a2b3c4d}' +
    `\r\n${hex}}}` +
    '{\\nonshppict{\\pict\\picscalex100\\picscaley100\\piccropl0\\piccropr0\\piccropt0\\piccropb0\\picw423\\pich423\\picwgoal240\\pichgoal240\\wmetafile8\\bliptag-1532870134' +
    '\r\n0100090000035a0000000000310000000000050000000b0200000000050000000c0210001000}}' +
    '\\par}'
  );
}

/* ---------------- ảnh do trình duyệt mã hoá ---------------- */

/** Ảnh `w×h` do canvas của trình duyệt mã hoá theo `type` (image/webp…), trả data URL. */
export async function canvasDataUrl(page: Page, type: string, w = 12, h = 10) {
  return page.evaluate(
    ({ type, w, h }) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d')!;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          g.fillStyle = `rgb(${(x * 20) & 255}, ${(y * 25) & 255}, ${((x + y) * 12) & 255})`;
          g.fillRect(x, y, 1, 1);
        }
      return c.toDataURL(type);
    },
    { type, w, h },
  );
}

/** PNG signature. */
export const isPng = (b: Buffer) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

/* ---------------- đọc HTML đã lưu ---------------- */

/** Cấu trúc của HTML mô tả (phân tích bằng DOMParser của trình duyệt — hộp đen, không so chuỗi). */
export interface DescShape {
  h1: string[];
  h2: string[];
  h3: string[];
  strong: string[];
  em: string[];
  u: string[];
  s: string[];
  /** Văn bản của mỗi li (chỉ phần trực tiếp, không gồm danh sách con). */
  ulItems: { text: string; depth: number; parentItem: string | null }[];
  olItems: { text: string; depth: number; parentItem: string | null }[];
  /** Số đoạn trống (dòng trống). */
  emptyParagraphs: number;
  imgSrcs: string[];
  /** Thuộc tính không thuộc HTML ngữ nghĩa sạch (class/style/id/data-*, dir, role…). */
  extraAttrs: string[];
  /** Thẻ ngoài danh sách cho phép của contract (mục 5 điểm 3). */
  extraTags: string[];
  /** Văn bản nằm trong strong/b. */
  boldText: string;
  text: string;
  /** Khối cấp cao nhất theo thứ tự: "p:<chữ>", "h1:<chữ>", "ul", "ol"… (đoạn trống = "p:"). */
  blocks: string[];
}

/** Bỏ đoạn trống ở đầu/cuối danh sách khối (vị trí con trỏ lúc dán có thể để lại một đoạn trống). */
export const trimEmptyEdges = (blocks: string[]) => {
  const out = [...blocks];
  while (out[0] === 'p:') out.shift();
  while (out.at(-1) === 'p:') out.pop();
  return out;
};

export async function descShape(page: Page, html: string): Promise<DescShape> {
  return page.evaluate((src) => {
    const doc = new DOMParser().parseFromString(`<body>${src}</body>`, 'text/html');
    const body = doc.body;
    const texts = (sel: string) => [...body.querySelectorAll(sel)].map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim());
    const ownText = (li: Element) => {
      let t = '';
      const walk = (n: Node) => {
        for (const c of n.childNodes) {
          if (c.nodeType === 3) t += c.textContent;
          else if (c.nodeType === 1 && !['UL', 'OL'].includes((c as Element).tagName)) walk(c);
        }
      };
      walk(li);
      return t.replace(/\s+/g, ' ').trim();
    };
    const items = (tag: 'ul' | 'ol') =>
      [...body.querySelectorAll(`${tag} > li`)].map((li) => {
        let depth = 0;
        for (let p = li.parentElement; p && p !== body; p = p.parentElement) if (p.tagName === 'UL' || p.tagName === 'OL') depth++;
        const parentLi = li.parentElement?.closest('li');
        return { text: ownText(li), depth, parentItem: parentLi ? ownText(parentLi) : null };
      });
    const allowedTags = new Set(['P', 'BR', 'STRONG', 'EM', 'U', 'S', 'CODE', 'H1', 'H2', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'A', 'IMG']);
    const allowedAttrs: Record<string, string[]> = { A: ['href', 'target', 'rel'], IMG: ['src', 'alt', 'width', 'height'] };
    const extraAttrs: string[] = [];
    const extraTags: string[] = [];
    for (const el of body.querySelectorAll('*')) {
      if (!allowedTags.has(el.tagName)) extraTags.push(el.tagName.toLowerCase());
      for (const a of el.getAttributeNames()) if (!(allowedAttrs[el.tagName] ?? []).includes(a)) extraAttrs.push(`${el.tagName.toLowerCase()}[${a}]`);
    }
    const emptyParagraphs = [...body.querySelectorAll('p')].filter(
      (p) => !p.querySelector('img') && (p.textContent ?? '').replace(/[\s ﻿]/g, '') === '',
    ).length;
    return {
      h1: texts('h1'),
      h2: texts('h2'),
      h3: texts('h3'),
      strong: texts('strong, b'),
      em: texts('em, i'),
      u: texts('u'),
      s: texts('s, strike, del'),
      ulItems: items('ul'),
      olItems: items('ol'),
      emptyParagraphs,
      imgSrcs: [...body.querySelectorAll('img')].map((i) => i.getAttribute('src') ?? ''),
      extraAttrs,
      extraTags,
      boldText: texts('strong, b').join(' | '),
      text: (body.textContent ?? '').replace(/\s+/g, ' ').trim(),
      blocks: [...body.children].map((el) => {
        const tag = el.tagName.toLowerCase();
        if (tag === 'ul' || tag === 'ol') return tag;
        const t = (el.textContent ?? '').replace(/[\u00a0\ufeff]/g, ' ').replace(/\s+/g, ' ').trim();
        return `${tag}:${t}`;
      }),
    };
  }, html);
}

/** Link ảnh trong mô tả theo contract 3b: `<origin>/files/0/<file_id>/original/<fileName>?redirect=true&long_text_field_id=OFDEMOTASKDSC`. */
export function expectedImageSrc(origin: string, fileId: string, fileName: string) {
  return `${origin}/files/0/${fileId}/original/${encodeURIComponent(fileName)}?redirect=true&long_text_field_id=${DESC_FIELD_ID}`;
}

/** So sánh link ảnh không phụ thuộc cách mã hoá tên file (decode path + so query). */
export function sameImageLink(a: string, b: string) {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return (
      ua.origin === ub.origin &&
      decodeURIComponent(ua.pathname) === decodeURIComponent(ub.pathname) &&
      ua.searchParams.get('redirect') === ub.searchParams.get('redirect') &&
      ua.searchParams.get('long_text_field_id') === ub.searchParams.get('long_text_field_id') &&
      [...ua.searchParams.keys()].sort().join() === [...ub.searchParams.keys()].sort().join()
    );
  } catch {
    return false;
  }
}
