import { MENTION_PAGE_SIZE, PERSONNEL_OBJECT_SLUG, TASK_OBJECT_SLUG, TASK_OBJECT_TYPE_ID, TASK_VIEW_LAYOUT_ID } from '../config';
import { normalizePerson } from './people';
import type { ListBody, ListFilter } from './requests';
import type { Person } from './types';

/** Someone who can be @mentioned: a personnel record with a Workspace account (CONTRACT §5.3f). */
export interface MentionCandidate {
  person: Person;
  email: string;
}

/** The record a note is about: written on every mention span so Cogover links the notification to it. */
export interface MentionContext {
  objectId: string;
  recordId: string;
  /** Path of the record page; `{record_id}` is the note, as Cogover's own editor writes it. */
  redirect: string;
}

export interface MentionSource {
  search: (query: string, signal: AbortSignal) => Promise<MentionCandidate[]>;
  context: MentionContext;
}

export const mentionContextForTask = (taskId: string): MentionContext => ({
  objectId: TASK_OBJECT_TYPE_ID,
  recordId: taskId,
  redirect: `/o/${TASK_OBJECT_SLUG}/${taskId}?layoutId=${TASK_VIEW_LAYOUT_ID}&activityId={record_id}`,
});

/** Inline style of the pill, exactly as Cogover's editor writes it (its timeline shows the span as is). */
export const MENTION_STYLE =
  'background-color: var(--gray-10, rgb(245, 245, 245)); padding: 2px 6px; border-radius: 999999px; color: var(--typography-primary, rgb(26, 26, 26));';

const NAME_FIELDS = ['first_last_name', 'last_first_name', 'first_name', 'last_name'];

/**
 * People search behind "@" — the query of Cogover's own mention list (any name field matches, people with an
 * account only, not me, not deleted) plus the account e-mail, so typing part of an e-mail finds the person too.
 */
export function mentionPeopleBody(query: string, meId: string | null, size = MENTION_PAGE_SIZE): ListBody {
  const q = query.trim();
  const like = (field: string): ListFilter => ({ field, op: 'like', params: q, fieldType: 'short_text' });
  const filters: ListFilter[] = [
    ...NAME_FIELDS.map(like),
    like('account_email'),
    { field: 'account_email', op: 'not null', params: null, fieldType: 'email' },
    { field: 'deleted', op: '!=', params: 1, fieldType: 'boolean' },
  ];
  if (meId) filters.push({ field: 'id', op: '!=', params: meId, fieldType: 'short_text' });
  return {
    object_slug: PERSONNEL_OBJECT_SLUG,
    type: 3,
    logic_sequence: `(1 OR 2 OR 3 OR 4 OR 5) AND 6 AND 7${meId ? ' AND 8' : ''}`,
    filters,
    fields: ['id', 'first_name', 'last_name', 'account_email', 'avatar'],
    sorts: [],
    order_direction: 'next',
    search_after: [],
    size,
  };
}

export function normalizeCandidates(rows: unknown[]): MentionCandidate[] {
  const out: MentionCandidate[] = [];
  for (const row of rows) {
    const person = normalizePerson(row);
    if (!person || out.some(c => c.person.id === person.id)) continue;
    const email = typeof (row as { account_email?: unknown })?.account_email === 'string' ? String((row as { account_email: string }).account_email).trim() : '';
    out.push({ person, email });
  }
  return out;
}

/** Longest text after "@" still read as a name or e-mail being typed. */
const MAX_QUERY = 40;

/**
 * The "@…" being typed right before the caret, if any: `at` is the offset of "@" in `before` (the text of the
 * caret's text node up to the caret). "@" must start the text or follow a space / opening bracket (so e-mail
 * addresses are left alone); up to three words, no line break, no second "@".
 */
export function mentionQueryAt(before: string): { at: number; query: string } | null {
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  if (at > 0 && !/[\s ([{"'“‘]/.test(before[at - 1])) return null;
  const query = before.slice(at + 1).replace(/ /g, ' ');
  if (query.length > MAX_QUERY || /^\s/.test(query) || /[\n@]/.test(query) || /\s{2}/.test(query)) return null;
  if ((query.trim().match(/\s+/g) ?? []).length > 2) return null;
  return { at, query };
}
