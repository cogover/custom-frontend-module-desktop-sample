import { attachmentsField, parseAttachments, sameAttachments } from './attachments';
import { parseInlineMetas } from './inlineImages';
import { toMs } from './dates';
import { normalizePeople, normalizePerson } from './people';
import { isKnownPriority, isDoneStatus } from './status';
import { htmlToText } from './text';
import type { Person, Role, Task, TaskPatch } from './types';

function slugOf(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) return slugOf(v[0]);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return slugOf(o.slug ?? o.value ?? o.id ?? '');
  }
  return '';
}

const text = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/** Turns an API row into the UI model. Returns null when the row has no id. */
export function normalizeTask(row: unknown): Task | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const id = text(r.id).trim();
  if (!id) return null;
  const description = text(r.description);
  const priority = slugOf(r.priority);
  return {
    id,
    code: text(r.name).trim(),
    subject: text(r.subject),
    description,
    descText: htmlToText(description),
    dueDate: toMs(r.due_date),
    priority: isKnownPriority(priority) ? priority : '',
    status: slugOf(r.status) || 'new',
    reporter: normalizePerson(r.reporter),
    assignee: normalizePerson(r.assignee),
    ccs: normalizePeople(r.ccs),
    attachments: parseAttachments(r.attachment_files),
    descImages: parseInlineMetas(r._attachments),
    created: toMs(r.created),
    updated: toMs(r.updated),
  };
}

export const isDone = (t: Pick<Task, 'status'>) => isDoneStatus(t.status);

export function rolesOf(t: Task, meId: string | null | undefined): Role[] {
  if (!meId) return [];
  const roles: Role[] = [];
  if (t.assignee?.id === meId) roles.push('assignee');
  if (t.reporter?.id === meId) roles.push('reporter');
  if (t.ccs.some(p => p.id === meId)) roles.push('cc');
  return roles;
}

/** "Tôi giao người khác": I gave the task (reporter) to someone else (assignee not me, or nobody). */
export const delegatedBy = (t: Task, meId: string | null | undefined): boolean => !!meId && t.reporter?.id === meId && t.assignee?.id !== meId;

/** Only the assignee or the reporter may change a task; followers (ccs) only read it. */
export function canEdit(t: Task, meId: string | null | undefined): boolean {
  const roles = rolesOf(t, meId);
  return roles.includes('assignee') || roles.includes('reporter');
}

/**
 * Reporter / assignee changes I may save: I stay the reporter or the assignee, or I hand over a task assigned
 * to me (CONTRACT §5.3g — then I am asked whether to keep following it).
 */
export function peopleChangeAllowed(t: Task, patch: Pick<TaskPatch, 'reporter' | 'assignee'>, meId: string | null | undefined): boolean {
  const reporter = patch.reporter ?? t.reporter;
  const assignee = patch.assignee ?? t.assignee;
  if (reporter?.id === meId || assignee?.id === meId) return true;
  return !!patch.assignee && !!meId && t.assignee?.id === meId;
}

/**
 * The assignee a patch replaces, when it is worth asking whether they should follow the task (`ccs`): not when
 * there was none, they are already a follower, or they are (or become) the reporter.
 */
export function handOverFollower(t: Task, patch: Pick<TaskPatch, 'reporter' | 'assignee'>): Person | null {
  const old = t.assignee;
  if (!patch.assignee || !old || old.id === patch.assignee.id) return null;
  if ((patch.reporter ?? t.reporter)?.id === old.id) return null;
  if (t.ccs.some(p => p.id === old.id)) return null;
  return old;
}

/** Applies a patch locally (keeps descText in sync). */
export function applyPatch(t: Task, patch: TaskPatch, now?: number): Task {
  const next: Task = { ...t };
  if (patch.subject !== undefined) next.subject = patch.subject;
  if (patch.description !== undefined) {
    next.description = patch.description;
    next.descText = htmlToText(patch.description);
  }
  if (patch.dueDate !== undefined) next.dueDate = patch.dueDate;
  if (patch.priority !== undefined) next.priority = patch.priority;
  if (patch.status !== undefined) next.status = patch.status;
  if (patch.reporter !== undefined) next.reporter = patch.reporter;
  if (patch.assignee !== undefined) next.assignee = patch.assignee;
  if (patch.attachments !== undefined) next.attachments = patch.attachments;
  if (patch.descImages !== undefined) next.descImages = patch.descImages;
  if (patch.ccs !== undefined) next.ccs = patch.ccs;
  if (now !== undefined) next.updated = now;
  return next;
}

/** The subset of `t` that a patch would overwrite (used to roll back a failed write). */
export function snapshotFor(t: Task, patch: TaskPatch): TaskPatch {
  const back: TaskPatch = {};
  if (patch.subject !== undefined) back.subject = t.subject;
  if (patch.description !== undefined) back.description = t.description;
  if (patch.dueDate !== undefined && t.dueDate != null) back.dueDate = t.dueDate;
  if (patch.priority !== undefined && t.priority) back.priority = t.priority;
  if (patch.status !== undefined) back.status = t.status;
  if (patch.reporter !== undefined && t.reporter) back.reporter = t.reporter;
  if (patch.assignee !== undefined && t.assignee) back.assignee = t.assignee;
  if (patch.attachments !== undefined) back.attachments = t.attachments;
  if (patch.descImages !== undefined) back.descImages = t.descImages;
  if (patch.ccs !== undefined) back.ccs = t.ccs;
  return back;
}

const samePerson = (a: Person | null | undefined, b: Person | null | undefined) => (a?.id ?? '') === (b?.id ?? '');
/** Same people, in any order. */
export const samePeople = (a: readonly Person[], b: readonly Person[]) =>
  a.length === b.length && a.every(p => b.some(q => q.id === p.id));
const sameFileIds = (a: readonly Record<string, unknown>[], b: readonly Record<string, unknown>[]) =>
  a.length === b.length && a.every((m, i) => String(m.file_id) === String(b[i].file_id));

/** True when every field of `patch` already has that value on `t`. */
export function patchApplied(t: Task, patch: TaskPatch): boolean {
  return (
    (patch.subject === undefined || t.subject === patch.subject) &&
    (patch.description === undefined || t.description === patch.description) &&
    (patch.dueDate === undefined || t.dueDate === patch.dueDate) &&
    (patch.priority === undefined || t.priority === patch.priority) &&
    (patch.status === undefined || t.status === patch.status) &&
    (patch.reporter === undefined || samePerson(t.reporter, patch.reporter)) &&
    (patch.assignee === undefined || samePerson(t.assignee, patch.assignee)) &&
    (patch.attachments === undefined || sameAttachments(t.attachments, patch.attachments)) &&
    (patch.descImages === undefined || sameFileIds(t.descImages, patch.descImages)) &&
    (patch.ccs === undefined || samePeople(t.ccs, patch.ccs))
  );
}

/** Patch API fields: people become their personnel id. */
export function patchToFields(patch: TaskPatch): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  if (patch.subject !== undefined) f.subject = patch.subject;
  if (patch.description !== undefined) f.description = patch.description;
  if (patch.dueDate !== undefined) f.due_date = patch.dueDate;
  if (patch.priority !== undefined) f.priority = patch.priority;
  if (patch.status !== undefined) f.status = patch.status;
  if (patch.reporter !== undefined) f.reporter = patch.reporter.id;
  if (patch.assignee !== undefined) f.assignee = patch.assignee.id;
  // the whole list; none left → null (`[]` is refused by the Workspace)
  if (patch.attachments !== undefined) f.attachment_files = attachmentsField([], patch.attachments) ?? null;
  // pictures of the description: the whole list, only sent when some were added (never [] or null)
  if (patch.descImages?.length) f._attachments = patch.descImages;
  // followers: personnel ids; none left → null (as the Workspace clears a multi lookup)
  if (patch.ccs !== undefined) f.ccs = patch.ccs.length ? patch.ccs.map(p => p.id) : null;
  return f;
}

export const isEmptyPatch = (p: TaskPatch) => Object.keys(p).length === 0;
