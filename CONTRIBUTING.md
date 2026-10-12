# Contributing

Thanks for your interest. This page lists the conventions the code base follows; `CONTRACT.md` (Vietnamese) is the
detailed specification, and code comments refer to its sections.

## Layout

- `app/` — Vite + React 19 + TypeScript, `radix-ui`, shadcn/ui (Radix flavour), Tailwind v4 (theme + utilities only), Vitest.
  - `src/` Tasks · `src/notes/` Notes · `src/devtools/` Dev tools (no backend) · `src/settings/` Settings ·
    `src/desktop/` dock, windows, URL · `src/components/ui/` shadcn components.
  - `dev/` mock backend for `npm run dev` and the unit tests. Keep it faithful to the real Workspace behaviour when you add an Object or a field.
- `e2e/` — Playwright tests against the built app with a mocked API.

## Interface rules

1. **Form controls come from shadcn/ui (Radix), not from the browser.**
   - One value → `Select` (`src/components/ui/select.tsx`), never a native `<select>` (a test enforces this). People / search → `Popover` + `Command`. Dates → `Popover` + `Calendar`. Dialogs → the `Dialog` / `AlertDialog` primitives of `radix-ui`. Hover information → `HoverCard`.
   - Missing component: copy the **Radix** version from shadcn into `src/components/ui/` and remove every animation / transition class.
   - Triggers carry `data-testid` and `data-value` for the tests.
2. **Font size:** only `var(--fs)` (13.5px) and `var(--fs-h)` (20px, for `h1` / `h2`). No numeric `font-size` (a CSS test enforces this). The letters inside avatars are the only exception.
3. **No transitions, animations, filters or backdrop-filters.** Colours go through tokens (`--ink`, `--surface`, `--accent`…) so light and dark themes follow.
4. UI text is Vietnamese; identifiers and rule / field names are English. Comments are English in `app/`; the end-to-end tests in `e2e/` have Vietnamese titles and comments.
5. A new app on the desktop: add it to `DOCK_APPS` (`src/desktop/apps.tsx`) with `lazyWindow` + `loading`, and an English URL slug in `src/desktop/url.ts` (`?app=<slug>`).

## Data rules

- Object, field and Workspace IDs live in `app/src/workspaces.ts` (one set per hostname; a test keeps them out of the other app sources). One exception today: `TASK_VIEW_LAYOUT_ID` in `app/src/config.ts`, a single value for every hostname. The mock backend and the tests repeat the placeholder IDs of the example set.
- The app talks to the Records API with the user's own session (same-origin cookies, CSRF token from the `XSRF-TOKEN` cookie). Never put a key, token or cookie in the source or in `VITE_*` variables.
- A single-value file field is written as **one** FILE_METADATA object (not an array) and cleared with `null`. Multi-format long text is `{"text_type": n, "value": …}`.

## Before you open a pull request

```bash
cd app
npm run typecheck
npm run test:unit
npm run build
cd ../e2e
npm run test:e2e:local
```

Update `CONTRACT.md` together with the code when behaviour, `data-testid`s or acceptance criteria change.
