// Fixed identifiers of the "Ghi chú" objects on the Workspace (CONTRACT §9). Nothing here is a secret.
import type { LoadingText } from '../config';
import { WS } from '../workspaces';

export const NOTES_LOADING: LoadingText = { title: 'Đang tải ghi chú…', sub: 'Lấy thư mục và ghi chú của bạn từ Cogover.' };

/** The four objects of the notes app (the reference Workspace: imported 2026-10-04; IDs per Workspace in workspaces.ts). */
export const NOTES_OBJECTS = {
  /** Folders: `name`, `parent_folder` (→ notes_cat), `owner` (→ personnel). */
  folder: { slug: 'notes_cat', id: WS.notes.folder },
  /** Notes: `name`, `folder`, `owner`, `content` (plain / rich / markdown), `visibility` and the four share lists. */
  note: { slug: 'notes_content', id: WS.notes.note },
  /** Tags anyone can create: `name`. */
  tag: { slug: 'notes_tag', id: WS.notes.tag },
  /** One pin of one person: `person`, `note` (reference: deleted with the note), `order`. */
  pin: { slug: 'notes_pin', id: WS.notes.pin },
} as const;

/** Departments and who belongs to them (system objects). */
export const DEPARTMENT_SLUG = 'department';
export const DEPARTMENT_MEMBER_SLUG = 'department_personnel';

export const NOTE_FIELDS = [
  'id', 'name', 'folder', 'owner', 'content', 'visibility',
  'viewers', 'viewer_departments', 'editors', 'editor_departments', 'tags',
  'created', 'updated', 'updated_by',
];
export const FOLDER_FIELDS = ['id', 'name', 'parent_folder', 'owner', 'updated'];

export const NOTES_STORAGE = {
  /** Left rail on desktop: `{ width, hidden }` (same rules as Công việc, own key and default width). */
  side: 'ghi-chu.side',
  /** Quick filter: "mine" | "shared" | "all". */
  scope: 'ghi-chu.scope',
  /** Ids of the folders left open in the tree. */
  expanded: 'ghi-chu.expanded',
  /** "1" when "Trên trang này" (table of contents) is shown beside the note. */
  toc: 'ghi-chu.toc',
} as const;

/** Default width of the notes rail (px); min/max are shared with Công việc. */
export const NOTES_SIDE_DEFAULT = 300;

/** Longest content the field accepts (`character_limit.max`). */
export const NOTE_CONTENT_MAX = 65000;
