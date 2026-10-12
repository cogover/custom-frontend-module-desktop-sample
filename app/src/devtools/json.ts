/** JSON formatter of "Dev tools": parse, pretty-print / minify, and colour the result. */

export type JsonIndent = '2' | '4' | 'tab' | 'min';

export type JsonResult =
  | { ok: true; text: string; html: string }
  | { ok: false; error: string; line: number | null; column: number | null };

const escapeHtml = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

// a string (a key when a colon follows), a literal, a number, or punctuation
const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false)\b|\b(null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}[\],])/g;

/** Valid JSON text → HTML with one span per token (`j-key`, `j-str`, `j-num`, `j-bool`, `j-null`, `j-punc`). */
export function highlightJson(json: string): string {
  let out = '';
  let last = 0;
  for (const m of json.matchAll(TOKEN)) {
    out += escapeHtml(json.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1] !== undefined) {
      out += m[2] !== undefined ? `<span class="j-key">${escapeHtml(m[1])}</span>${m[2].replace(':', '<span class="j-punc">:</span>')}` : `<span class="j-str">${escapeHtml(m[1])}</span>`;
    } else if (m[3] !== undefined) out += `<span class="j-bool">${m[3]}</span>`;
    else if (m[4] !== undefined) out += `<span class="j-null">null</span>`;
    else if (m[5] !== undefined) out += `<span class="j-num">${m[5]}</span>`;
    else out += `<span class="j-punc">${m[6]}</span>`;
  }
  return out + escapeHtml(json.slice(last));
}

/** Line and column (1-based) of a character offset. */
export function lineColumn(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, Math.max(0, Math.min(offset, text.length)));
  const line = before.split('\n').length;
  return { line, column: before.length - before.lastIndexOf('\n') };
}

/**
 * The first place where `text` stops being JSON (engines often leave the position out of their message):
 * a strict scan of the grammar. null when the text is valid.
 */
export function findJsonError(text: string): { offset: number; message: string } | null {
  let i = 0;
  const fail = (message: string, at = i) => ({ offset: at, message });
  const ws = () => {
    while (i < text.length && ' \t\n\r'.includes(text[i]!)) i++;
  };
  type Err = { offset: number; message: string } | null;
  const string = (): Err => {
    const start = i++;
    for (; i < text.length; i++) {
      const c = text[i]!;
      if (c === '"') {
        i++;
        return null;
      }
      if (c === '\\') {
        const e = text[++i];
        if (e === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 1, i + 5))) return fail('Sau \\u phải là 4 chữ số hex');
          i += 4;
        } else if (e === undefined || !'"\\/bfnrt'.includes(e)) return fail('Ký tự thoát không hợp lệ trong chuỗi');
      } else if (c < ' ') return fail('Chuỗi không được chứa ký tự xuống dòng hoặc điều khiển (dùng \\n, \\t…)');
    }
    return fail('Chuỗi chưa đóng dấu "', start);
  };
  const value = (): Err => {
    ws();
    const c = text[i];
    if (c === undefined) return fail('JSON kết thúc sớm: thiếu giá trị');
    if (c === '"') return string();
    if (c === '{' || c === '[') {
      const close = c === '{' ? '}' : ']';
      i++;
      ws();
      if (text[i] === close) {
        i++;
        return null;
      }
      for (;;) {
        if (c === '{') {
          ws();
          if (text[i] !== '"') return fail(text[i] === undefined ? 'JSON kết thúc sớm: thiếu tên thuộc tính' : 'Tên thuộc tính phải là chuỗi trong dấu "');
          const e = string();
          if (e) return e;
          ws();
          if (text[i] !== ':') return fail('Thiếu dấu : sau tên thuộc tính');
          i++;
        }
        const e = value();
        if (e) return e;
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === close) {
          i++;
          return null;
        }
        return fail(text[i] === undefined ? `JSON kết thúc sớm: thiếu dấu ${close}` : `Thiếu dấu , hoặc ${close}`);
      }
    }
    const rest = text.slice(i);
    const lit = /^(?:true|false|null)(?![A-Za-z0-9_$])/.exec(rest) ?? /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?(?![A-Za-z0-9_$.])/.exec(rest);
    if (!lit) return fail(c === '}' || c === ']' || c === ',' ? `Thừa dấu ${c} (thiếu giá trị trước nó)` : `Giá trị không hợp lệ ở “${rest.slice(0, 12).split('\n')[0]}”`);
    i += lit[0].length;
    return null;
  };
  const e = value();
  if (e) return e;
  ws();
  return i < text.length ? fail('Thừa nội dung sau khi JSON đã kết thúc') : null;
}

export function formatJson(text: string, indent: JsonIndent = '2'): JsonResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    const found = findJsonError(text);
    const place = found ? lineColumn(text, found.offset) : null;
    return { ok: false, error: found?.message ?? (e instanceof Error ? e.message : String(e)), line: place?.line ?? null, column: place?.column ?? null };
  }
  const pretty = JSON.stringify(value, null, indent === 'min' ? undefined : indent === 'tab' ? '\t' : Number(indent));
  return { ok: true, text: pretty, html: highlightJson(pretty) };
}
