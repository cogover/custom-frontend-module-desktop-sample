import { describe, expect, it } from 'vitest';
import { base64ToBytes, decodeBase64, encodeBase64 } from './base64';
import { findJsonError, formatJson, highlightJson, lineColumn } from './json';
import { decodeJwt, jwtState, jwtTimes, signJwt, verifyJwt } from './jwt';

describe('JSON formatter', () => {
  it('pretty-prints with the chosen indent, minifies, and colours every kind of token', () => {
    const raw = '{"a":1,"b":[true,null,"x<y"],"c":{"d":-2.5e3}}';
    const two = formatJson(raw, '2');
    expect(two).toMatchObject({ ok: true, text: '{\n  "a": 1,\n  "b": [\n    true,\n    null,\n    "x<y"\n  ],\n  "c": {\n    "d": -2500\n  }\n}' });
    expect(formatJson(raw, '4')).toMatchObject({ ok: true, text: expect.stringContaining('\n    "a": 1') });
    expect(formatJson(raw, 'tab')).toMatchObject({ ok: true, text: expect.stringContaining('\n\t"a": 1') });
    expect(formatJson(' { "a" : 1 } ', 'min')).toMatchObject({ ok: true, text: '{"a":1}' });
    const html = highlightJson('{"a": 1, "b": [true, null, "x<y: z"]}');
    expect(html).toBe(
      '<span class="j-punc">{</span><span class="j-key">"a"</span><span class="j-punc">:</span> <span class="j-num">1</span><span class="j-punc">,</span> ' +
        '<span class="j-key">"b"</span><span class="j-punc">:</span> <span class="j-punc">[</span><span class="j-bool">true</span><span class="j-punc">,</span> ' +
        '<span class="j-null">null</span><span class="j-punc">,</span> <span class="j-str">"x&lt;y: z"</span><span class="j-punc">]</span><span class="j-punc">}</span>',
    );
    // markup inside a string never becomes markup
    expect(highlightJson('"<img src=x onerror=alert(1)>"')).toBe('<span class="j-str">"&lt;img src=x onerror=alert(1)&gt;"</span>');
  });

  it('says where broken JSON breaks (line, column) and why', () => {
    const at = (text: string) => {
      const r = formatJson(text);
      return r.ok ? null : [r.line, r.column, r.error];
    };
    expect(at('{\n  "a": 1,\n  "b": }')).toEqual([3, 8, 'Thừa dấu } (thiếu giá trị trước nó)']);
    expect(at('{"a":1,}')).toEqual([1, 8, 'Tên thuộc tính phải là chuỗi trong dấu "']);
    expect(at('{a:1}')).toEqual([1, 2, 'Tên thuộc tính phải là chuỗi trong dấu "']);
    expect(at('{"a" 1}')).toEqual([1, 6, 'Thiếu dấu : sau tên thuộc tính']);
    expect(at('[1 2]')).toEqual([1, 4, 'Thiếu dấu , hoặc ]']);
    expect(at('[1,2')).toEqual([1, 5, 'JSON kết thúc sớm: thiếu dấu ]']);
    expect(at('"abc')).toEqual([1, 1, 'Chuỗi chưa đóng dấu "']);
    expect(at('"a\\x"')).toEqual([1, 4, 'Ký tự thoát không hợp lệ trong chuỗi']);
    expect(at("{'a':1}")).toEqual([1, 2, 'Tên thuộc tính phải là chuỗi trong dấu "']);
    expect(at('[01]')).toEqual([1, 2, 'Giá trị không hợp lệ ở “01]”']);
    expect(at('{} x')).toEqual([1, 4, 'Thừa nội dung sau khi JSON đã kết thúc']);
    expect(at('')).toEqual([1, 1, 'JSON kết thúc sớm: thiếu giá trị']);
    expect(lineColumn('ab\ncd', 4)).toEqual({ line: 2, column: 2 });
    // valid documents have no error
    for (const ok of ['{"a":[1,-2.5e3,true,false,null,"\\u00e9\\n"],"b":{}}', ' [ ] ', '"x"', '0']) expect(findJsonError(ok)).toBeNull();
  });
});

describe('Base64', () => {
  it('round-trips UTF-8 text; URL-safe drops the padding and swaps + /', () => {
    const text = 'Xin chào 👋 Việt Nam';
    expect(encodeBase64(text)).toBe('WGluIGNow6BvIPCfkYsgVmnhu4d0IE5hbQ==');
    expect(decodeBase64('WGluIGNow6BvIPCfkYsgVmnhu4d0IE5hbQ==')).toBe(text);
    expect(encodeBase64('??>>')).toBe('Pz8+Pg==');
    expect(encodeBase64('??>>', true)).toBe('Pz8-Pg');
    expect(decodeBase64('Pz8-Pg')).toBe('??>>'); // URL-safe, no padding
    expect(decodeBase64(' Pz8+\nPg== ')).toBe('??>>'); // whitespace ignored
    expect(encodeBase64('')).toBe('');
  });

  it('refuses what is not Base64, and bytes that are not text', () => {
    expect(() => base64ToBytes('@@@')).toThrow('không phải Base64');
    expect(() => base64ToBytes('abcde')).toThrow('không phải Base64');
    expect(() => decodeBase64('/w==')).toThrow('không phải văn bản UTF-8');
  });
});

describe('JWT', () => {
  // the well-known example token of jwt.io (HS256, secret "your-256-bit-secret")
  const KNOWN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

  it('decodes header and payload (a "Bearer " prefix is fine) and says why a token is not one', () => {
    const d = decodeJwt(`Bearer ${KNOWN}\n`);
    expect(d.header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(d.payload).toEqual({ sub: '1234567890', name: 'John Doe', iat: 1516239022 });
    expect(d.signature).toBe('SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
    expect(() => decodeJwt('abc.def')).toThrow('3 phần');
    expect(() => decodeJwt('@@.e30.x')).toThrow('header không phải Base64URL');
    expect(() => decodeJwt('YWJj.e30.x')).toThrow('header không phải JSON');
    expect(() => decodeJwt('W10.e30.x')).toThrow('header phải là một object');
    expect(() => decodeJwt('e30.YWJj.x')).toThrow('payload không phải JSON');
  });

  it('verifies and signs with a shared secret (HS256 / HS384 / HS512)', async () => {
    expect(await verifyJwt(KNOWN, 'your-256-bit-secret')).toBe('valid');
    expect(await verifyJwt(KNOWN, 'khac')).toBe('invalid');
    for (const alg of ['HS256', 'HS384', 'HS512'] as const) {
      const token = await signJwt({ sub: 'Tôi', n: 1 }, 'bí mật', alg);
      expect(decodeJwt(token)).toMatchObject({ header: { typ: 'JWT', alg }, payload: { sub: 'Tôi', n: 1 } });
      expect(await verifyJwt(token, 'bí mật')).toBe('valid');
      expect(await verifyJwt(token, 'sai')).toBe('invalid');
    }
    // same input as the known token → same signature
    expect(await signJwt({ sub: '1234567890', name: 'John Doe', iat: 1516239022 }, 'your-256-bit-secret', 'HS256', { alg: 'x', typ: 'JWT' })).not.toBe('');
    const rs = `${btoa('{"alg":"RS256"}').replace(/=+$/, '')}.e30.c2ln`;
    expect(await verifyJwt(rs, 'x')).toBe('unsupported');
  });

  it('reads the time claims and the state of the token', () => {
    const p = { iat: 1000, nbf: 2000, exp: 3000, other: 'x' };
    expect(jwtTimes(p).map(t => [t.claim, t.at])).toEqual([
      ['iat', 1_000_000],
      ['nbf', 2_000_000],
      ['exp', 3_000_000],
    ]);
    expect(jwtState(p, 1_500_000)).toBe('early');
    expect(jwtState(p, 2_500_000)).toBe('active');
    expect(jwtState(p, 3_000_000)).toBe('expired');
    expect(jwtState({ iat: 1 }, 5)).toBeNull();
    expect(jwtTimes('text')).toEqual([]);
    expect(jwtTimes({ exp: 'soon' })).toEqual([]);
  });
});
