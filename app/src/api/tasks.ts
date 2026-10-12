import {
  API_PATHS,
  INLINE_IMAGE_TARGET,
  MAX_PAGES,
  NOTE_CONTENT_FIELD_ID,
  NOTE_IMAGE_TARGET,
  PAGE_SIZE,
  REQ_SERVICE,
  STATUS_FIELD_ID,
  TASK_OBJECT_SLUG,
  TRANSITION_RULE_PATH,
  UPLOAD_TARGET,
} from '../config';
import { parseStatusFlow, type StatusFlow } from '../domain/statusFlow';
import { activitiesBody, activityByIdBody, activityDeleteBody, normalizeActivity, noteBody, noteUpdateBody, type Activity, type NewNote } from '../domain/activities';
import { attachmentFromUpload, type Attachment } from '../domain/attachments';
import { inlineImageFromUpload, mergeInlineMetas, parseInlineMetas, type InlineImage } from '../domain/inlineImages';
import { mentionPeopleBody, normalizeCandidates, type MentionCandidate } from '../domain/mentions';
import { normalizePerson, normalizePeople } from '../domain/people';
import {
  createBody,
  deleteBody,
  doneCountBody,
  doneTasksBody,
  meBody,
  openTasksBody,
  peopleBody,
  taskByIdBody,
  updateBody,
  type ListBody,
} from '../domain/requests';
import { normalizeTask } from '../domain/task';
import type { Person, RoleFilter, Task } from '../domain/types';
import { ApiError, apiGet, apiPost, apiUpload } from './client';

interface ListData {
  total?: unknown;
  rows?: unknown;
  search_after?: unknown;
}

export interface Page<T> {
  rows: T[];
  total: number;
  searchAfter: unknown[];
  /** True when this page was the last one. */
  last: boolean;
}

async function listPage(body: ListBody, signal?: AbortSignal): Promise<Page<unknown>> {
  const data = (await apiPost<ListData>(API_PATHS.list, REQ_SERVICE.list, body, { signal })) ?? {};
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

const toTasks = (rows: unknown[]) => rows.map(normalizeTask).filter((t): t is Task => t !== null);

export interface TaskApi {
  getMe(): Promise<Person>;
  listOpenTasks(): Promise<Task[]>;
  /** Done tasks for the ticked roles; 0 without a request when no role is ticked. */
  countDoneTasks(roles: readonly RoleFilter[]): Promise<number>;
  listDoneTasks(roles: readonly RoleFilter[], searchAfter: unknown[], size?: number): Promise<Page<Task>>;
  getTask(id: string): Promise<Task | null>;
  createTask(fields: Record<string, unknown>): Promise<string>;
  updateTask(id: string, fields: Record<string, unknown>): Promise<void>;
  deleteTasks(ids: string[]): Promise<{ deleted: string[]; notDeleted: string[] }>;
  listPeople(): Promise<Person[]>;
  /** Uploads one file for `attachment_files`; resolves with its FILE_METADATA. */
  uploadFile(file: File, signal?: AbortSignal): Promise<Attachment>;
  /** Uploads a picture of the description to `_attachments` (as Cogover's editor does). */
  uploadInlineImage(file: File, signal?: AbortSignal): Promise<InlineImage>;
  /** One page of the task's timeline (newest first). */
  listActivities(taskId: string, searchAfter?: unknown[]): Promise<Page<Activity>>;
  /** Adds a note to the task and reads it back. */
  createNote(note: NewNote): Promise<Activity>;
  /** Changes the content of a note (pictures pasted now join its `_attachments`) and reads it back. */
  updateNote(id: string, html: string, images: InlineImage[]): Promise<Activity>;
  /** Deletes a note of the timeline. */
  deleteNote(id: string): Promise<void>;
  /** Uploads a picture pasted into a note (the note's `_attachments`). */
  uploadNoteImage(file: File, signal?: AbortSignal): Promise<InlineImage>;
  /** The status workflow (transition rule); null when there is none or it cannot be read. */
  getStatusFlow(): Promise<StatusFlow | null>;
  /** People matching what follows "@" in a note (name or account e-mail), me excluded. */
  searchPeople(query: string, meId: string | null, signal?: AbortSignal): Promise<MentionCandidate[]>;
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(x => (typeof x === 'object' && x ? String((x as { id?: unknown }).id ?? '') : String(x))).filter(Boolean) : [];

export const taskApi: TaskApi = {
  async getMe() {
    const page = await listPage(meBody());
    const me = normalizePerson(page.rows[0]);
    if (!me) throw new ApiError('Không xác định được người dùng đang đăng nhập.');
    return me;
  },

  async listOpenTasks() {
    return toTasks(await listAll(openTasksBody));
  },

  async countDoneTasks(roles) {
    const body = doneCountBody(roles);
    return body ? (await listPage(body)).total : 0;
  },

  async listDoneTasks(roles, searchAfter, size = PAGE_SIZE) {
    const body = doneTasksBody(roles, searchAfter, size);
    if (!body) return { rows: [], total: 0, searchAfter: [], last: true };
    const page = await listPage(body);
    return { ...page, rows: toTasks(page.rows) };
  },

  async getTask(id) {
    const page = await listPage(taskByIdBody(id));
    const task = normalizeTask(page.rows[0]);
    return task && task.id === id ? task : null;
  },

  async createTask(fields) {
    const data = await apiPost<{ id?: unknown }>(API_PATHS.save, REQ_SERVICE.create, createBody(fields));
    const id = typeof data?.id === 'string' ? data.id : data?.id != null ? String(data.id) : '';
    if (!id) throw new ApiError('Máy chủ không trả về mã công việc vừa tạo.');
    return id;
  },

  async updateTask(id, fields) {
    await apiPost<unknown>(API_PATHS.save, REQ_SERVICE.update, updateBody(id, fields));
  },

  async deleteTasks(ids) {
    const data = await apiPost<{ deleted?: unknown; not_deleted?: unknown }>(API_PATHS.remove, REQ_SERVICE.remove, deleteBody(ids));
    return { deleted: strings(data?.deleted), notDeleted: strings(data?.not_deleted) };
  },

  async listPeople() {
    return normalizePeople(await listAll(peopleBody));
  },

  async uploadFile(file, signal) {
    const form = new FormData();
    form.append('field_slug', UPLOAD_TARGET.field_slug);
    form.append('object_slug', UPLOAD_TARGET.object_slug);
    form.append('file', file, file.name);
    try {
      return attachmentFromUpload(await apiUpload<unknown>(API_PATHS.upload, form, { signal }));
    } catch (e) {
      if (e instanceof Error && !(e instanceof ApiError) && e.name !== 'AbortError') throw new ApiError(e.message);
      throw e;
    }
  },

  async uploadInlineImage(file, signal) {
    const form = new FormData();
    form.append('field_id', INLINE_IMAGE_TARGET.field_id);
    form.append('object_id', INLINE_IMAGE_TARGET.object_id);
    form.append('file', file, file.name);
    try {
      return inlineImageFromUpload(await apiUpload<unknown>(API_PATHS.upload, form, { signal }), window.location.origin);
    } catch (e) {
      if (e instanceof Error && !(e instanceof ApiError) && e.name !== 'AbortError') throw new ApiError(e.message);
      throw e;
    }
  },

  async listActivities(taskId, searchAfter = []) {
    const body = activitiesBody(taskId, searchAfter);
    const page = await listPage(body);
    return { ...page, rows: page.rows.map(normalizeActivity).filter((a): a is Activity => a !== null) };
  },

  async createNote(note) {
    const now = Date.now();
    const data = await apiPost<{ id?: unknown }>(API_PATHS.save, REQ_SERVICE.create, noteBody(note, now));
    const id = typeof data?.id === 'string' ? data.id : data?.id != null ? String(data.id) : '';
    if (!id) throw new ApiError('Máy chủ không trả về mã ghi chú vừa tạo.');
    try {
      const back = normalizeActivity((await listPage(activityByIdBody(id))).rows[0]);
      if (back) return back;
    } catch {
      // shown from what was typed; the next load of the timeline brings the stored version
    }
    return { id, type: 'note', subject: '', content: note.html, author: null, at: now, files: [] };
  },

  async updateNote(id, html, images) {
    let attachments: Record<string, unknown>[] | undefined;
    if (images.length) {
      // the stored pictures (read again: they may have changed on Cogover) + the new ones
      const row = (await listPage(activityByIdBody(id, true))).rows[0] as Record<string, unknown> | undefined;
      attachments = mergeInlineMetas(parseInlineMetas(row?._attachments), images);
    }
    await apiPost<unknown>(API_PATHS.save, REQ_SERVICE.update, noteUpdateBody({ id, html, attachments }));
    const back = normalizeActivity((await listPage(activityByIdBody(id)).catch(() => null))?.rows[0]);
    if (!back) throw new ApiError('Không đọc lại được ghi chú vừa sửa.');
    return back;
  },

  async deleteNote(id) {
    const data = await apiPost<{ deleted?: unknown }>(API_PATHS.remove, REQ_SERVICE.remove, activityDeleteBody([id]));
    if (!strings(data?.deleted).includes(id)) throw new ApiError('Không xoá được ghi chú (có thể bạn không có quyền).');
  },

  async uploadNoteImage(file, signal) {
    const form = new FormData();
    form.append('field_id', NOTE_IMAGE_TARGET.field_id);
    form.append('object_id', NOTE_IMAGE_TARGET.object_id);
    form.append('file', file, file.name);
    try {
      return inlineImageFromUpload(await apiUpload<unknown>(API_PATHS.upload, form, { signal }), window.location.origin, NOTE_CONTENT_FIELD_ID);
    } catch (e) {
      if (e instanceof Error && !(e instanceof ApiError) && e.name !== 'AbortError') throw new ApiError(e.message);
      throw e;
    }
  },

  async getStatusFlow() {
    try {
      const rules = await apiGet<unknown>(`${TRANSITION_RULE_PATH}?objectSlug=${TASK_OBJECT_SLUG}`);
      return parseStatusFlow(rules, STATUS_FIELD_ID);
    } catch {
      // not readable (e.g. no access to the object's settings): every status is offered, the server still checks
      return null;
    }
  },

  async searchPeople(query, meId, signal) {
    return normalizeCandidates((await listPage(mentionPeopleBody(query, meId), signal)).rows);
  },
};
