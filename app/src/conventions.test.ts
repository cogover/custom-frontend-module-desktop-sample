import { describe, expect, it } from 'vitest';

// CONTRIBUTING.md "Interface rules": form controls come from shadcn/ui (Radix); the source is checked as text.
const sources = import.meta.glob(['./**/*.tsx', '!./**/*.test.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts', '!./test/**'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('conventions (CONTRIBUTING.md)', () => {
  it('reads the app sources', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(40);
  });

  it('uses the shadcn Select, never a native <select>', () => {
    const native = Object.entries(sources)
      .filter(([, src]) => /<select[\s>]/.test(src))
      .map(([file]) => file);
    expect(native).toEqual([]);
  });

  it('keeps Object / field / Workspace IDs in workspaces.ts only (one set per Workspace)', () => {
    const hardcoded = Object.entries({ ...sources, ...modules })
      .filter(([file, src]) => file !== './workspaces.ts' && /['"](OT|OF|WS)[A-Za-z0-9]{10,13}['"]/.test(src))
      .map(([file]) => file);
    expect(hardcoded).toEqual([]);
  });
});
