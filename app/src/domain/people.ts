import type { Person, Tone } from './types';

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** "last_name first_name", e.g. "Nguyễn Thị Hoa" or "D. Alex". */
export function personName(p: Pick<Person, 'firstName' | 'lastName'> | null | undefined): string {
  if (!p) return '';
  return `${p.lastName} ${p.firstName}`.trim();
}

/** Short name for compact chips: the given name (first_name), else the last word of the full name. */
export function givenName(p: Pick<Person, 'firstName' | 'lastName'>): string {
  return p.firstName || personName(p).split(/\s+/).pop() || '';
}

/** Avatar letter: first character of first_name (falls back to the full name). */
export function personInitial(p: Pick<Person, 'firstName' | 'lastName'>): string {
  const source = p.firstName || personName(p);
  return Array.from(source)[0]?.toUpperCase() ?? '?';
}

const PERSON_TONES: Tone[] = ['sky', 'violet', 'teal', 'orange', 'blue', 'green'];

/** Every name always gets the same avatar colour (same hash as the design mock). */
export function personTone(name: string): Tone {
  let h = 0;
  for (const ch of name) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return PERSON_TONES[h % PERSON_TONES.length];
}

function safeImageUrl(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  if (u.startsWith('/') && !u.startsWith('//')) return u;
  if (/^https?:\/\//i.test(u)) return u;
  return null;
}

const scalar = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');

/**
 * `avatar` is a JSON string such as
 * {"url":"https://…/files/0/<id>/{resolution_size}/a.png"} or
 * {"url":"https://files.cogover.example/0/{file_id}/{resolution_size}/a.png","file_id":"…"}.
 * Fills {file_id} from the JSON and {resolution_size} with "small". Returns null when missing,
 * unparsable, unsafe or still holding an unknown {placeholder} (the UI then shows the letter avatar).
 */
export function parseAvatarUrl(raw: unknown): string | null {
  let value: unknown = raw;
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return null;
    if (s.startsWith('{') || s.startsWith('[')) {
      try {
        value = JSON.parse(s);
      } catch {
        return null;
      }
    } else {
      value = { url: s };
    }
  }
  if (Array.isArray(value)) value = value[0];
  if (!value || typeof value !== 'object') return null;
  const o = value as { url?: unknown; file_id?: unknown; fileId?: unknown };
  if (typeof o.url !== 'string') return null;
  let url = o.url.replace(/\{resolution_size\}/g, 'small');
  const fileId = scalar(o.file_id) || scalar(o.fileId);
  if (fileId) url = url.replace(/\{file_id\}/g, encodeURIComponent(fileId));
  if (/\{[^}]*\}/.test(url)) return null;
  return safeImageUrl(url);
}

/** Keeps only id, names and avatar of a personnel lookup; everything else (email, phone…) is dropped. */
export function normalizePerson(raw: unknown): Person | null {
  let v = raw;
  if (Array.isArray(v)) v = v[0];
  if (typeof v === 'string') return v.trim() ? { id: v.trim(), firstName: '', lastName: '', avatarUrl: null } : null;
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const id = str(o.id);
  if (!id) return null;
  return {
    id,
    firstName: str(o.first_name),
    lastName: str(o.last_name),
    avatarUrl: parseAvatarUrl(o.avatar),
  };
}

export function normalizePeople(raw: unknown): Person[] {
  if (raw == null) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const out: Person[] = [];
  for (const item of list) {
    const p = normalizePerson(item);
    if (p && !out.some(x => x.id === p.id)) out.push(p);
  }
  return out;
}
