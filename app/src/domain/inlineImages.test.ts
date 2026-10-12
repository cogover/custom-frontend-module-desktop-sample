import { describe, expect, it, vi } from 'vitest';
import {
  dataUrlToFile,
  inlineImageFromUpload,
  inlineImagesIn,
  mergeInlineMetas,
  parseInlineMetas,
  replaceWordImages,
  rtfImages,
  uploadableImage,
} from './inlineImages';

// the upload response Cogover's own editor gets for a pasted picture (`_attachments`, public)
const upload = {
  fileName: 'file.png',
  fileSize: 168,
  resizable: true,
  file_id: 'asia-1_3S_F5IUQEKR7D',
  resolutionSizes: ['original', 'tiny', 'small', 'medium', 'large'],
  acl: 'public',
  fileExt: 'png',
  fileServerUrlTemplate: '//asia-1{FILE_SERVER_SUFFIX_PUBLIC_URL}/0/asia-1_3S_F5IUQEKR7D/file.png',
  fileType: 'object_field',
  url: 'https://acme.cogover.example/files/0/asia-1_3S_F5IUQEKR7D/{resolution_size}/file.png?redirect=true',
};

describe('pictures of the description (`_attachments`)', () => {
  it('builds the <img> src and the `_attachments` entry exactly like Cogover’s editor', () => {
    const img = inlineImageFromUpload(upload, 'https://acme.cogover.example');
    expect(img.fileId).toBe('asia-1_3S_F5IUQEKR7D');
    expect(img.src).toBe('https://acme.cogover.example/files/0/asia-1_3S_F5IUQEKR7D/original/file.png?redirect=true&long_text_field_id=OFDEMOTASKDSC');
    // what Cogover's editor saved in `_attachments` for the same upload (captured from its create request)
    expect(img.meta).toEqual({
      ...upload,
      url: 'https://acme.cogover.example/files/0/asia-1_3S_F5IUQEKR7D/%7Bresolution_size%7D/file.png?redirect=true&long_text_field_id=OFDEMOTASKDSC',
    });
  });

  it('resolves a relative url against the page, falls back when there is none, and needs a file id', () => {
    const rel = inlineImageFromUpload({ ...upload, url: '/files/0/{file_id}/{resolution_size}/a.png?redirect=true' }, 'http://localhost:5317');
    expect(rel.src).toBe('http://localhost:5317/files/0/asia-1_3S_F5IUQEKR7D/original/a.png?redirect=true&long_text_field_id=OFDEMOTASKDSC');
    const none = inlineImageFromUpload({ file_id: 'F9', fileName: 'ảnh 1.png', acl: 'public' }, 'https://w.test');
    expect(none.src).toBe('https://w.test/files/0/F9/original/%E1%BA%A3nh%201.png?redirect=true&long_text_field_id=OFDEMOTASKDSC');
    expect(() => inlineImageFromUpload({ fileName: 'a.png' }, 'https://w.test')).toThrow('Máy chủ không trả về thông tin ảnh vừa tải lên.');
    expect(() => inlineImageFromUpload(null, 'https://w.test')).toThrow();
  });

  it('keeps only the uploaded pictures still in the description, once each', () => {
    const a = inlineImageFromUpload(upload, 'https://w.test');
    const b = inlineImageFromUpload({ ...upload, file_id: 'F2', url: undefined }, 'https://w.test');
    const html = `<p><img src="${a.src.replace(/&/g, '&amp;')}"><img src="${a.src}"></p>`;
    expect(inlineImagesIn(html, [a, b, a])).toEqual([a]);
  });

  it('merges new pictures into the task’s `_attachments` without duplicates', () => {
    const a = inlineImageFromUpload(upload, 'https://w.test');
    const old = { file_id: 'OLD', fileName: 'cu.png' };
    expect(mergeInlineMetas([old], [a, a])).toEqual([old, a.meta]);
    expect(mergeInlineMetas([a.meta], [a])).toEqual([a.meta]);
  });

  it('reads `_attachments` as objects or JSON strings and skips bad items', () => {
    expect(parseInlineMetas([{ file_id: 'A' }, JSON.stringify({ file_id: 'B' }), '{bad', { x: 1 }, null])).toEqual([{ file_id: 'A' }, { file_id: 'B' }]);
    expect(parseInlineMetas(JSON.stringify([{ file_id: 'C' }]))).toEqual([{ file_id: 'C' }]);
    expect(parseInlineMetas('nope')).toEqual([]);
    expect(parseInlineMetas(null)).toEqual([]);
  });

  it('turns data: pictures into files (base64 and plain), and refuses anything else', async () => {
    const png = dataUrlToFile(`data:image/png;base64,${btoa('\x89PNG')}`)!;
    expect(png.name).toBe('anh-mo-ta.png');
    expect(png.type).toBe('image/png');
    expect(new Uint8Array(await png.arrayBuffer())[1]).toBe(0x50);
    const svg = dataUrlToFile('data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E', 'x')!;
    expect(svg.name).toBe('x.svg');
    expect(await svg.text()).toBe('<svg></svg>');
    expect(dataUrlToFile('data:text/html;base64,PGI+')).toBeNull();
    expect(dataUrlToFile('data:image/png;base64,***')).toBeNull();
    expect(dataUrlToFile('data:image/png;base64,')).toBeNull();
    expect(dataUrlToFile('https://x/a.png')).toBeNull();
  });

  it('reads Word pictures from the clipboard RTF in order, skipping its \\nonshppict / \\shprslt fallbacks and headers', () => {
    const rtf =
      '{\\rtf1{\\header{\\pict\\pngblip\\bliptag1 89504e470d0a1a0aaaaa}}' +
      '{\\*\\shppict{\\pict{\\*\\picprop{\\sp{\\sn x}{\\sv 1}}}\\picw10\\pich10\\pngblip\\bliptag-123{\\*\\blipuid 0a1b2c}89504e470d0a1a0a\r\n0000000d}}' +
      // Word gives the WMF fallback a \\bliptag too
      '{\\nonshppict{\\pict\\picw10\\wmetafile8\\bliptag-123\\blipupi96 0100090000034e}}' +
      '{\\shprslt{\\*\\do{\\pict\\wmetafile8\\bliptag5 01000900}}}' +
      '{\\*\\shppict{\\pict\\picw5\\jpegblip\\bliptag7 ffd8ffe000104a46}}' +
      '{\\*\\shppict{\\pict\\emfblip\\bliptag9 0100000058000000}}}';
    const pics = rtfImages(rtf);
    expect(pics).toHaveLength(3);
    expect(pics[0]).toBe(`data:image/png;base64,${btoa('\x89PNG\r\n\x1a\n\x00\x00\x00\x0d')}`);
    expect(pics[1]).toBe(`data:image/jpeg;base64,${btoa('\xff\xd8\xff\xe0\x00\x10JF')}`);
    expect(pics[2]).toBeNull(); // EMF: a browser cannot show it
    expect(rtfImages('{\\rtf1 no pictures}')).toEqual([]);
  });

  it('swaps Word’s file:// pictures for the RTF ones when the counts match; otherwise leaves the HTML alone', () => {
    const rtf = '{\\pict\\pngblip\\bliptag1 89504e470d0a1a0a}{\\pict\\emfblip\\bliptag2 01000000aabbccdd}';
    const html = '<p>A<img src="file:///C:/Temp/msohtmlclip/clip_image001.png">B<img src="file:///C:/Temp/clip_image002.emz"></p>';
    const out = replaceWordImages(html, rtf);
    expect(out).toContain('src="data:image/png;base64,');
    expect(out).toContain('src="file:///C:/Temp/clip_image002.emz"'); // not recoverable: dropped later by the converter
    expect(replaceWordImages(html, '{\\pict\\pngblip\\bliptag1 89504e470d0a1a0a}')).toBe(html); // 2 pictures vs 1
    expect(replaceWordImages('<p><img src="https://x/a.png"></p>', rtf)).toBe('<p><img src="https://x/a.png"></p>');
    expect(replaceWordImages(html, '')).toBe(html);
  });

  it('uploads accepted types as they are; others too when the browser cannot redraw them', async () => {
    const png = new File(['x'], 'a.png', { type: 'image/png' });
    expect(await uploadableImage(png)).toBe(png);
    const webp = new File(['x'], 'b.webp', { type: 'image/webp' });
    expect(await uploadableImage(webp)).toBe(webp); // jsdom has no createImageBitmap
  });

  it('redraws a webp picture as PNG when the browser can decode it; keeps the file when that fails', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 20, height: 10 })));
    const draw = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: draw } as unknown as CanvasRenderingContext2D);
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(cb => cb(new Blob(['png'], { type: 'image/png' })));
    const out = await uploadableImage(new File(['x'], 'anh.webp', { type: 'image/webp' }));
    expect(out).toMatchObject({ name: 'anh.png', type: 'image/png' });
    expect(draw).toHaveBeenCalled();
    toBlob.mockImplementation(cb => cb(null));
    const kept = new File(['x'], 'b.avif', { type: 'image/avif' });
    expect(await uploadableImage(kept)).toBe(kept);
    vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error('cannot decode'));
    expect(await uploadableImage(kept)).toBe(kept);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
