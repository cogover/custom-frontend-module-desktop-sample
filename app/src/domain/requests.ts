// Request bodies for the Cogover Records API (CONTRACT §4). Pure functions, no I/O.
import {
  CLIENT_TIME_ZONE,
  PAGE_SIZE,
  PERSONNEL_OBJECT_SLUG,
  TASK_OBJECT_SLUG,
  TASK_OBJECT_TYPE_ID,
  WORKSPACE_ID,
} from '../config';
import { DONE_STATUSES, OPEN_STATUSES } from './status';
import type { Role, RoleFilter } from './types';

export interface ListFilter {
  field: string;
  op: '=' | 'in' | 'like' | 'not null' | '!=';
  params: unknown;
  fieldType: string;
}

export interface ListBody {
  object_slug: string;
  type: 1 | 2 | 3;
  logic_sequence: string;
  filters: ListFilter[];
  fields: string[];
  sorts: Record<string, { order: 'asc' | 'desc' }>[];
  order_direction: 'next';
  search_after: unknown[];
  size: number;
}

export const TASK_FIELDS = [
  'id', 'name', 'subject', 'description', 'due_date', 'priority', 'status',
  'reporter', 'assignee', 'ccs', 'attachment_files', '_attachments', 'created', 'updated',
];
export const PERSON_FIELDS = ['id', 'first_name', 'last_name', 'avatar'];

const IS_REPORTER: ListFilter = { field: 'reporter', op: '=', params: '$currentUser', fieldType: 'lookup_normal' };
/** Server filters of each "Vai trò" choice (several = AND): "Tôi giao người khác" = I report it, the assignee is not me. */
const ROLE_FILTER: Record<RoleFilter, ListFilter[]> = {
  assignee: [{ field: 'assignee', op: '=', params: '$currentUser', fieldType: 'lookup_normal' }],
  reporter: [IS_REPORTER],
  cc: [{ field: 'ccs', op: 'in', params: ['$currentUser'], fieldType: 'lookup_normal' }],
  delegated: [IS_REPORTER, { field: 'assignee', op: '!=', params: '$currentUser', fieldType: 'lookup_normal' }],
};
/** Filter order sent to the server (same as the verified contract body). */
const ROLE_QUERY_ORDER: RoleFilter[] = ['assignee', 'reporter', 'cc', 'delegated'];
/** My roles on a task: every task of mine has at least one ("Tôi giao người khác" is part of "Tôi giao"). */
export const ALL_ROLES: Role[] = ['assignee', 'reporter', 'cc'];

export interface Scope {
  type: 1 | 3;
  logic_sequence: string;
  filters: ListFilter[];
}

/**
 * "My tasks" for the given roles: (role 1 OR role 2 …) AND status in `statuses`.
 * One role → type 1 (plain AND); two or more → type 3 with a logic sequence.
 * No role → null: the caller must not query (an empty filter list is rejected, r: 25).
 */
export function scopeFor(roles: readonly RoleFilter[], statuses: readonly string[]): Scope | null {
  // "Tôi giao người khác" is part of "Tôi giao": not asked again when both are ticked
  const picked = ROLE_QUERY_ORDER.filter(r => roles.includes(r) && !(r === 'delegated' && roles.includes('reporter')));
  if (picked.length === 0) return null;
  const filters: ListFilter[] = [];
  const groups = picked.map(r => {
    const at = ROLE_FILTER[r].map(f => filters.push(f));
    return at.length > 1 ? `(${at.join(' AND ')})` : String(at[0]);
  });
  filters.push({ field: 'status', op: 'in', params: [...statuses], fieldType: 'single_choice' });
  if (picked.length === 1) return { type: 1, logic_sequence: '', filters };
  return { type: 3, logic_sequence: `(${groups.join(' OR ')}) AND ${filters.length}`, filters };
}

function taskList(scope: Scope, sorts: ListBody['sorts'], searchAfter: unknown[], size: number): ListBody {
  return {
    object_slug: TASK_OBJECT_SLUG,
    type: scope.type,
    logic_sequence: scope.logic_sequence,
    filters: scope.filters,
    fields: TASK_FIELDS,
    sorts,
    order_direction: 'next',
    search_after: searchAfter,
    size,
  };
}

/** Open tasks are always loaded for all three roles; the role filter is applied in the browser. */
export const openTasksBody = (searchAfter: unknown[] = []) =>
  taskList(scopeFor(ALL_ROLES, OPEN_STATUSES)!, [{ due_date: { order: 'asc' } }], searchAfter, PAGE_SIZE);

/** Done tasks are queried for the ticked roles only; null when no role is ticked. */
export function doneTasksBody(roles: readonly RoleFilter[], searchAfter: unknown[] = [], size = PAGE_SIZE): ListBody | null {
  const scope = scopeFor(roles, DONE_STATUSES);
  return scope ? taskList(scope, [{ updated: { order: 'desc' } }], searchAfter, size) : null;
}

/** Counting needs one row only: `data.total` is what we read. */
export const doneCountBody = (roles: readonly RoleFilter[]) => doneTasksBody(roles, [], 1);

export function taskByIdBody(id: string): ListBody {
  return {
    object_slug: TASK_OBJECT_SLUG,
    type: 1,
    logic_sequence: '',
    filters: [{ field: 'id', op: '=', params: id, fieldType: 'short_text' }],
    fields: TASK_FIELDS,
    sorts: [],
    order_direction: 'next',
    search_after: [],
    size: 1,
  };
}

export function meBody(): ListBody {
  return {
    object_slug: PERSONNEL_OBJECT_SLUG,
    type: 1,
    logic_sequence: '',
    filters: [{ field: 'id', op: '=', params: '$currentUser', fieldType: 'short_text' }],
    fields: PERSON_FIELDS,
    sorts: [],
    order_direction: 'next',
    search_after: [],
    size: 1,
  };
}

export function peopleBody(searchAfter: unknown[] = []): ListBody {
  return {
    object_slug: PERSONNEL_OBJECT_SLUG,
    type: 1,
    logic_sequence: '',
    filters: [{ field: 'status', op: '=', params: 'ACTIVE', fieldType: 'single_choice' }],
    fields: [...PERSON_FIELDS, 'work_status'],
    sorts: [{ first_name: { order: 'asc' } }],
    order_direction: 'next',
    search_after: searchAfter,
    size: PAGE_SIZE,
  };
}

export interface SaveBody {
  workspace_id: string;
  object_type: string;
  client_time_zone: string;
  data: Record<string, unknown>;
}

export function createBody(fields: Record<string, unknown>): SaveBody {
  return {
    workspace_id: WORKSPACE_ID,
    object_type: TASK_OBJECT_TYPE_ID,
    client_time_zone: CLIENT_TIME_ZONE,
    data: { object_type: TASK_OBJECT_TYPE_ID, workspace_id: WORKSPACE_ID, ...fields },
  };
}

/** Partial update: only the changed fields plus the record id. */
export function updateBody(id: string, fields: Record<string, unknown>): SaveBody {
  return {
    workspace_id: WORKSPACE_ID,
    object_type: TASK_OBJECT_TYPE_ID,
    client_time_zone: CLIENT_TIME_ZONE,
    data: { object_type: TASK_OBJECT_TYPE_ID, workspace_id: WORKSPACE_ID, ...fields, id },
  };
}

export function deleteBody(ids: string[]) {
  return { workspace_id: WORKSPACE_ID, object_type: TASK_OBJECT_TYPE_ID, ids: [...ids] };
}
