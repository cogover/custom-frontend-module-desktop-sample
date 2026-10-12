import { describe, expect, it } from 'vitest';
import { MENTION_STYLE } from '../domain/mentions';
import { emptyValue, htmlToValue, isAllowedHref, isAllowedImageSrc, valueToHtml } from './html';

const roundTrip = (html: string) => valueToHtml(htmlToValue(html).value);

describe('description HTML ⇄ editor value', () => {
  it('keeps a real Cogover description (ordered + bulleted lists, link, arrow, image) intact', () => {
    const html =
      '<ol><li>Đã gửi <a href="https://support.example.com/ticket/123">ticket #123</a> (chat với khách lúc 9h)</li><li>Khách xác nhận đã nhận</li></ol>' +
      '<ul><li>Kiểm tra lại cấu hình tổng đài</li></ul>' +
      '<p>⇒ Chờ phản hồi từ đối tác</p>' +
      '<p><img src="/files/0/FILE123/original/x.png"></p>';
    const parsed = htmlToValue(html);
    expect(parsed.unsupported).toBeNull();
    expect(parsed.value.map(b => b.type)).toEqual(['ol', 'ul', 'p', 'p']);
    expect(roundTrip(html)).toBe(
      '<ol><li>Đã gửi <a href="https://support.example.com/ticket/123" target="_blank" rel="noopener noreferrer">ticket #123</a> (chat với khách lúc 9h)</li><li>Khách xác nhận đã nhận</li></ol>' +
        '<ul><li>Kiểm tra lại cấu hình tổng đài</li></ul>' +
        '<p>⇒ Chờ phản hồi từ đối tác</p>' +
        '<p><img src="/files/0/FILE123/original/x.png"></p>',
    );
    // stable: a second pass changes nothing
    expect(roundTrip(roundTrip(html))).toBe(roundTrip(html));
  });

  it('maps every supported format to clean tags (no classes, styles or data attributes)', () => {
    const html =
      '<h1>Tiêu đề 1</h1><h2>Tiêu đề 2</h2><h3>Tiêu đề 3</h3>' +
      '<p><b>đậm</b> <i>nghiêng</i> <u>gạch chân</u> <del>gạch ngang</del> <code>mã</code> <strong><em>cả hai</em></strong></p>' +
      '<blockquote>Trích dẫn</blockquote>' +
      '<p class="x" data-id="1" style="font-weight:700">từ Word</p>' +
      '<p>dòng 1<br>dòng 2</p><p><br></p><p>&lt;b&gt; không phải thẻ &amp; ký tự</p>';
    expect(roundTrip(html)).toBe(
      '<h1>Tiêu đề 1</h1><h2>Tiêu đề 2</h2><h3>Tiêu đề 3</h3>' +
        '<p><strong>đậm</strong> <em>nghiêng</em> <u>gạch chân</u> <s>gạch ngang</s> <code>mã</code> <strong><em>cả hai</em></strong></p>' +
        '<blockquote><p>Trích dẫn</p></blockquote>' +
        '<p><strong>từ Word</strong></p>' +
        '<p>dòng 1<br>dòng 2</p><p><br></p><p>&lt;b&gt; không phải thẻ &amp; ký tự</p>',
    );
  });

  it('keeps nested lists nested, including a list written straight inside a list', () => {
    const html = '<ul><li>Cha<ol><li>Con 1</li><li>Con 2<ul><li>Cháu</li></ul></li></ol></li><li>Cha 2</li></ul>';
    expect(roundTrip(html)).toBe(html);
    expect(roundTrip('<ul><li>A</li><ul><li>A.1</li></ul></ul>')).toBe('<ul><li>A<ul><li>A.1</li></ul></li></ul>');
    expect(roundTrip('<ol><li><p>Một</p><p>dòng hai</p></li></ol>')).toBe('<ol><li>Một<br>dòng hai</li></ol>');
  });

  it('collapses HTML whitespace like a browser and drops blank paragraphs at the edges', () => {
    expect(roundTrip('\n  <p>  Xin   chào\n bạn  </p>\n\n<ul>\n <li> A </li>\n</ul>  ')).toBe('<p>Xin chào bạn</p><ul><li>A</li></ul>');
    expect(roundTrip('<p><br></p><p>giữa</p><p><br></p>')).toBe('<p>giữa</p>');
    expect(roundTrip('<p>có xuống dòng cuối<br></p>')).toBe('<p>có xuống dòng cuối</p>');
    expect(roundTrip('<div>khối div</div><div><p>p trong div</p></div>')).toBe('<p>khối div</p><p>p trong div</p>');
    expect(roundTrip('chữ rời <b>đậm</b><p>đoạn</p>')).toBe('<p>chữ rời <strong>đậm</strong></p><p>đoạn</p>');
  });

  it('reads plain-text descriptions line by line and empty ones as one empty paragraph', () => {
    expect(htmlToValue('Dòng 1\nDòng 2').value).toEqual([
      { type: 'p', children: [{ text: 'Dòng 1' }] },
      { type: 'p', children: [{ text: 'Dòng 2' }] },
    ]);
    expect(htmlToValue('').value).toEqual(emptyValue());
    expect(htmlToValue('   ').unsupported).toBeNull();
    expect(valueToHtml(emptyValue())).toBe('');
  });

  it('drops scripts, styles and event handlers; never lets a dangerous URL through', () => {
    const html =
      '<p onclick="x()">Bấm<script>alert(1)</script></p><style>p{}</style>' +
      '<p><a href="javascript:alert(1)">xấu</a> <a href="#muc">neo</a> <a href="mailto:a@b.test">thư</a></p>' +
      '<p><img src="x" onerror="alert(1)" alt="ảnh"></p>';
    const parsed = htmlToValue(html);
    expect(parsed.unsupported).toBe('link'); // javascript: link → do not rewrite this description
    expect(valueToHtml(parsed.value)).toBe(
      '<p>Bấm</p><p>xấu neo <a href="mailto:a@b.test" target="_blank" rel="noopener noreferrer">thư</a></p><p><img src="x" alt="ảnh"></p>',
    );
    // the serializer re-checks URLs and escapes attributes itself
    expect(
      valueToHtml([
        {
          type: 'p',
          children: [
            { type: 'a', url: 'javascript:alert(1)', children: [{ text: 'a' }] },
            { type: 'a', url: 'https://x.test/?q="><script>', children: [{ text: 'b' }] },
            { type: 'img', url: 'javascript:alert(1)', children: [{ text: '' }] },
            { type: 'img', url: '/files/a.png', alt: '"x"', children: [{ text: '' }] },
          ],
        },
      ]),
    ).toBe('<p>a<a href="https://x.test/?q=&quot;&gt;&lt;script&gt;" target="_blank" rel="noopener noreferrer">b</a><img src="/files/a.png" alt="&quot;x&quot;"></p>');
  });

  it('marks descriptions the editor cannot keep (tables, embeds, colours…) as unsupported', () => {
    expect(htmlToValue('<table><tr><td>1</td></tr></table>').unsupported).toBe('TABLE');
    expect(htmlToValue('<p>a</p><iframe src="https://x"></iframe>').unsupported).toBe('IFRAME');
    expect(htmlToValue('<video src="a.mp4"></video>').unsupported).toBe('VIDEO');
    expect(htmlToValue('<embed src="a.swf">').unsupported).toBe('EMBED');
    expect(htmlToValue('<pre>code</pre>').unsupported).toBe('PRE');
    expect(htmlToValue('<h4>nhỏ</h4>').unsupported).toBe('H4');
    expect(htmlToValue('<p><span style="color: red">đỏ</span></p>').unsupported).toBe('style');
    expect(htmlToValue('<p style="text-align:center">giữa</p>').unsupported).toBe('style');
    expect(htmlToValue('<p><a href="/noi-bo">nội bộ</a></p>').unsupported).toBe('link');
    expect(htmlToValue('<p><img src="ftp://x/a.png"></p>').unsupported).toBe('image');
    expect(htmlToValue('<p><span style="font-weight:bold">đậm</span></p>').unsupported).toBeNull();
  });

  it('only allows http/https/mailto links and safe image sources', () => {
    expect(isAllowedHref('https://a.test')).toBe(true);
    expect(isAllowedHref('mailto:a@b.test')).toBe(true);
    expect(isAllowedHref('tel:0123')).toBe(false);
    expect(isAllowedHref('javascript:alert(1)')).toBe(false);
    expect(isAllowedImageSrc('/files/0/a/original/x.png')).toBe(true);
    expect(isAllowedImageSrc('https://cdn.test/a.png')).toBe(true);
    expect(isAllowedImageSrc('data:image/png;base64,AAA')).toBe(true);
    expect(isAllowedImageSrc('javascript:alert(1)')).toBe(false);
    expect(isAllowedImageSrc('')).toBe(false);
  });
});

describe('pasting from Google Docs and Word keeps the formatting', () => {
  const pasted = (html: string) => valueToHtml(htmlToValue(html, { paste: true }).value);
  const run = (style: string, text: string) => `<span style="font-size:11pt;font-family:Arial;color:#000000;${style}">${text}</span>`;
  const plain = 'font-weight:400;font-style:normal;text-decoration:none;';

  it('Google Docs: the <b style="font-weight:normal"> wrapper is only a wrapper; headings, runs and nested lists survive', () => {
    const html =
      '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1a2b3c4d-7fff">' +
      `<h1 dir="ltr" style="line-height:1.38">${run('font-size:20pt;' + plain, 'Tiêu đề')}</h1>` +
      `<p dir="ltr" style="line-height:1.38;margin-top:0pt">${run(plain, 'Thường ')}${run('font-weight:700;font-style:normal;text-decoration:none;', 'đậm')}` +
      `${run('font-weight:400;font-style:italic;text-decoration:none;', ' nghiêng')}${run('font-weight:400;font-style:normal;text-decoration:underline;-webkit-text-decoration-skip:none;', ' gạch dưới')}` +
      `${run('font-weight:400;font-style:normal;text-decoration:line-through;', ' gạch ngang')}</p>` +
      '<br><ul style="padding-inline-start:48px"><li dir="ltr" style="list-style-type:disc" aria-level="1"><p dir="ltr" role="presentation">' +
      run(plain, 'Mục 1') +
      '</p></li><ul><li dir="ltr" style="list-style-type:circle" aria-level="2"><p dir="ltr" role="presentation">' +
      run(plain, 'Mục 1.1') +
      '</p></li></ul><li dir="ltr" aria-level="1"><p dir="ltr" role="presentation">' +
      run(plain, 'Mục 2') +
      '</p></li></ul><br><ol><li dir="ltr" style="list-style-type:decimal" aria-level="1"><p dir="ltr" role="presentation">' +
      run(plain, 'Bước 1') +
      '</p></li></ol></b>';
    expect(pasted(html)).toBe(
      '<h1>Tiêu đề</h1><p>Thường <strong>đậm</strong><em> nghiêng</em><u> gạch dưới</u><s> gạch ngang</s></p><p><br></p>' +
        '<ul><li>Mục 1<ul><li>Mục 1.1</li></ul></li><li>Mục 2</li></ul><p><br></p><ol><li>Bước 1</li></ol>',
    );
  });

  it('Google Docs: a single copied line keeps its bold run and nothing else turns bold', () => {
    const html = `<b style="font-weight:normal;" id="docs-internal-guid-x">${run(plain, 'Gửi ')}${run('font-weight:700;', 'hôm nay')}</b>`;
    expect(pasted(html)).toBe('<p>Gửi <strong>hôm nay</strong></p>');
  });

  it('Word: Title/Heading, marks, blank lines and mso-list paragraphs become real (nested, numbered) lists', () => {
    const li = (level: number, list: string, marker: string, text: string) =>
      `<p class=MsoListParagraph style='margin-left:${level * 0.5}in;text-indent:-.25in;mso-list:${list} level${level} lfo1'>` +
      `<![if !supportLists]><span style='font-family:Symbol'><span style='mso-list:Ignore'>${marker}<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>${text}<o:p></o:p></p>\n`;
    const html =
      `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><style>p.MsoNormal{margin:0in}</style></head><body lang=EN-US><!--StartFragment-->` +
      `<p class=MsoTitle>Báo cáo tuần<o:p></o:p></p>\n<h2>Mục tiêu<o:p></o:p></h2>\n` +
      `<p class=MsoNormal>Văn bản <b>đậm</b>, <i>nghiêng</i>, <u>gạch dưới</u> và <s>gạch ngang</s>.<o:p></o:p></p>\n` +
      li(1, 'l0', '·', 'Gạch đầu dòng 1') +
      li(2, 'l0', 'o', 'Cấp 2') +
      li(1, 'l0', '·', '<b>Gạch đầu dòng 2</b>') +
      `<p class=MsoNormal><o:p>&nbsp;</o:p></p>\n` +
      li(1, 'l1', '1.', 'Bước một') +
      li(1, 'l1', '2.', 'Bước hai') +
      li(2, 'l1', 'a)', 'Bước con') +
      `<!--EndFragment--></body></html>`;
    expect(pasted(html)).toBe(
      '<h1>Báo cáo tuần</h1><h2>Mục tiêu</h2><p>Văn bản <strong>đậm</strong>, <em>nghiêng</em>, <u>gạch dưới</u> và <s>gạch ngang</s>.</p>' +
        '<ul><li>Gạch đầu dòng 1<ul><li>Cấp 2</li></ul></li><li><strong>Gạch đầu dòng 2</strong></li></ul><p> </p>' +
        '<ol><li>Bước một</li><li>Bước hai<ol><li>Bước con</li></ol></li></ol>',
    );
  });

  it('Word for the web: one <ul> per item is merged back into one list (paste only, never on load)', () => {
    const item = (t: string) => `<div class="ListContainerWrapper"><ul><li class="OutlineElement" aria-level="1"><p class="Paragraph"><span class="TextRun">${t}</span></p></li></ul></div>`;
    expect(pasted(item('A') + item('B'))).toBe('<ul><li>A</li><li>B</li></ul>');
    expect(roundTrip('<ul><li>A</li></ul><ul><li>B</li></ul>')).toBe('<ul><li>A</li></ul><ul><li>B</li></ul>');
  });

  it('an explicit normal style inside a bold tag is plain; loaded descriptions read the same way', () => {
    expect(roundTrip('<p><strong>đậm <span style="font-weight:normal">thường</span></strong></p>')).toBe('<p><strong>đậm </strong>thường</p>');
    expect(roundTrip('<p style="font-weight:700">từ Word</p>')).toBe('<p><strong>từ Word</strong></p>');
  });
});

describe('@mentions (CONTRACT §5.3f)', () => {
  const span = (extra = '') =>
    `<span contenteditable="false" data-autocomplete-type="mention" data-id="PER1" data-parent-object-id="OTDEMOTASK001" data-parent-record-id="TAS1" data-redirect="/o/task/TAS1?layoutId=L1&amp;activityId={record_id}" data-type="autocomplete" style="${MENTION_STYLE}"${extra}>@Nguyễn Thị Lan</span>`;

  it('writes a mention as Cogover’s span and reads it back (already-notified marker kept)', () => {
    const node = { type: 'mention', personId: 'PER1', name: 'Nguyễn Thị Lan', objectId: 'OTDEMOTASK001', recordId: 'TAS1', redirect: '/o/task/TAS1?layoutId=L1&activityId={record_id}', children: [{ text: '' }] };
    expect(valueToHtml([{ type: 'p', children: [{ text: 'Nhờ ' }, node, { text: ' xem' }] }])).toBe(`<p>Nhờ ${span()} xem</p>`);
    const parsed = htmlToValue(`<p>Nhờ ${span(' data-mentioned="true"')}&nbsp;xem</p>`);
    expect(parsed.unsupported).toBeNull(); // its pill style does not lock the editor
    expect(parsed.value[0].children[1]).toEqual({ ...node, mentioned: true });
    expect(roundTrip(`<p>${span(' data-mentioned="true"')}</p>`)).toBe(`<p>${span(' data-mentioned="true"')}</p>`);
  });

  it('keeps only the text of a pasted mention, and of a span without a person', () => {
    expect(valueToHtml(htmlToValue(`<p>${span()}</p>`, { paste: true }).value)).toBe('<p>@Nguyễn Thị Lan</p>');
    expect(valueToHtml([{ type: 'p', children: [{ type: 'mention', personId: '', name: 'Ai đó', children: [{ text: '' }] }] }])).toBe('<p>@Ai đó</p>');
    expect(valueToHtml([{ type: 'p', children: [{ type: 'mention', personId: ' ', name: '', children: [{ text: '' }] }] }])).toBe('<p><br></p>');
  });
});
