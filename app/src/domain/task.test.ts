import { describe, expect, it } from 'vitest';
import { ME, person, task } from '../test/fixtures';
import {
  DONE_STATUSES,
  OPEN_STATUSES,
  STATUS_ORDER,
  isDoneStatus,
  priorityMeta,
  priorityRank,
  statusMeta,
  statusRank,
} from './status';
import { applyPatch, canEdit, handOverFollower, isEmptyPatch, normalizeTask, patchApplied, patchToFields, peopleChangeAllowed, rolesOf, snapshotFor } from './task';

describe('status & priority', () => {
  it('splits the 7 real statuses into open and done groups', () => {
    expect(STATUS_ORDER).toEqual(['new', 'in_progress', 'pending', 'on_hold', 'resolved', 'closed', 'cancelled']);
    expect(OPEN_STATUSES).toEqual(['new', 'in_progress', 'pending', 'on_hold']);
    expect(DONE_STATUSES).toEqual(['resolved', 'closed', 'cancelled']);
    expect(isDoneStatus('closed')).toBe(true);
    expect(isDoneStatus('pending')).toBe(false);
    expect(isDoneStatus('weird')).toBe(false);
  });

  it('labels and ranks statuses with an explicit workflow rank', () => {
    expect(statusMeta('in_progress')).toMatchObject({ label: 'Đang xử lý', tone: 'orange' });
    expect(statusMeta('unknown_slug')).toMatchObject({ label: 'unknown_slug', group: 'open' });
    expect(statusMeta('').label).toBe('—');
    expect(statusRank('new')).toBe(0);
    expect(statusRank('cancelled')).toBe(6);
    expect(statusRank('???')).toBe(-1);
  });

  it('ranks priorities, empty counts as medium', () => {
    expect(priorityRank('urgent')).toBe(4);
    expect(priorityRank('low')).toBe(1);
    expect(priorityRank('')).toBe(2);
    expect(priorityMeta('')).toEqual({ label: '—', tone: 'grey' });
    expect(priorityMeta('high').label).toBe('Cao');
  });
});

describe('normalizeTask', () => {
  it('maps an API row and keeps only allowed personnel fields', () => {
    const t = normalizeTask({
      id: 'TAS1',
      name: 'TAS-1034',
      subject: 'Việc A',
      description: '<p>Mô tả</p>',
      due_date: 1790000000000,
      priority: 'urgent',
      status: { slug: 'pending' },
      reporter: { id: 'P1', first_name: 'Lan', last_name: 'Nguyễn', email: 'x@y.z', birthday: '1990' },
      assignee: [{ id: 'P2', first_name: 'Minh' }],
      ccs: [{ id: 'P3' }, { id: 'P4' }],
      created: '1789000000000',
      updated: 1789500000000,
    });
    expect(t).toMatchObject({
      id: 'TAS1',
      code: 'TAS-1034',
      descText: 'Mô tả',
      dueDate: 1790000000000,
      priority: 'urgent',
      status: 'pending',
      created: 1789000000000,
    });
    expect(t?.reporter).toEqual({ id: 'P1', firstName: 'Lan', lastName: 'Nguyễn', avatarUrl: null });
    expect(t?.assignee?.id).toBe('P2');
    expect(t?.ccs.map(p => p.id)).toEqual(['P3', 'P4']);
  });

  it('copes with missing values', () => {
    const t = normalizeTask({ id: 'TAS2', priority: 'nonsense', status: null, subject: null });
    expect(t).toMatchObject({ subject: '', priority: '', status: 'new', dueDate: null, reporter: null, ccs: [] });
    expect(normalizeTask({ subject: 'no id' })).toBeNull();
    expect(normalizeTask(null)).toBeNull();
    expect(normalizeTask({ id: 7, status: ['closed'] })?.status).toBe('closed');
  });
});

describe('roles and editing rights', () => {
  const other = person('OTHER', 'Lan', 'Nguyễn');
  it('detects every role of the current user', () => {
    const t = task({ assignee: person(ME), reporter: other, ccs: [person(ME)] });
    expect(rolesOf(t, ME)).toEqual(['assignee', 'cc']);
    expect(rolesOf(t, null)).toEqual([]);
  });

  it('lets only the assignee or reporter edit', () => {
    expect(canEdit(task({ assignee: other, reporter: person(ME) }), ME)).toBe(true);
    expect(canEdit(task({ assignee: person(ME), reporter: other }), ME)).toBe(true);
    expect(canEdit(task({ assignee: other, reporter: other, ccs: [person(ME)] }), ME)).toBe(false);
    expect(canEdit(task({ assignee: null, reporter: null }), ME)).toBe(false);
  });

  it('allows people changes that keep me reporter or assignee, or hand over a task assigned to me', () => {
    const third = person('THIRD', 'Hà', 'Lê');
    const mine = task({ assignee: person(ME), reporter: other });
    expect(peopleChangeAllowed(mine, { assignee: third }, ME)).toBe(true); // handing over
    expect(peopleChangeAllowed(mine, { reporter: third }, ME)).toBe(true); // still the assignee
    const given = task({ assignee: other, reporter: person(ME) });
    expect(peopleChangeAllowed(given, { assignee: third }, ME)).toBe(true); // still the reporter
    expect(peopleChangeAllowed(given, { reporter: third }, ME)).toBe(false); // would be neither
    expect(peopleChangeAllowed(mine, { assignee: third }, null)).toBe(false);
  });

  it('names the replaced assignee to ask about following, unless already a follower or the reporter', () => {
    const third = person('THIRD', 'Hà', 'Lê');
    expect(handOverFollower(task({ assignee: person(ME), reporter: other }), { assignee: third })?.id).toBe(ME);
    expect(handOverFollower(task({ assignee: other, reporter: person(ME) }), { assignee: third })?.id).toBe('OTHER');
    expect(handOverFollower(task({ assignee: person(ME), reporter: person(ME) }), { assignee: third })).toBeNull();
    expect(handOverFollower(task({ assignee: person(ME), reporter: other }), { assignee: third, reporter: person(ME) })).toBeNull();
    expect(handOverFollower(task({ assignee: person(ME), reporter: other, ccs: [person(ME)] }), { assignee: third })).toBeNull();
    expect(handOverFollower(task({ assignee: null, reporter: other }), { assignee: third })).toBeNull();
    expect(handOverFollower(task({ assignee: third, reporter: other }), { assignee: third })).toBeNull();
    expect(handOverFollower(task({ assignee: person(ME), reporter: other }), { reporter: third })).toBeNull();
  });
});

describe('patches', () => {
  it('applies, snapshots and detects patches', () => {
    const t = task({ subject: 'A', status: 'new', description: '<p>x</p>', descText: 'x' });
    const patch = { subject: 'B', status: 'resolved', description: '<p>y</p>', dueDate: 5, priority: 'low' as const, reporter: person('R'), assignee: person('S') };
    const next = applyPatch(t, patch, 99);
    expect(next).toMatchObject({ subject: 'B', status: 'resolved', descText: 'y', dueDate: 5, priority: 'low', updated: 99 });
    expect(patchApplied(next, patch)).toBe(true);
    expect(patchApplied(t, patch)).toBe(false);
    const back = snapshotFor(t, patch);
    expect(back).toMatchObject({ subject: 'A', status: 'new', description: '<p>x</p>' });
    expect(applyPatch(next, back)).toMatchObject({ subject: 'A', status: 'new' });
    expect(snapshotFor(task({ dueDate: null, priority: '', reporter: null, assignee: null }), patch)).toEqual({
      subject: 'Việc thử',
      description: '',
      status: 'new',
    });
  });

  it('converts a patch into API fields (people → ids)', () => {
    expect(patchToFields({ subject: 'X', dueDate: 1, priority: 'high', status: 'new', description: '', reporter: person('R'), assignee: person('S') })).toEqual({
      subject: 'X',
      due_date: 1,
      priority: 'high',
      status: 'new',
      description: '',
      reporter: 'R',
      assignee: 'S',
    });
    expect(isEmptyPatch({})).toBe(true);
    expect(isEmptyPatch({ subject: 'x' })).toBe(false);
  });
});

describe('attachments on tasks', () => {
  const metaA = { file_id: 'FA', fileName: 'a.pdf', fileSize: 10 };
  const metaB = { file_id: 'FB', fileName: 'b.png', fileSize: 20 };

  it('reads attachment_files (JSON strings or objects) into the task', () => {
    const t = normalizeTask({ id: 'T1', attachment_files: [JSON.stringify(metaA), metaB] })!;
    expect(t.attachments.map(a => a.fileId)).toEqual(['FA', 'FB']);
    expect(normalizeTask({ id: 'T2' })!.attachments).toEqual([]);
  });

  it('writes the whole list, null when emptied, and rolls back to the previous list', () => {
    const t = normalizeTask({ id: 'T1', attachment_files: [metaA] })!;
    const [b] = normalizeTask({ id: 'X', attachment_files: [metaB] })!.attachments;
    const patch = { attachments: [...t.attachments, b] };
    expect(patchToFields(patch)).toEqual({ attachment_files: [metaA, metaB] });
    expect(patchToFields({ attachments: [] })).toEqual({ attachment_files: null });
    const next = applyPatch(t, patch);
    expect(next.attachments.map(a => a.fileId)).toEqual(['FA', 'FB']);
    expect(patchApplied(next, patch)).toBe(true);
    expect(patchApplied(t, patch)).toBe(false);
    expect(snapshotFor(t, patch)).toEqual({ attachments: t.attachments });
  });
});
