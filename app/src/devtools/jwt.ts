/** JWT of "Dev tools": decode any token; sign and verify with a shared secret (HS256 / HS384 / HS512, Web Crypto). */
import { base64ToBytes, bytesToBase64 } from './base64';

export type JwtAlg = 'HS256' | 'HS384' | 'HS512';
export const JWT_ALGS: readonly JwtAlg[] = ['HS256', 'HS384', 'HS512'];
const HASH: Record<JwtAlg, string> = { HS256: 'SHA-256', HS384: 'SHA-384', HS512: 'SHA-512' };

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: unknown;
  /** Base64url signature ('' for an unsigned token). */
  signature: string;
  /** `header.payload` as signed. */
  signingInput: string;
}

const utf8 = new TextEncoder();

function parsePart(part: string, name: string): unknown {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(base64ToBytes(part));
  } catch {
    throw new Error(`Phần ${name} không phải Base64URL hợp lệ.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Phần ${name} không phải JSON.`);
  }
}

/** Splits and decodes a token (a leading "Bearer " and surrounding spaces are ignored); throws with the reason. */
export function decodeJwt(token: string): DecodedJwt {
  const t = token.trim().replace(/^Bearer\s+/i, '');
  const parts = t.split('.');
  if (parts.length !== 3) throw new Error('JWT phải có 3 phần cách nhau bằng dấu chấm: header.payload.signature.');
  const [h, p, signature] = parts as [string, string, string];
  const header = parsePart(h, 'header');
  if (!header || typeof header !== 'object' || Array.isArray(header)) throw new Error('Phần header phải là một object JSON.');
  return { header: header as Record<string, unknown>, payload: parsePart(p, 'payload'), signature, signingInput: `${h}.${p}` };
}

const isAlg = (v: unknown): v is JwtAlg => typeof v === 'string' && (JWT_ALGS as readonly string[]).includes(v);

async function hmac(alg: JwtAlg, secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', utf8.encode(secret), { name: 'HMAC', hash: HASH[alg] }, false, ['sign']);
  return bytesToBase64(new Uint8Array(await crypto.subtle.sign('HMAC', key, utf8.encode(data))), true);
}

/** Signs `payload` (any JSON value) with `secret`; `header.alg` and `typ` are set for you. */
export async function signJwt(payload: unknown, secret: string, alg: JwtAlg = 'HS256', header: Record<string, unknown> = {}): Promise<string> {
  const part = (v: unknown) => bytesToBase64(utf8.encode(JSON.stringify(v)), true);
  const input = `${part({ typ: 'JWT', ...header, alg })}.${part(payload)}`;
  return `${input}.${await hmac(alg, secret, input)}`;
}

export type JwtCheck = 'valid' | 'invalid' | 'unsupported';

/** Checks the signature with a shared secret; "unsupported" for other algorithms (RS256, ES256, none…). */
export async function verifyJwt(token: string, secret: string): Promise<JwtCheck> {
  const d = decodeJwt(token);
  if (!isAlg(d.header.alg)) return 'unsupported';
  return (await hmac(d.header.alg, secret, d.signingInput)) === d.signature ? 'valid' : 'invalid';
}

export interface JwtTime {
  claim: 'iat' | 'nbf' | 'exp';
  label: string;
  /** ms epoch. */
  at: number;
}

const TIME_LABEL: Record<JwtTime['claim'], string> = { iat: 'Cấp lúc', nbf: 'Có hiệu lực từ', exp: 'Hết hạn lúc' };

/** The time claims of the payload (seconds since the epoch), in the order iat, nbf, exp. */
export function jwtTimes(payload: unknown): JwtTime[] {
  if (!payload || typeof payload !== 'object') return [];
  const p = payload as Record<string, unknown>;
  return (['iat', 'nbf', 'exp'] as const).flatMap(claim => {
    const v = p[claim];
    return typeof v === 'number' && Number.isFinite(v) ? [{ claim, label: TIME_LABEL[claim], at: v * 1000 }] : [];
  });
}

/** "expired", "not yet valid" or "active" at `now` (null when the token has no time limits). */
export function jwtState(payload: unknown, now: number): 'expired' | 'early' | 'active' | null {
  const times = jwtTimes(payload);
  const of = (c: JwtTime['claim']) => times.find(t => t.claim === c)?.at;
  const exp = of('exp');
  const nbf = of('nbf');
  if (exp === undefined && nbf === undefined) return null;
  if (exp !== undefined && now >= exp) return 'expired';
  if (nbf !== undefined && now < nbf) return 'early';
  return 'active';
}
