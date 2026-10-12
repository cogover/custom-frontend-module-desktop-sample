import { describe, expect, it } from 'vitest';
import { givenName, normalizePeople, normalizePerson, parseAvatarUrl, personInitial, personName, personTone } from './people';

describe('people', () => {
  it('builds "last first" names and initials from first_name', () => {
    const hoa = { firstName: 'Hoa', lastName: 'Nguyễn Thị' };
    expect(personName(hoa)).toBe('Nguyễn Thị Hoa');
    expect(personName({ firstName: 'Alex', lastName: 'D.' })).toBe('D. Alex');
    expect(personName({ firstName: '', lastName: '' })).toBe('');
    expect(personName(null)).toBe('');
    expect(personInitial(hoa)).toBe('H');
    expect(personInitial({ firstName: '', lastName: 'ánh' })).toBe('Á');
    expect(personInitial({ firstName: '', lastName: '' })).toBe('?');
    expect(givenName(hoa)).toBe('Hoa');
    expect(givenName({ firstName: '', lastName: 'Lê Văn' })).toBe('Văn');
  });

  it('gives the same tone to the same name', () => {
    expect(personTone('Nguyễn Thị Lan')).toBe(personTone('Nguyễn Thị Lan'));
    expect(['sky', 'violet', 'teal', 'orange', 'blue', 'green']).toContain(personTone('x'));
  });

  it('parses the avatar JSON into the small rendition URL', () => {
    const raw = JSON.stringify({ url: 'https://acme.cogover.example/files/0/F1/{resolution_size}/a.png' });
    expect(parseAvatarUrl(raw)).toBe('https://acme.cogover.example/files/0/F1/small/a.png');
    expect(parseAvatarUrl({ url: '/files/0/F2/{resolution_size}/b.png' })).toBe('/files/0/F2/small/b.png');
    expect(parseAvatarUrl([{ url: 'https://x.test/a.png' }])).toBe('https://x.test/a.png');
    expect(parseAvatarUrl('https://x.test/plain.png')).toBe('https://x.test/plain.png');
  });

  it('fills {file_id} from the avatar JSON (files host) and rejects leftover placeholders', () => {
    const tpl = 'https://files.cogover.example/0/{file_id}/{resolution_size}/a.png';
    expect(parseAvatarUrl(JSON.stringify({ url: tpl, file_id: 'F9' }))).toBe('https://files.cogover.example/0/F9/small/a.png');
    expect(parseAvatarUrl({ url: tpl, file_id: 123 })).toBe('https://files.cogover.example/0/123/small/a.png');
    expect(parseAvatarUrl({ url: tpl, fileId: 'F 1' })).toBe('https://files.cogover.example/0/F%201/small/a.png');
    expect(parseAvatarUrl(JSON.stringify({ url: tpl }))).toBeNull();
    expect(parseAvatarUrl({ url: tpl, file_id: '' })).toBeNull();
    expect(parseAvatarUrl({ url: 'https://x.test/{other}/a.png', file_id: 'F1' })).toBeNull();
  });

  it('falls back (null) on broken or unsafe avatars', () => {
    expect(parseAvatarUrl('{not json')).toBeNull();
    expect(parseAvatarUrl('')).toBeNull();
    expect(parseAvatarUrl(null)).toBeNull();
    expect(parseAvatarUrl(JSON.stringify({ url: 'javascript:alert(1)' }))).toBeNull();
    expect(parseAvatarUrl(JSON.stringify({ url: '//evil.test/x.png' }))).toBeNull();
    expect(parseAvatarUrl(JSON.stringify({ name: 'no-url' }))).toBeNull();
    expect(parseAvatarUrl('data:image/png;base64,AAA')).toBeNull();
    expect(parseAvatarUrl(42)).toBeNull();
  });

  it('keeps only id, names and avatar from a lookup', () => {
    const p = normalizePerson({
      id: 'PER1',
      first_name: ' Lan ',
      last_name: 'Nguyễn Thị',
      avatar: null,
      email: 'lan@example.test',
      phone: '0900',
    });
    expect(p).toEqual({ id: 'PER1', firstName: 'Lan', lastName: 'Nguyễn Thị', avatarUrl: null });
    expect(Object.keys(p!)).not.toContain('email');
    expect(normalizePerson([{ id: 'PER2' }])?.id).toBe('PER2');
    expect(normalizePerson('PER3')).toEqual({ id: 'PER3', firstName: '', lastName: '', avatarUrl: null });
    expect(normalizePerson('  ')).toBeNull();
    expect(normalizePerson({ first_name: 'no id' })).toBeNull();
    expect(normalizePerson(undefined)).toBeNull();
  });

  it('normalises lists of people without duplicates', () => {
    expect(normalizePeople([{ id: 'A' }, { id: 'A' }, { id: 'B' }, null]).map(p => p.id)).toEqual(['A', 'B']);
    expect(normalizePeople({ id: 'C' }).map(p => p.id)).toEqual(['C']);
    expect(normalizePeople(null)).toEqual([]);
  });
});
