import { describe, expect, it } from 'vitest';
import {
  applyShare,
  buildTree,
  canEditNote,
  contentPayload,
  deleteRecordsBody,
  filterGroups,
  filterTree,
  folderIsEmpty,
  folderOptions,
  folderPath,
  canMoveFolder,
  canMoveNote,
  groupByOwner,
  isOwner,
  myDepartmentsBody,
  noteFields,
  noteMatches,
  normalizeDepartments,
  normalizeFolder,
  normalizeNote,
  normalizePin,
  normalizeRefs,
  normalizeVisibility,
  parseContent,
  parseScope,
  saveBody,
  shareEntries,
  shareFields,
  sharedNotesBody,
  sharedWithMe,
  treeCount,
} from './domain';
import type { Folder, Note } from './types';

const ME = 'PERME';
const person = (id: string, firstName = 'An', lastName = 'Trần') => ({ id, firstName, lastName, avatarUrl: null });

function note(o: Partial<Note> = {}): Note {
  return {
    id: 'N1', title: 'Ghi chú', folderId: null, owner: person(ME), content: { format: 2, value: '<p>x</p>' }, text: 'x',
    visibility: 'private', viewers: [], editors: [], viewerDepts: [], editorDepts: [], tags: [],
    created: 1, updated: 2, updatedBy: null, ...o,
  };
}
const folder = (id: string, name: string, parentId: string | null = null): Folder => ({ id, name, parentId, ownerId: ME });

describe('content (long text with three formats)', () => {
  it('reads the JSON string / object the server returns, and bare strings of older data', () => {
    expect(parseContent('{"text_type":3,"value":"# A"}')).toEqual({ format: 3, value: '# A' });
    expect(parseContent({ text_type: 1, value: 'x' })).toEqual({ format: 1, value: 'x' });
    expect(parseContent('{"text_type":1,"value":null}')).toEqual({ format: 1, value: '' });
    expect(parseContent('<p>html</p>')).toEqual({ format: 2, value: '<p>html</p>' });
    expect(parseContent('chữ thường')).toEqual({ format: 1, value: 'chữ thường' });
    expect(parseContent('{oops')).toEqual({ format: 1, value: '{oops' });
    expect(parseContent(null)).toEqual({ format: 2, value: '' });
    expect(parseContent({ text_type: 9, value: 'x' }).format).toBe(2);
  });

  it('saves {text_type, value}; empty → {text_type: 1, value: null} like the Workspace form', () => {
    expect(contentPayload({ format: 3, value: '# A' })).toEqual({ text_type: 3, value: '# A' });
    expect(contentPayload({ format: 2, value: '  ' })).toEqual({ text_type: 1, value: null });
  });
});

describe('records → UI', () => {
  it('keeps only id + name of lookups, people via normalizePerson (no e-mail, phone…)', () => {
    const n = normalizeNote({
      id: 'N9', name: ' Tiêu đề ', folder: { id: 'F1', name: 'Thư mục' },
      owner: { id: ME, first_name: 'An', last_name: 'Trần', email: 'a@x.test' },
      content: '{"text_type":2,"value":"<p>Xin <b>chào</b></p>"}', visibility: 'shared',
      viewers: [{ id: 'P2', first_name: 'Lan' }], editors: ['P3'],
      viewer_departments: [{ id: 'D1', name: 'Phòng A' }], editor_departments: null,
      tags: [{ id: 'T1', name: 'họp' }, { id: 'T1', name: 'họp' }], created: 10, updated: '20', updated_by: 'P2',
    })!;
    expect(n).toMatchObject({ id: 'N9', title: 'Tiêu đề', folderId: 'F1', visibility: 'shared', text: 'Xin chào', created: 10, updated: 20 });
    expect(n.owner).toEqual(person(ME));
    expect(n.viewers.map(p => p.id)).toEqual(['P2']);
    expect(n.editors).toEqual([{ id: 'P3', firstName: '', lastName: '', avatarUrl: null }]);
    expect(n.viewerDepts).toEqual([{ id: 'D1', name: 'Phòng A' }]);
    expect(n.tags).toEqual([{ id: 'T1', name: 'họp' }]);
    expect(normalizeNote({ name: 'no id' })).toBeNull();
    expect(normalizeNote('x')).toBeNull();
  });

  it('visibility: slug, option object or anything odd → private', () => {
    expect(normalizeVisibility('PUBLIC')).toBe('public');
    expect(normalizeVisibility({ slug: 'shared' })).toBe('shared');
    expect(normalizeVisibility('khác')).toBe('private');
    expect(normalizeVisibility(undefined)).toBe('private');
  });

  it('folders, pins, tags and departments', () => {
    expect(normalizeFolder({ id: 'F1', name: '', parent_folder: { id: 'F0' }, owner: { id: ME } })).toEqual({ id: 'F1', name: 'Thư mục chưa đặt tên', parentId: 'F0', ownerId: ME });
    expect(normalizeFolder({ name: 'x' })).toBeNull();
    expect(normalizePin({ id: 'P1', note: { id: 'N1' }, order: '3' })).toEqual({ id: 'P1', noteId: 'N1', order: 3 });
    expect(normalizePin({ id: 'P1' })).toBeNull();
    expect(normalizeRefs(['A', { id: 'B', name: 'b' }, null, 'A'])).toEqual([{ id: 'A', name: '' }, { id: 'B', name: 'b' }]);
    expect(normalizeRefs(undefined)).toEqual([]);
    expect(
      normalizeDepartments([{ id: 'D1', name: 'A', is_active: 1, deleted: 0 }, { id: 'D2', name: 'B', is_active: false }, { id: 'D3', name: 'C', deleted: true }, { id: 'D4' }, { id: 'D5', name: 'E', is_active: 0 }]),
    ).toEqual([{ id: 'D1', name: 'A' }]);
  });
});

describe('request bodies', () => {
  it('notes shared with me: visibility shared AND (me as viewer/editor OR one of my departments)', () => {
    const body = sharedNotesBody(['D1', 'D2']);
    expect(body).toMatchObject({ object_slug: 'notes_content', type: 3, logic_sequence: '1 AND (2 OR 3 OR 4 OR 5)' });
    expect(body.filters.map(f => [f.field, f.op, f.params])).toEqual([
      ['visibility', '=', 'shared'],
      ['viewers', 'in', ['$currentUser']],
      ['editors', 'in', ['$currentUser']],
      ['viewer_departments', 'in', ['D1', 'D2']],
      ['editor_departments', 'in', ['D1', 'D2']],
    ]);
    expect(sharedNotesBody([]).logic_sequence).toBe('1 AND (2 OR 3)');
    expect(myDepartmentsBody().filters[0]).toMatchObject({ field: 'personnel', params: '$currentUser' });
  });

  it('save / delete bodies carry the object of the record; editor fields (empty tags → null)', () => {
    expect(saveBody('OT1', { name: 'A' })).toMatchObject({ object_type: 'OT1', data: { object_type: 'OT1', name: 'A' } });
    expect(saveBody('OT1', { name: 'A' }, 'R1').data.id).toBe('R1');
    expect(deleteRecordsBody('OT1', ['R1'])).toMatchObject({ object_type: 'OT1', ids: ['R1'] });
    expect(noteFields({ title: ' T ', folderId: 'F1', content: { format: 3, value: '# a' }, tags: [] })).toEqual({
      name: 'T', folder: 'F1', content: { text_type: 3, value: '# a' }, tags: null,
    });
  });
});

describe('sharing', () => {
  const shared = note({
    visibility: 'shared',
    viewers: [person('P2', 'Lan', 'Nguyễn'), person('P3', 'Minh', 'Trần')],
    editors: [person('P3', 'Minh', 'Trần')],
    viewerDepts: [{ id: 'D1', name: 'Phòng A' }],
  });

  it('one dialog line per person / department, "edit" winning when listed twice; and back to the four lists', () => {
    const entries = shareEntries(shared);
    expect(entries.map(e => `${e.kind}:${e.id}:${e.role}`)).toEqual(['person:P3:edit', 'person:P2:view', 'department:D1:view']);
    expect(shareFields('shared', entries)).toEqual({
      visibility: 'shared', viewers: ['P2'], editors: ['P3'], viewer_departments: ['D1'], editor_departments: null,
    });
    const after = applyShare(shared, 'public', entries);
    expect(after.visibility).toBe('public');
    expect(after.editors.map(p => p.id)).toEqual(['P3']);
    expect(after.viewerDepts).toEqual([{ id: 'D1', name: 'Phòng A' }]);
  });

  it('who sees and who edits: lists only count while shared; departments count too', () => {
    const other = { ...shared, owner: person('P9') };
    expect(isOwner(shared, ME)).toBe(true);
    expect(sharedWithMe(other, 'P2', [])).toBe(true);
    expect(sharedWithMe(other, 'P5', ['D1'])).toBe(true);
    expect(sharedWithMe(other, 'P5', [])).toBe(false);
    expect(sharedWithMe({ ...other, visibility: 'private' }, 'P2', [])).toBe(false);
    expect(sharedWithMe(shared, ME, [])).toBe(false); // my own note
    expect(canEditNote(other, 'P3', [])).toBe(true);
    expect(canEditNote(other, 'P2', [])).toBe(false);
    expect(canEditNote({ ...other, editorDepts: [{ id: 'D7', name: '' }] }, 'P5', ['D7'])).toBe(true);
    expect(canEditNote({ ...other, visibility: 'public' }, 'P3', [])).toBe(false);
    expect(canEditNote(shared, ME, [])).toBe(true);
    expect(canEditNote(shared, null, [])).toBe(false);
  });
});

describe('tree', () => {
  const folders = [folder('F2', 'Ba', 'F1'), folder('F1', 'An'), folder('F3', 'Cá', 'F2'), folder('F4', 'Vòng', 'F5'), folder('F5', 'Lặp', 'F4'), folder('F6', 'Mồ côi', 'GONE')];
  const notes = [note({ id: 'A', title: 'b', folderId: 'F3' }), note({ id: 'B', title: 'a', folderId: 'F3' }), note({ id: 'C', title: 'Gốc', folderId: null }), note({ id: 'D', title: 'x', folderId: 'NOPE' })];

  it('folder → sub-folder → …, names sorted (vi); loops and lost parents go to the top; counts include sub-folders', () => {
    const tree = buildTree(folders, notes);
    expect(tree.folders.map(n => n.folder.name)).toEqual(['An', 'Lặp', 'Mồ côi', 'Vòng']);
    const an = tree.folders[0];
    expect(an.count).toBe(2);
    expect(an.folders[0].folder.name).toBe('Ba');
    expect(an.folders[0].folders[0].notes.map(n => n.title)).toEqual(['a', 'b']);
    expect(tree.notes.map(n => n.id)).toEqual(['C', 'D']); // no folder / folder gone
    expect(treeCount(tree)).toBe(4);
    expect(folderPath(folders, 'F3').map(f => f.name)).toEqual(['An', 'Ba', 'Cá']);
    expect(folderPath(folders, null)).toEqual([]);
    expect(folderPath(folders, 'F4').map(f => f.id)).toEqual(['F5', 'F4']); // stops at the loop
    // drag and drop: not into itself or a sub-folder, not where it already is
    expect(canMoveFolder(folders, 'F3', null)).toBe(true);
    expect(canMoveFolder(folders, 'F1', null)).toBe(false); // already at the top
    expect(canMoveFolder(folders, 'F1', 'F3')).toBe(false); // its own sub-sub-folder
    expect(canMoveFolder(folders, 'F1', 'F1')).toBe(false);
    expect(canMoveFolder(folders, 'F3', 'F1')).toBe(true);
    expect(canMoveFolder(folders, 'F2', 'F1')).toBe(false); // already there
    expect(canMoveFolder(folders, 'F3', 'NOPE')).toBe(false);
    expect(canMoveFolder(folders, 'NOPE', null)).toBe(false);
    expect(canMoveNote({ folderId: 'F1' }, 'F1')).toBe(false);
    expect(canMoveNote({ folderId: 'F1' }, null)).toBe(true);
    expect(canMoveNote({ folderId: null }, null)).toBe(false);
    expect(canMoveNote(undefined, 'F1')).toBe(false);
    expect(folderOptions(tree).map(o => `${o.depth}:${o.name}`)).toEqual(['0:An', '1:Ba', '2:Cá', '0:Lặp', '0:Mồ côi', '0:Vòng']);
    expect(folderIsEmpty('F3', folders, notes)).toBe(false);
    expect(folderIsEmpty('F1', folders, notes)).toBe(false); // has a sub-folder
    expect(folderIsEmpty('F6', folders, notes)).toBe(true);
  });

  it('search keeps matching notes and their folders; a matching folder name keeps all its notes', () => {
    const tree = buildTree(folders, [...notes, note({ id: 'E', title: 'Họp tuần', folderId: 'F1', text: 'nội dung', tags: [{ id: 'T', name: 'quy-trình' }] })]);
    const byTitle = filterTree(tree, 'hop');
    expect(byTitle.folders.map(n => n.folder.name)).toEqual(['An']);
    expect(byTitle.folders[0].notes.map(n => n.id)).toEqual(['E']);
    expect(byTitle.folders[0].folders).toEqual([]);
    expect(filterTree(tree, 'quy-trinh').folders[0].notes.map(n => n.id)).toEqual(['E']); // tag
    expect(filterTree(tree, 'ca').folders[0].folders[0].folders[0].notes.map(n => n.id)).toEqual(['B', 'A']); // folder "Cá"
    expect(filterTree(tree, '')).toBe(tree);
    expect(noteMatches(note({ text: 'Xin chào' }), 'chao')).toBe(true);
  });

  it('shared notes grouped by owner (names sorted), newest first, search drops empty groups', () => {
    const groups = groupByOwner([
      note({ id: '1', owner: person('P3', 'Minh', 'Trần'), updated: 1, title: 'kế hoạch' }),
      note({ id: '2', owner: person('P2', 'Lan', 'Nguyễn'), updated: 5 }),
      note({ id: '3', owner: person('P2', 'Lan', 'Nguyễn'), updated: 9 }),
    ]);
    expect(groups.map(g => g.key)).toEqual(['P2', 'P3']);
    expect(groups[0].notes.map(n => n.id)).toEqual(['3', '2']);
    expect(filterGroups(groups, 'ke hoach').map(g => g.key)).toEqual(['P3']);
    expect(parseScope('shared')).toBe('shared');
    expect(parseScope('x')).toBe('all');
  });
});
