import { describe, expect, it } from 'vitest';
import { ACME, GLOBEX, WS, workspaceFor, type WorkspaceIds } from './workspaces';

const ALL = [ACME, GLOBEX];
/** Object, field and Workspace IDs of a set (the layout ID has its own prefix, checked apart). */
const flat = (w: WorkspaceIds) => [w.workspaceId, w.task, w.taskImages, w.taskDescription, w.taskStatus, w.activity, w.activityImages, w.activityContent, ...Object.values(w.notes), w.settings];

describe('IDs per Workspace (CONTRIBUTING.md "Data rules")', () => {
  it('picks the set of the host serving the page; localhost and unknown hosts use the reference Workspace (mock, tests)', () => {
    expect(workspaceFor('acme.cogover.example')).toBe(ACME);
    expect(workspaceFor('globex.cogover.example')).toBe(GLOBEX);
    expect(workspaceFor('Globex.cogover.example')).toBe(GLOBEX);
    expect(workspaceFor('localhost')).toBe(ACME);
    expect(WS).toBe(ACME); // jsdom runs on localhost
  });

  it('has every ID filled in for each Workspace', () => {
    for (const w of ALL) {
      expect(flat(w)).toHaveLength(13);
      expect(flat(w).every(id => /^(OT|OF|WS)[A-Za-z0-9]{8,}$/.test(id))).toBe(true);
      expect(new Set(flat(w)).size).toBe(flat(w).length);
      expect(w.workspaceId).toMatch(/^WS/);
      for (const objectId of [w.task, w.activity, ...Object.values(w.notes), w.settings]) expect(objectId).toMatch(/^OT/);
      for (const fieldId of [w.taskImages, w.taskDescription, w.taskStatus, w.activityImages, w.activityContent]) expect(fieldId).toMatch(/^OF/);
    }
    expect(GLOBEX.workspaceId).not.toBe(ACME.workspaceId);
  });

  it('shares no ID between two Workspaces (a set copied from another one would write to the wrong Object)', () => {
    const every = ALL.flatMap(w => [...flat(w), w.taskViewLayout]);
    expect(new Set(every).size).toBe(every.length);
  });

  it('keeps the detail layout of `task` per Workspace (the link an @mention stores)', () => {
    for (const w of ALL) expect(w.taskViewLayout).toMatch(/^LO[A-Za-z0-9]{8,}$/);
    expect(ACME.taskViewLayout).toBe('LODEMOLAYOUT1'); // the mock and the tests repeat this one
    expect(GLOBEX.taskViewLayout).toBe('LODEMO2LAYOUT');
  });
});
