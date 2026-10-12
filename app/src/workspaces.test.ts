import { describe, expect, it } from 'vitest';
import { ACME, GLOBEX, WS, workspaceFor } from './workspaces';

describe('IDs per Workspace (CONTRIBUTING.md "Data rules")', () => {
  it('picks the set of the host serving the page; localhost and unknown hosts use the reference Workspace (mock, tests)', () => {
    expect(workspaceFor('acme.cogover.example')).toBe(ACME);
    expect(workspaceFor('globex.cogover.example')).toBe(GLOBEX);
    expect(workspaceFor('Globex.cogover.example')).toBe(GLOBEX);
    expect(workspaceFor('localhost')).toBe(ACME);
    expect(WS).toBe(ACME); // jsdom runs on localhost
  });

  it('has every ID filled in for each Workspace', () => {
    const flat = (w: typeof ACME) => [w.workspaceId, w.task, w.taskImages, w.taskDescription, w.taskStatus, w.activity, w.activityImages, w.activityContent, ...Object.values(w.notes), w.settings];
    for (const w of [ACME, GLOBEX]) {
      expect(flat(w).every(id => /^(OT|OF|WS)[A-Za-z0-9]{8,}$/.test(id))).toBe(true);
      expect(new Set(flat(w)).size).toBe(flat(w).length);
    }
    expect(GLOBEX.workspaceId).not.toBe(ACME.workspaceId);
  });
});
