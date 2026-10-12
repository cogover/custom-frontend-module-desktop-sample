import { describe, expect, it } from 'vitest';
import { fold, htmlToText } from './text';

describe('fold', () => {
  it('removes Vietnamese diacritics and case', () => {
    expect(fold('Nguyễn Thị Hoa')).toBe('nguyen thi hoa');
    expect(fold('ĐỐI SOÁT')).toBe('doi soat');
    expect(fold(null)).toBe('');
  });
});

describe('description text', () => {
  it('turns HTML into one line of text for cards and search', () => {
    expect(htmlToText('<p>Tổng hợp số liệu.</p><p>Gửi trước họp.</p>')).toBe('Tổng hợp số liệu. Gửi trước họp.');
    expect(htmlToText('<p>a&nbsp;b<br>c</p>')).toBe('a b c');
    expect(htmlToText('<script>alert(1)</script><p>an toàn</p>')).toBe('an toàn');
    expect(htmlToText('văn bản thường')).toBe('văn bản thường');
    expect(htmlToText('')).toBe('');
    expect(htmlToText('<table><tr><td>a</td><td>b</td></tr></table>')).toBe('a b');
  });
});
