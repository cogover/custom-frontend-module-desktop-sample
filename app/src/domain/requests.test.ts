import { describe, expect, it } from 'vitest';
import {
  createBody,
  deleteBody,
  doneCountBody,
  doneTasksBody,
  meBody,
  openTasksBody,
  peopleBody,
  scopeFor,
  taskByIdBody,
  updateBody,
} from './requests';

describe('list bodies', () => {
  it('asks for my open tasks: (assignee OR reporter OR follower) AND open status', () => {
    const b = openTasksBody();
    expect(b).toMatchObject({
      object_slug: 'task',
      type: 3,
      logic_sequence: '(1 OR 2 OR 3) AND 4',
      sorts: [{ due_date: { order: 'asc' } }],
      order_direction: 'next',
      search_after: [],
      size: 100,
    });
    expect(b.filters).toEqual([
      { field: 'assignee', op: '=', params: '$currentUser', fieldType: 'lookup_normal' },
      { field: 'reporter', op: '=', params: '$currentUser', fieldType: 'lookup_normal' },
      { field: 'ccs', op: 'in', params: ['$currentUser'], fieldType: 'lookup_normal' },
      { field: 'status', op: 'in', params: ['new', 'in_progress', 'pending', 'on_hold'], fieldType: 'single_choice' },
    ]);
    expect(b.fields[0]).toBe('id');
    expect(b.fields).toEqual(['id', 'name', 'subject', 'description', 'due_date', 'priority', 'status', 'reporter', 'assignee', 'ccs', 'attachment_files', '_attachments', 'created', 'updated']);
  });

  it('pages done tasks by last update and counts them with size 1', () => {
    const cursor = [1789000000000, 'TAS9'];
    const b = doneTasksBody(['assignee', 'reporter', 'cc'], cursor)!;
    expect(b.sorts).toEqual([{ updated: { order: 'desc' } }]);
    expect(b.search_after).toBe(cursor);
    expect(b.filters[3].params).toEqual(['resolved', 'closed', 'cancelled']);
    expect(doneCountBody(['assignee'])!.size).toBe(1);
  });

  it('scopes done tasks to the ticked roles only', () => {
    const status = { field: 'status', op: 'in', params: ['resolved', 'closed', 'cancelled'], fieldType: 'single_choice' };
    const assignee = { field: 'assignee', op: '=', params: '$currentUser', fieldType: 'lookup_normal' };
    const reporter = { field: 'reporter', op: '=', params: '$currentUser', fieldType: 'lookup_normal' };
    const cc = { field: 'ccs', op: 'in', params: ['$currentUser'], fieldType: 'lookup_normal' };
    // one role → plain AND (type 1)
    expect(doneCountBody(['assignee'])).toMatchObject({ type: 1, logic_sequence: '', filters: [assignee, status] });
    expect(doneCountBody(['cc'])).toMatchObject({ type: 1, logic_sequence: '', filters: [cc, status] });
    // two roles → (1 OR 2) AND 3, whatever order they were ticked in
    expect(doneCountBody(['reporter', 'assignee'])).toMatchObject({ type: 3, logic_sequence: '(1 OR 2) AND 3', filters: [assignee, reporter, status] });
    expect(doneTasksBody(['cc', 'reporter'])).toMatchObject({ type: 3, logic_sequence: '(1 OR 2) AND 3', filters: [reporter, cc, status] });
    // three roles → same scope as the open-task query
    expect(doneTasksBody(['cc', 'reporter', 'assignee'])).toMatchObject({ type: 3, logic_sequence: '(1 OR 2 OR 3) AND 4', filters: [assignee, reporter, cc, status] });
    // "Tôi giao người khác" = reporter is me AND assignee is not me (checked on the reference Workspace: `!=` + $currentUser works)
    const notMine = { field: 'assignee', op: '!=', params: '$currentUser', fieldType: 'lookup_normal' };
    expect(doneCountBody(['delegated'])).toMatchObject({ type: 1, logic_sequence: '', filters: [reporter, notMine, status] });
    expect(doneTasksBody(['delegated', 'cc'])).toMatchObject({ type: 3, logic_sequence: '(1 OR (2 AND 3)) AND 4', filters: [cc, reporter, notMine, status] });
    expect(doneTasksBody(['delegated', 'assignee'])).toMatchObject({ type: 3, logic_sequence: '(1 OR (2 AND 3)) AND 4', filters: [assignee, reporter, notMine, status] });
    // …and part of "Tôi giao": not asked again when both are ticked
    expect(doneTasksBody(['delegated', 'reporter'])).toMatchObject({ type: 1, logic_sequence: '', filters: [reporter, status] });
    // nothing ticked → no query at all (an empty filter list is rejected with r: 25)
    expect(doneCountBody([])).toBeNull();
    expect(doneTasksBody([])).toBeNull();
    expect(scopeFor([], ['new'])).toBeNull();
  });

  it('reads one task, me and the active personnel', () => {
    expect(taskByIdBody('TAS1')).toMatchObject({
      type: 1,
      logic_sequence: '',
      size: 1,
      filters: [{ field: 'id', op: '=', params: 'TAS1', fieldType: 'short_text' }],
    });
    expect(meBody()).toMatchObject({
      object_slug: 'personnel',
      type: 1,
      filters: [{ field: 'id', op: '=', params: '$currentUser', fieldType: 'short_text' }],
      fields: ['id', 'first_name', 'last_name', 'avatar'],
    });
    expect(peopleBody(['x'])).toMatchObject({
      object_slug: 'personnel',
      filters: [{ field: 'status', op: '=', params: 'ACTIVE', fieldType: 'single_choice' }],
      fields: ['id', 'first_name', 'last_name', 'avatar', 'work_status'],
      sorts: [{ first_name: { order: 'asc' } }],
      search_after: ['x'],
      size: 100,
    });
  });

  it('never sends an empty filter list or a missing type', () => {
    for (const b of [openTasksBody(), doneCountBody(['assignee'])!, doneCountBody(['assignee', 'cc'])!, taskByIdBody('x'), meBody(), peopleBody()]) {
      expect(b.filters.length).toBeGreaterThan(0);
      expect([1, 2, 3]).toContain(b.type);
    }
  });
});

describe('write bodies', () => {
  it('wraps create/update data with workspace and object type', () => {
    expect(createBody({ subject: 'A' })).toEqual({
      workspace_id: 'WSDEMO0000001',
      object_type: 'OTDEMOTASK001',
      client_time_zone: 'Asia/Saigon',
      data: { object_type: 'OTDEMOTASK001', workspace_id: 'WSDEMO0000001', subject: 'A' },
    });
    expect(updateBody('TAS1', { status: 'resolved' }).data).toEqual({
      object_type: 'OTDEMOTASK001',
      workspace_id: 'WSDEMO0000001',
      status: 'resolved',
      id: 'TAS1',
    });
    expect(deleteBody(['TAS1'])).toEqual({ workspace_id: 'WSDEMO0000001', object_type: 'OTDEMOTASK001', ids: ['TAS1'] });
  });
});
