// Identifiers of the Workspace serving the page (see CONTRACT.md §2, §4; one set per Workspace in workspaces.ts).
// Nothing here is a secret: the module calls the API with the signed-in user's own session cookie.
import { WS } from './workspaces';

export const WORKSPACE_ID = WS.workspaceId;
export const TASK_OBJECT_TYPE_ID = WS.task;
export const TASK_OBJECT_SLUG = 'task';
export const PERSONNEL_OBJECT_SLUG = 'personnel';
export const CLIENT_TIME_ZONE = 'Asia/Saigon';

/** Same-origin, root-relative API paths (the page itself lives under /_cm_5/). */
export const API_PATHS = {
  list: '/api/v1/records/list',
  save: '/api/v1/records',
  remove: '/api/v1/records/delete',
  /** file server: multipart, CSRF only (no x-req-service / x-req-type) */
  upload: '/api/v1/file/upload/v2/client_upload',
} as const;

/** Upload form fields for task attachments (field `attachment_files` of object `task`). */
export const UPLOAD_TARGET = { field_slug: 'attachment_files', object_slug: 'task' } as const;

/**
 * Pictures inside the description, as Cogover's own editor stores them (CONTRACT §5.3): uploaded to the system
 * file field `_attachments` by field id + object id, linked with `long_text_field_id` = field `description`.
 */
export const INLINE_IMAGE_TARGET = { field_id: WS.taskImages, object_id: TASK_OBJECT_TYPE_ID } as const;
export const DESCRIPTION_FIELD_ID = WS.taskDescription;

/** Object `activity` (timeline of a task: `activity.Task` → task) — CONTRACT §4 "Activities". */
export const ACTIVITY_OBJECT_SLUG = 'activity';
export const ACTIVITY_OBJECT_TYPE_ID = WS.activity;
export const ACTIVITY_PAGE_SIZE = 15;
/** Pictures pasted into a note: its `_attachments`, linked with field `content`. */
export const NOTE_IMAGE_TARGET = { field_id: WS.activityImages, object_id: ACTIVITY_OBJECT_TYPE_ID } as const;
export const NOTE_CONTENT_FIELD_ID = WS.activityContent;

/** Transition rules of an Object (who may move `status` from which value to which) — GET, CONTRACT §4. */
export const TRANSITION_RULE_PATH = '/api/v1/object_security/transition_rule';
/** Field `status` of `task` (the field the "Status" transition rule controls). */
export const STATUS_FIELD_ID = WS.taskStatus;

/** `x-req-service` per operation. */
export const REQ_SERVICE = {
  list: 217,
  create: 10200,
  update: 10201,
  remove: 218,
} as const;

/** `x-req-type` for every request. */
export const REQ_TYPE = 9;

/** The server never returns more than 100 rows per page. */
export const PAGE_SIZE = 100;
/** Safety stop for "load every page" loops. */
export const MAX_PAGES = 50;

export const STORAGE_KEYS = {
  view: 'cong-viec.view.v1',
  theme: 'cong-viec.theme',
  /** "max" when the window fills the whole page (green button), otherwise "normal". */
  window: 'cong-viec.window',
  /** Left rail on desktop: `{ width, hidden }` (CONTRACT §5 1d). */
  side: 'cong-viec.side',
  /** Task list columns: `{ order, hidden, widths }` (user review 2026-10-08). */
  columns: 'cong-viec.columns',
} as const;

/** Width of the left rail on desktop (≥ 881px), in px: drag / ←→ between min and max; double-click → def. */
export const SIDE_WIDTH = { min: 220, max: 420, def: 256 } as const;

export const LEAVE_DELAY_MS = 600;
export const TOAST_MS = 3000;
export const TOAST_ACTION_MS = 6000;

/** Where to send the user to sign in again (Workspace root, same origin). */
export const LOGIN_URL = '/';

/**
 * @mentions in notes (CONTRACT §5.3f): the span Cogover's editor writes points back to the task through its
 * detail layout; the backend notifies the person and marks the span `data-mentioned="true"`. The layout belongs
 * to the Workspace serving the page, like every other ID (workspaces.ts).
 */
export const TASK_VIEW_LAYOUT_ID = WS.taskViewLayout;
/** People shown in the "@" list. */
export const MENTION_PAGE_SIZE = 8;
/** Typing pause before the people search runs. */
export const MENTION_DEBOUNCE_MS = 150;

/** What a window shows while its data loads (the desktop shows the same box while the window's code downloads). */
export interface LoadingText {
  title: string;
  sub: string;
}
export const TASKS_LOADING: LoadingText = { title: 'Đang tải công việc…', sub: 'Lấy danh sách việc của bạn từ Cogover.' };
