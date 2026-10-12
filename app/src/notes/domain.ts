// "Ghi chú": records ↔ UI types, request bodies, the folder tree and who may do what (CONTRACT §9).
// Pure functions, no I/O.
import { CLIENT_TIME_ZONE, PAGE_SIZE, WORKSPACE_ID } from '../config';
import { normalizePeople, normalizePerson, personName } from '../domain/people';
import type { ListBody, ListFilter } from '../domain/requests';
import { fold } from '../domain/text';
import type { Person } from '../domain/types';
import { contentText } from './markdown';
import { DEPARTMENT_MEMBER_SLUG, DEPARTMENT_SLUG, FOLDER_FIELDS, NOTE_FIELDS, NOTES_OBJECTS } from './notesConfig';
import type { ContentFormat, Folder, Note, NoteContent, NoteDraft, Pin, Ref, Scope, ShareEntry, ShareRole, Visibility } from './types';

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
};
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const looksLikeHtml = (s: string) => /<[a-z][\s\S]*>/i.test(s);

// ---------- content ----------

/**
 * `content` is a long text with three formats on: the server stores `{"text_type": N, "value": …}` and returns it
 * as a JSON string (sometimes already parsed). A bare string (older data) is read as HTML or plain text.
 */
export function parseContent(raw: unknown): NoteContent {
  let v = raw;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s.startsWith('{')) return { format: looksLikeHtml(s) ? 2 : 1, value: v };
    try {
      v = JSON.parse(s);
    } catch {
      return { format: looksLikeHtml(s) ? 2 : 1, value: v as string };
    }
  }
  const o = obj(v);
  if (!o) return { format: 2, value: '' };
  const t = Number(o.text_type);
  const format: ContentFormat = t === 1 || t === 2 || t === 3 ? t : 2;
  return { format, value: typeof o.value === 'string' ? o.value : '' };
}

/** What `content` is saved as; empty → `{text_type: 1, value: null}` (what Cogover's own form sends). */
export function contentPayload(c: NoteContent) {
  return c.value.trim() ? { text_type: c.format, value: c.value } : { text_type: 1, value: null };
}

export const FORMAT_LABEL: Record<ContentFormat, string> = { 1: 'Văn bản thuần', 2: 'Văn bản định dạng', 3: 'Markdown' };

// ---------- records → UI ----------

/** A lookup kept as id + name (the server expands it into the whole record; nothing else is kept). */
export function normalizeRef(raw: unknown): Ref | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v === 'string') return v.trim() ? { id: v.trim(), name: '' } : null;
  const o = obj(v);
  if (!o) return null;
  const id = str(o.id);
  return id ? { id, name: str(o.name) } : null;
}

export function normalizeRefs(raw: unknown): Ref[] {
  if (raw == null) return [];
  const out: Ref[] = [];
  for (const item of Array.isArray(raw) ? raw : [raw]) {
    const r = normalizeRef(item);
    if (r && !out.some(x => x.id === r.id)) out.push(r);
  }
  return out;
}

export function normalizeFolder(raw: unknown): Folder | null {
  const o = obj(raw);
  const id = o ? str(o.id) : '';
  if (!o || !id) return null;
  return {
    id,
    name: str(o.name) || 'Thư mục chưa đặt tên',
    parentId: normalizeRef(o.parent_folder)?.id ?? null,
    ownerId: normalizeRef(o.owner)?.id ?? null,
  };
}

const VISIBILITIES: Visibility[] = ['private', 'shared', 'public'];
export function normalizeVisibility(raw: unknown): Visibility {
  const v = (obj(raw) ? str(obj(raw)!.slug ?? obj(raw)!.value) : str(raw)).toLowerCase();
  return (VISIBILITIES as string[]).includes(v) ? (v as Visibility) : 'private';
}

export function normalizeNote(raw: unknown): Note | null {
  const o = obj(raw);
  const id = o ? str(o.id) : '';
  if (!o || !id) return null;
  const content = parseContent(o.content);
  return {
    id,
    title: str(o.name),
    folderId: normalizeRef(o.folder)?.id ?? null,
    owner: normalizePerson(o.owner),
    content,
    text: contentText(content),
    visibility: normalizeVisibility(o.visibility),
    viewers: normalizePeople(o.viewers),
    editors: normalizePeople(o.editors),
    viewerDepts: normalizeRefs(o.viewer_departments),
    editorDepts: normalizeRefs(o.editor_departments),
    tags: normalizeRefs(o.tags),
    created: num(o.created),
    updated: num(o.updated),
    updatedBy: normalizePerson(o.updated_by),
  };
}

export function normalizePin(raw: unknown): Pin | null {
  const o = obj(raw);
  const id = o ? str(o.id) : '';
  const noteId = o ? normalizeRef(o.note)?.id : undefined;
  if (!o || !id || !noteId) return null;
  return { id, noteId, order: num(o.order) ?? 0 };
}

/** Departments still in use (not deleted, not switched off). */
export function normalizeDepartments(rows: unknown[]): Ref[] {
  const out: Ref[] = [];
  for (const row of rows) {
    const o = obj(row);
    if (!o || o.deleted === true || o.deleted === 1 || o.is_active === false || o.is_active === 0) continue; // the server sends 0 / 1
    const r = normalizeRef(o);
    if (r && r.name && !out.some(x => x.id === r.id)) out.push(r);
  }
  return out;
}

// ---------- request bodies ----------

const ME = '$currentUser';
const isMine = (field: string): ListFilter => ({ field, op: '=', params: ME, fieldType: 'lookup_normal' });

function listBody(
  objectSlug: string,
  filters: ListFilter[],
  fields: string[],
  sorts: ListBody['sorts'],
  searchAfter: unknown[] = [],
  extra: Partial<Pick<ListBody, 'type' | 'logic_sequence' | 'size'>> = {},
): ListBody {
  return {
    object_slug: objectSlug,
    type: 1,
    logic_sequence: '',
    filters,
    fields,
    sorts,
    order_direction: 'next',
    search_after: searchAfter,
    size: PAGE_SIZE,
    ...extra,
  };
}

/** My folders (folders are personal: others never see them). */
export const foldersBody = (searchAfter: unknown[] = []) =>
  listBody(NOTES_OBJECTS.folder.slug, [isMine('owner')], FOLDER_FIELDS, [{ name: { order: 'asc' } }], searchAfter);

/** Notes I own, newest first. */
export const myNotesBody = (searchAfter: unknown[] = []) =>
  listBody(NOTES_OBJECTS.note.slug, [isMine('owner')], NOTE_FIELDS, [{ updated: { order: 'desc' } }], searchAfter);

/**
 * Notes shared with me: `visibility` shared AND (I am a viewer or an editor, or one of my departments is).
 * My own notes can match too (I put myself in a list): the caller drops them.
 */
export function sharedNotesBody(deptIds: readonly string[], searchAfter: unknown[] = []): ListBody {
  const filters: ListFilter[] = [
    { field: 'visibility', op: '=', params: 'shared', fieldType: 'single_choice' },
    { field: 'viewers', op: 'in', params: [ME], fieldType: 'lookup_normal' },
    { field: 'editors', op: 'in', params: [ME], fieldType: 'lookup_normal' },
  ];
  if (deptIds.length) {
    filters.push(
      { field: 'viewer_departments', op: 'in', params: [...deptIds], fieldType: 'lookup_normal' },
      { field: 'editor_departments', op: 'in', params: [...deptIds], fieldType: 'lookup_normal' },
    );
  }
  const ors = filters.slice(1).map((_, i) => i + 2).join(' OR ');
  return listBody(NOTES_OBJECTS.note.slug, filters, NOTE_FIELDS, [{ updated: { order: 'desc' } }], searchAfter, {
    type: 3,
    logic_sequence: `1 AND (${ors})`,
  });
}

export const noteByIdBody = (id: string) =>
  listBody(NOTES_OBJECTS.note.slug, [{ field: 'id', op: '=', params: id, fieldType: 'short_text' }], NOTE_FIELDS, [], [], { size: 1 });

export const pinsBody = (searchAfter: unknown[] = []) =>
  listBody(NOTES_OBJECTS.pin.slug, [isMine('person')], ['id', 'note', 'order'], [{ order: { order: 'asc' } }], searchAfter);

const anyRecord: ListFilter = { field: 'id', op: 'not null', params: null, fieldType: 'short_text' };

export const tagsBody = (searchAfter: unknown[] = []) =>
  listBody(NOTES_OBJECTS.tag.slug, [anyRecord], ['id', 'name'], [{ name: { order: 'asc' } }], searchAfter);

/** The departments I belong to (`department_personnel`). */
export const myDepartmentsBody = (searchAfter: unknown[] = []) =>
  listBody(DEPARTMENT_MEMBER_SLUG, [{ field: 'personnel', op: '=', params: ME, fieldType: 'lookup_normal' }], ['id', 'department'], [], searchAfter);

export const departmentsBody = (searchAfter: unknown[] = []) =>
  listBody(DEPARTMENT_SLUG, [anyRecord], ['id', 'name', 'is_active', 'deleted'], [{ name: { order: 'asc' } }], searchAfter);

export interface NotesSaveBody {
  workspace_id: string;
  object_type: string;
  client_time_zone: string;
  data: Record<string, unknown>;
}

/** Create (no id) or partial update (only the changed fields + the id) of a record of `objectId`. */
export function saveBody(objectId: string, fields: Record<string, unknown>, id?: string): NotesSaveBody {
  return {
    workspace_id: WORKSPACE_ID,
    object_type: objectId,
    client_time_zone: CLIENT_TIME_ZONE,
    data: { object_type: objectId, workspace_id: WORKSPACE_ID, ...fields, ...(id ? { id } : {}) },
  };
}

export const deleteRecordsBody = (objectId: string, ids: readonly string[]) => ({ workspace_id: WORKSPACE_ID, object_type: objectId, ids: [...ids] });

const idsOrNull = (list: readonly { id: string }[]) => (list.length ? list.map(x => x.id) : null);

/** Fields of a note written by the editor (title, folder, content, tags). */
export function noteFields(d: NoteDraft): Record<string, unknown> {
  return { name: d.title.trim(), folder: d.folderId, content: contentPayload(d.content), tags: idsOrNull(d.tags) };
}

// ---------- sharing ----------

/** The share lists as dialog lines: one line per person / department, "edit" wins when listed twice. */
export function shareEntries(note: Pick<Note, 'viewers' | 'editors' | 'viewerDepts' | 'editorDepts'>): ShareEntry[] {
  const out: ShareEntry[] = [];
  const add = (e: ShareEntry) => {
    const i = out.findIndex(x => x.kind === e.kind && x.id === e.id);
    if (i < 0) out.push(e);
    else if (e.role === 'edit') out[i] = { ...out[i], role: 'edit' };
  };
  const person = (role: ShareRole) => (p: Person) => add({ kind: 'person', id: p.id, name: personName(p) || p.id, person: p, role });
  const dept = (role: ShareRole) => (d: Ref) => add({ kind: 'department', id: d.id, name: d.name || d.id, role });
  note.editors.forEach(person('edit'));
  note.viewers.forEach(person('view'));
  note.editorDepts.forEach(dept('edit'));
  note.viewerDepts.forEach(dept('view'));
  return out;
}

/** `visibility` + the four lists written from the dialog lines (empty list → null). */
export function shareFields(visibility: Visibility, entries: readonly ShareEntry[]): Record<string, unknown> {
  const pick = (kind: ShareEntry['kind'], role: ShareRole) => idsOrNull(entries.filter(e => e.kind === kind && e.role === role));
  return {
    visibility,
    viewers: pick('person', 'view'),
    editors: pick('person', 'edit'),
    viewer_departments: pick('department', 'view'),
    editor_departments: pick('department', 'edit'),
  };
}

/** The note as it will be once the share fields are saved (kept in the list without reading it back). */
export function applyShare(note: Note, visibility: Visibility, entries: readonly ShareEntry[]): Note {
  const people = (role: ShareRole) => entries.filter(e => e.kind === 'person' && e.role === role).map(e => e.person ?? { id: e.id, firstName: e.name, lastName: '', avatarUrl: null });
  const depts = (role: ShareRole) => entries.filter(e => e.kind === 'department' && e.role === role).map(e => ({ id: e.id, name: e.name }));
  return { ...note, visibility, viewers: people('view'), editors: people('edit'), viewerDepts: depts('view'), editorDepts: depts('edit') };
}

// ---------- who may do what ----------

export const isOwner = (note: Note, meId: string | null) => !!meId && note.owner?.id === meId;

/** Shared with me through one of the lists (not my own note; private / public notes never count). */
export function sharedWithMe(note: Note, meId: string | null, myDepts: readonly string[]): boolean {
  if (!meId || isOwner(note, meId) || note.visibility !== 'shared') return false;
  return (
    note.viewers.some(p => p.id === meId) ||
    note.editors.some(p => p.id === meId) ||
    note.viewerDepts.some(d => myDepts.includes(d.id)) ||
    note.editorDepts.some(d => myDepts.includes(d.id))
  );
}

/** Title / content / tags: the owner, or an editor while the note is shared. */
export function canEditNote(note: Note, meId: string | null, myDepts: readonly string[]): boolean {
  if (isOwner(note, meId)) return true;
  if (!meId || note.visibility !== 'shared') return false;
  return note.editors.some(p => p.id === meId) || note.editorDepts.some(d => myDepts.includes(d.id));
}

// ---------- tree, filters, search ----------

export interface FolderNode {
  folder: Folder;
  folders: FolderNode[];
  notes: Note[];
  /** Notes in this folder and every folder below it. */
  count: number;
}

export interface NotesTree {
  folders: FolderNode[];
  /** My notes without a folder (or whose folder is gone). */
  notes: Note[];
}

const byText = (a: string, b: string) => a.localeCompare(b, 'vi', { sensitivity: 'base' });
export const noteTitle = (n: Pick<Note, 'title'>) => n.title || 'Ghi chú chưa có tiêu đề';

/** My folders as a tree (parent missing or a loop → top level), my notes inside; names sorted (vi). */
export function buildTree(folders: readonly Folder[], notes: readonly Note[]): NotesTree {
  const byId = new Map(folders.map(f => [f.id, f]));
  const inLoop = (f: Folder) => {
    const seen = new Set<string>();
    for (let cur: Folder | undefined = f; cur?.parentId; cur = byId.get(cur.parentId)) {
      if (seen.has(cur.id)) return true;
      seen.add(cur.id);
    }
    return false;
  };
  const nodes = new Map<string, FolderNode>(folders.map(f => [f.id, { folder: f, folders: [], notes: [], count: 0 }]));
  const roots: FolderNode[] = [];
  for (const f of folders) {
    const parent = f.parentId && byId.has(f.parentId) && !inLoop(f) ? nodes.get(f.parentId)! : null;
    (parent ? parent.folders : roots).push(nodes.get(f.id)!);
  }
  const rootNotes: Note[] = [];
  for (const n of notes) (n.folderId && nodes.get(n.folderId) ? nodes.get(n.folderId)!.notes : rootNotes).push(n);
  const finish = (node: FolderNode): number => {
    node.folders.sort((a, b) => byText(a.folder.name, b.folder.name));
    node.notes.sort((a, b) => byText(noteTitle(a), noteTitle(b)));
    node.count = node.notes.length + node.folders.reduce((s, c) => s + finish(c), 0);
    return node.count;
  };
  roots.forEach(finish);
  roots.sort((a, b) => byText(a.folder.name, b.folder.name));
  rootNotes.sort((a, b) => byText(noteTitle(a), noteTitle(b)));
  return { folders: roots, notes: rootNotes };
}

/** Folders from the top level down to `folderId` (for the breadcrumb); [] when unknown. */
export function folderPath(folders: readonly Folder[], folderId: string | null): Folder[] {
  const byId = new Map(folders.map(f => [f.id, f]));
  const path: Folder[] = [];
  const seen = new Set<string>();
  for (let f = folderId ? byId.get(folderId) : undefined; f && !seen.has(f.id); f = f.parentId ? byId.get(f.parentId) : undefined) {
    seen.add(f.id);
    path.unshift(f);
  }
  return path;
}

/**
 * Drag and drop in the tree (CONTRACT §9.3): folder `id` may go under `parentId` (null = top level) unless it is
 * already there, or `parentId` is the folder itself or one of its sub-folders (no loops).
 */
export function canMoveFolder(folders: readonly Folder[], id: string, parentId: string | null): boolean {
  const f = folders.find(x => x.id === id);
  if (!f || (f.parentId ?? null) === parentId) return false;
  if (parentId === null) return true;
  if (!folders.some(x => x.id === parentId)) return false;
  return !folderPath(folders, parentId).some(x => x.id === id);
}

/** A note may be dropped into any of my folders (or the top level) but the one it is in. */
export const canMoveNote = (note: Pick<Note, 'folderId'> | undefined, folderId: string | null): boolean =>
  !!note && (note.folderId ?? null) !== folderId;

/** Every folder as an option, indented by depth, in tree order (the editor's "Thư mục"). */
export function folderOptions(tree: NotesTree): { id: string; name: string; depth: number }[] {
  const out: { id: string; name: string; depth: number }[] = [];
  const walk = (nodes: FolderNode[], depth: number) => {
    for (const n of nodes) {
      out.push({ id: n.folder.id, name: n.folder.name, depth });
      walk(n.folders, depth + 1);
    }
  };
  walk(tree.folders, 0);
  return out;
}

/** Folder ids that hold something (a folder with notes or sub-folders cannot be deleted). */
export const folderIsEmpty = (folderId: string, folders: readonly Folder[], notes: readonly Note[]) =>
  !folders.some(f => f.parentId === folderId) && !notes.some(n => n.folderId === folderId);

/** Accent-insensitive search in the title, the content and the tag names. */
export function noteMatches(note: Note, query: string): boolean {
  if (!query) return true;
  return fold(note.title).includes(query) || fold(note.text).includes(query) || note.tags.some(t => fold(t.name).includes(query));
}

export interface SharedGroup {
  owner: Person | null;
  key: string;
  notes: Note[];
}

/** Notes shared with me, grouped by owner (names sorted), each group newest first. */
export function groupByOwner(notes: readonly Note[]): SharedGroup[] {
  const groups = new Map<string, SharedGroup>();
  for (const n of notes) {
    const key = n.owner?.id ?? '?';
    if (!groups.has(key)) groups.set(key, { owner: n.owner, key, notes: [] });
    groups.get(key)!.notes.push(n);
  }
  const list = [...groups.values()];
  for (const g of list) g.notes.sort((a, b) => (b.updated ?? 0) - (a.updated ?? 0));
  return list.sort((a, b) => byText(personName(a.owner) || '~', personName(b.owner) || '~'));
}

export const SCOPES: { id: Scope; label: string }[] = [
  { id: 'mine', label: 'Cá nhân' },
  { id: 'shared', label: 'Được chia sẻ' },
  { id: 'all', label: 'Tất cả' },
];

export const parseScope = (raw: string | null): Scope => (raw === 'mine' || raw === 'shared' || raw === 'all' ? raw : 'all');

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  private: 'Riêng tư',
  shared: 'Chia sẻ cho người hoặc phòng',
  public: 'Công khai trong Workspace',
};

/**
 * The tree reduced to what matches the search: matching notes and the folders above them; a folder whose name
 * matches keeps all its notes.
 */
export function filterTree(tree: NotesTree, query: string): NotesTree {
  if (!query) return tree;
  const walk = (node: FolderNode, forced: boolean): FolderNode | null => {
    const hit = forced || fold(node.folder.name).includes(query);
    const folders = node.folders.map(c => walk(c, hit)).filter((c): c is FolderNode => c !== null);
    const notes = hit ? node.notes : node.notes.filter(n => noteMatches(n, query));
    if (!hit && !folders.length && !notes.length) return null;
    return { ...node, folders, notes, count: notes.length + folders.reduce((s, c) => s + c.count, 0) };
  };
  return {
    folders: tree.folders.map(n => walk(n, false)).filter((n): n is FolderNode => n !== null),
    notes: tree.notes.filter(n => noteMatches(n, query)),
  };
}

/** Shared groups reduced to the matching notes (empty groups dropped). */
export const filterGroups = (groups: readonly SharedGroup[], query: string): SharedGroup[] =>
  query ? groups.map(g => ({ ...g, notes: g.notes.filter(n => noteMatches(n, query)) })).filter(g => g.notes.length) : [...groups];

/** Notes in a tree (after filtering). */
export const treeCount = (tree: NotesTree) => tree.notes.length + tree.folders.reduce((s, n) => s + n.count, 0);
