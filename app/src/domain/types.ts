import type { Attachment } from './attachments';

export type StatusSlug = 'new' | 'in_progress' | 'pending' | 'on_hold' | 'resolved' | 'closed' | 'cancelled';
export type PrioritySlug = 'urgent' | 'high' | 'medium' | 'low';
export type Tone = 'red' | 'orange' | 'green' | 'sky' | 'violet' | 'teal' | 'blue' | 'grey';

/** Only the personnel fields the UI is allowed to keep (CONTRACT §4: id, names, avatar). */
export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
}

export interface Task {
  id: string;
  /** Record name, e.g. "TAS-1034". */
  code: string;
  subject: string;
  /** Raw HTML as stored by Cogover. */
  description: string;
  /** Plain text of the description (search + card). */
  descText: string;
  /** ms epoch */
  dueDate: number | null;
  priority: PrioritySlug | '';
  status: string;
  reporter: Person | null;
  assignee: Person | null;
  ccs: Person[];
  /** `attachment_files` (FILE_METADATA kept verbatim). */
  attachments: Attachment[];
  /** `_attachments`: FILE_METADATA of the pictures inside the description (kept verbatim). */
  descImages: Record<string, unknown>[];
  created: number | null;
  updated: number | null;
}

/** Fields the UI may change. People are passed as Person (the API receives their id). */
export interface TaskPatch {
  subject?: string;
  description?: string;
  dueDate?: number;
  priority?: PrioritySlug;
  status?: string;
  reporter?: Person;
  assignee?: Person;
  /** The whole new list (kept + new files). */
  attachments?: Attachment[];
  /** The whole new `_attachments` list (sent only when pictures were added to the description). */
  descImages?: Record<string, unknown>[];
  /** Followers (quick edit in the detail view); none → `null` is sent. */
  ccs?: Person[];
}

export interface TaskInput {
  subject: string;
  description: string;
  dueDate: number;
  priority: PrioritySlug;
  status: string;
  reporter: Person;
  assignee: Person;
  /** Followers picked in the form; empty or missing → `ccs` not sent (the Workspace default applies). */
  ccs?: Person[];
  attachments: Attachment[];
  /** `_attachments` of the pictures pasted into the description ([] → not sent). */
  descImages: Record<string, unknown>[];
}

export type Role = 'assignee' | 'reporter' | 'cc';
/** A choice of the "Vai trò" filter: one of my roles, or "Tôi giao người khác" (I am the reporter, someone else the assignee). */
export type RoleFilter = Role | 'delegated';
