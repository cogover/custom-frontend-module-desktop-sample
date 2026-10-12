import type { Person } from '../domain/types';

/** `visibility` of a note: private (owner only), shared (owner + the four lists), public (whole Workspace). */
export type Visibility = 'private' | 'shared' | 'public';

/** `text_type` of the long text: 1 plain text, 2 rich text (HTML), 3 Markdown. */
export type ContentFormat = 1 | 2 | 3;

export interface NoteContent {
  format: ContentFormat;
  value: string;
}

/** A lookup shown by its name only (folder, department, tag). */
export interface Ref {
  id: string;
  name: string;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  ownerId: string | null;
}

export interface Note {
  id: string;
  title: string;
  folderId: string | null;
  owner: Person | null;
  content: NoteContent;
  /** Plain text of the content (search, empty check). */
  text: string;
  visibility: Visibility;
  viewers: Person[];
  editors: Person[];
  viewerDepts: Ref[];
  editorDepts: Ref[];
  tags: Ref[];
  created: number | null;
  updated: number | null;
  updatedBy: Person | null;
}

/** One pin of the signed-in person (`notes_pin`). */
export interface Pin {
  id: string;
  noteId: string;
  order: number;
}

/** Quick filter of the rail. */
export type Scope = 'mine' | 'shared' | 'all';

export type ShareRole = 'view' | 'edit';

/** One line of the share dialog: a person or a department, allowed to view or to edit. */
export interface ShareEntry {
  kind: 'person' | 'department';
  id: string;
  name: string;
  person?: Person;
  role: ShareRole;
}

/** What the editor hands back when a note is saved. */
export interface NoteDraft {
  title: string;
  folderId: string | null;
  content: NoteContent;
  tags: Ref[];
}
