/** Base64 of "Dev tools": text is UTF-8, so Vietnamese and emoji survive the round trip. */

const toBinary = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return s;
};

export function bytesToBase64(bytes: Uint8Array, urlSafe = false): string {
  const b64 = btoa(toBinary(bytes));
  return urlSafe ? b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : b64;
}

/** Standard or URL-safe Base64 (padding optional, whitespace ignored) → bytes; throws on anything else. */
export function base64ToBytes(input: string): Uint8Array {
  const clean = input.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (!/^[A-Za-z0-9+/]*$/.test(clean) || clean.length % 4 === 1) throw new Error('Chuỗi không phải Base64 hợp lệ.');
  const bin = atob(clean + '='.repeat((4 - (clean.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export const encodeBase64 = (text: string, urlSafe = false) => bytesToBase64(new TextEncoder().encode(text), urlSafe);

/** Base64 → text; throws when the bytes are not UTF-8 text (a binary file, another encoding). */
export function decodeBase64(input: string): string {
  const bytes = base64ToBytes(input);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('Giải mã được nhưng dữ liệu không phải văn bản UTF-8 (có thể là file nhị phân).');
  }
}
