/**
 * Activities of a task (Object `activity`, linked by its lookup `Task` — CONTRACT §4 "Activities", §5.3c):
 * the timeline shown under the description, and the notes added from it.
 */
import { ACTIVITY_OBJECT_SLUG, ACTIVITY_OBJECT_TYPE_ID, ACTIVITY_PAGE_SIZE, CLIENT_TIME_ZONE, WORKSPACE_ID } from '../config';
import { parseAttachments, type Attachment } from './attachments';
import { toMs } from './dates';
import { normalizePerson } from './people';
import type { ListBody, SaveBody } from './requests';
import { sanitizeDescription } from './sanitize';
import type { Person } from './types';

export interface Activity {
  id: string;
  /** `activity_type` slug: note, task, call, meeting, email, sms, chat, facebook_comment, chat_zalo_fb… */
  type: string;
  /** Subject (`name`, may be empty). */
  subject: string;
  /** Content HTML as stored (CKEditor HTML for notes written on Cogover). */
  content: string;
  author: Person | null;
  /** ms epoch: `activity_time`, else `created`. */
  at: number | null;
  files: Attachment[];
}

/** Labels of `activity_type` (as Cogover shows them in Vietnamese). */
export const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  note: 'Ghi chú',
  task: 'Công việc',
  call: 'Gọi điện',
  meeting: 'Họp',
  email: 'Email',
  sms: 'SMS',
  chat: 'Chat',
  facebook_comment: 'Facebook',
  chat_zalo_fb: 'Live-chat',
};

export const activityTypeLabel = (type: string) => ACTIVITY_TYPE_LABEL[type] ?? (type || 'Hoạt động');

export const ACTIVITY_FIELDS = ['id', 'name', 'activity_type', 'content', 'created', 'created_by', 'activity_time', 'files'];

const text = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

function slugOf(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) return slugOf(v[0]);
  if (v && typeof v === 'object') return slugOf((v as Record<string, unknown>).slug ?? (v as Record<string, unknown>).value ?? '');
  return '';
}

/** API row → activity; null without an id. */
export function normalizeActivity(row: unknown): Activity | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const id = text(r.id).trim();
  if (!id) return null;
  return {
    id,
    type: slugOf(r.activity_type) || 'note',
    subject: text(r.name).trim(),
    content: text(r.content),
    author: normalizePerson(r.created_by),
    at: toMs(r.activity_time) ?? toMs(r.created),
    files: parseAttachments(r.files),
  };
}

/**
 * Content HTML for display: pictures saved by Cogover's editor keep a `{resolution_size}` placeholder in
 * their src (it is filled when shown) — use the original size; then the display sanitiser.
 */
export function activityHtml(content: string): string {
  const filled = content.replace(/\{resolution_size\}|%7Bresolution_size%7D/gi, 'original');
  return sanitizeDescription(filled);
}

/** The timeline of a task, newest first, one page. */
export function activitiesBody(taskId: string, searchAfter: unknown[] = [], size = ACTIVITY_PAGE_SIZE): ListBody {
  return {
    object_slug: ACTIVITY_OBJECT_SLUG,
    type: 1,
    logic_sequence: '',
    filters: [{ field: 'Task', op: '=', params: taskId, fieldType: 'lookup_normal' }],
    fields: ACTIVITY_FIELDS,
    sorts: [{ created: { order: 'desc' } }],
    order_direction: 'next',
    search_after: searchAfter,
    size,
  };
}

/** One activity; `withImages` also reads its `_attachments` (pictures of the content, needed to edit a note). */
export function activityByIdBody(id: string, withImages = false): ListBody {
  return {
    object_slug: ACTIVITY_OBJECT_SLUG,
    type: 1,
    logic_sequence: '',
    filters: [{ field: 'id', op: '=', params: id, fieldType: 'short_text' }],
    fields: withImages ? [...ACTIVITY_FIELDS, '_attachments'] : ACTIVITY_FIELDS,
    sorts: [],
    order_direction: 'next',
    search_after: [],
    size: 1,
  };
}

export interface NewNote {
  taskId: string;
  /** Clean HTML from the editor. */
  html: string;
  /** FILE_METADATA of pictures pasted into the note (its `_attachments`). */
  images: Record<string, unknown>[];
}

/**
 * A note on the task, written like the notes Cogover's own timeline creates (CONTRACT §4). Notes have no
 * subject here, but `name` must be present: sent empty (null or missing is refused with r: 602).
 */
export function noteBody(note: NewNote, now: number): SaveBody {
  const data: Record<string, unknown> = {
    object_type: ACTIVITY_OBJECT_TYPE_ID,
    workspace_id: WORKSPACE_ID,
    activity_type: 'note',
    note_type: 'normal',
    name: '',
    content: note.html,
    Task: note.taskId,
    source_object: 'task',
    source_record: note.taskId,
    manual_log: 1,
    activity_time: now,
  };
  if (note.images.length) data._attachments = note.images;
  return { workspace_id: WORKSPACE_ID, object_type: ACTIVITY_OBJECT_TYPE_ID, client_time_zone: CLIENT_TIME_ZONE, data };
}

/** Only my own notes can be changed or deleted here (other kinds come from calls, e-mails… and stay as logged). */
export function canManageActivity(a: Activity, meId: string | null | undefined): boolean {
  return a.type === 'note' && !!meId && a.author?.id === meId;
}

export interface NoteEdit {
  id: string;
  /** Clean HTML from the editor. */
  html: string;
  /** The note's `_attachments` after the edit (stored ones + pictures pasted now); omitted when none were pasted. */
  attachments?: Record<string, unknown>[];
}

/** Partial update of a note: its content (and `_attachments` when pictures were pasted). */
export function noteUpdateBody(edit: NoteEdit): SaveBody {
  const data: Record<string, unknown> = { object_type: ACTIVITY_OBJECT_TYPE_ID, workspace_id: WORKSPACE_ID, id: edit.id, content: edit.html };
  if (edit.attachments) data._attachments = edit.attachments;
  return { workspace_id: WORKSPACE_ID, object_type: ACTIVITY_OBJECT_TYPE_ID, client_time_zone: CLIENT_TIME_ZONE, data };
}

export function activityDeleteBody(ids: string[]) {
  return { workspace_id: WORKSPACE_ID, object_type: ACTIVITY_OBJECT_TYPE_ID, ids: [...ids] };
}
