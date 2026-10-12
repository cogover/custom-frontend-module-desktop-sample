import { API_PATHS, MAX_PAGES, REQ_SERVICE } from '../config';
import { normalizePeople, normalizePerson } from '../domain/people';
import { meBody, peopleBody, type ListBody } from '../domain/requests';
import type { Person } from '../domain/types';
import { ApiError, apiPost } from '../api/client';
import {
  deleteRecordsBody,
  departmentsBody,
  foldersBody,
  myDepartmentsBody,
  myNotesBody,
  normalizeDepartments,
  normalizeFolder,
  normalizeNote,
  normalizePin,
  normalizeRef,
  normalizeRefs,
  noteByIdBody,
  pinsBody,
  saveBody,
  sharedNotesBody,
  tagsBody,
} from './domain';
import { NOTES_OBJECTS } from './notesConfig';
import type { Folder, Note, Pin, Ref } from './types';

interface ListData {
  total?: unknown;
  rows?: unknown;
  search_after?: unknown;
}

async function listPage(body: ListBody): Promise<{ rows: unknown[]; total: number; searchAfter: unknown[]; last: boolean }> {
  const data = (await apiPost<ListData>(API_PATHS.list, REQ_SERVICE.list, body)) ?? {};
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const total = typeof data.total === 'number' ? data.total : Number(data.total) || rows.length;
  const searchAfter = Array.isArray(data.search_after) ? data.search_after : [];
  return { rows, total, searchAfter, last: rows.length < body.size || searchAfter.length === 0 };
}

/** Follows `search_after` (sent back verbatim) until a short page or `total` rows. */
async function listAll(makeBody: (searchAfter: unknown[]) => ListBody): Promise<unknown[]> {
  const all: unknown[] = [];
  let searchAfter: unknown[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await listPage(makeBody(searchAfter));
    all.push(...page.rows);
    if (page.last || all.length >= page.total) break;
    searchAfter = page.searchAfter;
  }
  return all;
}

const keep = <T,>(rows: unknown[], normalize: (r: unknown) => T | null) => rows.map(normalize).filter((x): x is T => x !== null);

async function create(objectId: string, fields: Record<string, unknown>, what: string): Promise<string> {
  const data = await apiPost<{ id?: unknown }>(API_PATHS.save, REQ_SERVICE.create, saveBody(objectId, fields));
  const id = typeof data?.id === 'string' ? data.id : data?.id != null ? String(data.id) : '';
  if (!id) throw new ApiError(`Máy chủ không trả về mã ${what} vừa tạo.`);
  return id;
}

async function update(objectId: string, id: string, fields: Record<string, unknown>): Promise<void> {
  await apiPost<unknown>(API_PATHS.save, REQ_SERVICE.update, saveBody(objectId, fields, id));
}

async function remove(objectId: string, ids: string[]): Promise<void> {
  const data = await apiPost<{ deleted?: unknown; not_deleted?: unknown }>(API_PATHS.remove, REQ_SERVICE.remove, deleteRecordsBody(objectId, ids));
  const notDeleted = Array.isArray(data?.not_deleted) ? data.not_deleted : [];
  if (notDeleted.length) throw new ApiError('Máy chủ không xoá được bản ghi (có thể bạn không có quyền xoá).');
}

/** Everything the notes app reads and writes (CONTRACT §9.4). */
export interface NotesApi {
  getMe(): Promise<Person>;
  listFolders(): Promise<Folder[]>;
  listMyNotes(): Promise<Note[]>;
  /** Ids of the departments I belong to; [] when they cannot be read. */
  listMyDepartments(): Promise<string[]>;
  /** Notes shared with me (my own notes dropped by the caller). */
  listSharedNotes(deptIds: readonly string[]): Promise<Note[]>;
  getNote(id: string): Promise<Note | null>;
  listPins(): Promise<Pin[]>;
  listTags(): Promise<Ref[]>;
  listDepartments(): Promise<Ref[]>;
  listPeople(): Promise<Person[]>;
  createFolder(name: string, parentId: string | null, ownerId: string): Promise<string>;
  renameFolder(id: string, name: string): Promise<void>;
  /** Puts a folder under another one (null = top level). */
  moveFolder(id: string, parentId: string | null): Promise<void>;
  deleteFolder(id: string): Promise<void>;
  createNote(fields: Record<string, unknown>): Promise<string>;
  updateNote(id: string, fields: Record<string, unknown>): Promise<void>;
  deleteNote(id: string): Promise<void>;
  createPin(noteId: string, order: number, personId: string): Promise<string>;
  deletePin(id: string): Promise<void>;
  createTag(name: string): Promise<string>;
}

export const notesApi: NotesApi = {
  async getMe() {
    const me = normalizePerson((await listPage(meBody())).rows[0]);
    if (!me) throw new ApiError('Không xác định được người dùng đang đăng nhập.');
    return me;
  },
  async listFolders() {
    return keep(await listAll(foldersBody), normalizeFolder);
  },
  async listMyNotes() {
    return keep(await listAll(myNotesBody), normalizeNote);
  },
  async listMyDepartments() {
    try {
      const rows = await listAll(myDepartmentsBody);
      return [...new Set(rows.map(r => normalizeRef((r as { department?: unknown })?.department)?.id).filter((x): x is string => !!x))];
    } catch {
      return []; // without the org chart only what is shared with me personally shows
    }
  },
  async listSharedNotes(deptIds) {
    return keep(await listAll(s => sharedNotesBody(deptIds, s)), normalizeNote);
  },
  async getNote(id) {
    const note = normalizeNote((await listPage(noteByIdBody(id))).rows[0]);
    return note && note.id === id ? note : null;
  },
  async listPins() {
    return keep(await listAll(pinsBody), normalizePin);
  },
  async listTags() {
    return normalizeRefs(await listAll(tagsBody)).filter(t => t.name);
  },
  async listDepartments() {
    return normalizeDepartments(await listAll(departmentsBody));
  },
  async listPeople() {
    return normalizePeople(await listAll(peopleBody));
  },
  createFolder: (name, parentId, ownerId) => create(NOTES_OBJECTS.folder.id, { name, parent_folder: parentId, owner: ownerId }, 'thư mục'),
  renameFolder: (id, name) => update(NOTES_OBJECTS.folder.id, id, { name }),
  moveFolder: (id, parentId) => update(NOTES_OBJECTS.folder.id, id, { parent_folder: parentId }),
  deleteFolder: id => remove(NOTES_OBJECTS.folder.id, [id]),
  createNote: fields => create(NOTES_OBJECTS.note.id, fields, 'ghi chú'),
  updateNote: (id, fields) => update(NOTES_OBJECTS.note.id, id, fields),
  deleteNote: id => remove(NOTES_OBJECTS.note.id, [id]),
  createPin: (noteId, order, personId) => create(NOTES_OBJECTS.pin.id, { note: noteId, order, person: personId }, 'ghim'),
  deletePin: id => remove(NOTES_OBJECTS.pin.id, [id]),
  createTag: name => create(NOTES_OBJECTS.tag.id, { name }, 'thẻ'),
};
