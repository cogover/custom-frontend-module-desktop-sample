import { describe, expect, it } from 'vitest';
import devtoolsCss from './devtools/devtools.css?raw';
import notesCss from './notes/notes.css?raw';
import settingsCss from './settings/settings.css?raw';
import css from './styles.css?raw';
import tailwindCss from './tailwind.css?raw';

// CSS is not applied in jsdom, so the app-shell rules are checked as text.
describe('app shell CSS (port of the approved design)', () => {
  const desktop = css.slice(css.indexOf('@media (min-width:881px)'));

  it('makes html, body and the React root fill the window on desktop, so only the list scrolls', () => {
    expect(desktop).toMatch(/html,body,#root\{height:100%\}/);
    expect(desktop).toMatch(/body\{overflow:hidden\}/);
    expect(desktop).toMatch(/\.page\{height:100%;padding-block:32px\}/);
    expect(desktop).toMatch(/\.scroller\{flex:1;min-height:0;overflow-y:auto/);
  });

  it('lays the detail properties on the form grid in two rows, 36px values, one column when the popup is narrow', () => {
    expect(css).toMatch(/\.sheet-body\{container:sheet\/inline-size\}/);
    expect(css).toContain('.v-props .v-row{display:contents}');
    expect(css).toMatch(/\.v-item\{display:flex;flex-wrap:wrap;align-items:center;[^}]*min-height:36px/);
    expect(css).not.toMatch(/\.v-props-grid|\.v-props>div|\.v-props dd/);
    expect(css).toMatch(/\.due-chip\.late\{background:var\(--red-soft\);color:var\(--red\)\}/);
    expect(css).toMatch(/\.due-chip\.soon\{background:var\(--orange-soft\);color:var\(--orange\)\}/);
    expect(css).toMatch(/\.pstack-avatars \.avatar\+\.avatar\{margin-left:-6px\}/);
    expect(css).toMatch(/\.avatar\{[^}]*border-radius:50%/); // round avatars everywhere (photo and initial)
    expect(css).not.toMatch(/\.avatar[^{]*\{[^}]*border-radius:var\(--radius\)/);
    const narrow = css.slice(css.indexOf('@container sheet (max-width:720px){\n  .v-props.f-props'));
    expect(narrow).toMatch(/^@container sheet \(max-width:720px\)\{\n  \.v-props\.f-props\{grid-template-columns:120px minmax\(0,1fr\)/);
    expect(narrow).toMatch(/\.v-props \.f-line,\.v-props \.f-group\{display:contents\}/);
  });

  it('puts the view actions next to the ✕, Xoá turning red on hover and keyboard focus', () => {
    expect(css).toMatch(/\.sheet-actions\{flex:none;display:flex;align-items:center;gap:4px\}/);
    expect(css).toContain('.icon-btn.icon-danger:hover,.icon-btn.icon-danger:focus-visible{background:var(--red-soft);color:var(--red)}');
    expect(css).toMatch(/\.icon-btn\{width:36px;height:36px/);
  });

  it('lets the description use the full popup width, images included', () => {
    expect(css).not.toMatch(/80ch/);
    expect(css).toMatch(/\.v-html img\{max-width:100%;height:auto/);
  });

  it('puts the help button before the theme button without transitions', () => {
    expect(css).toMatch(/\.help-btn\{margin-left:auto\}/);
    expect(css).toMatch(/\.help-btn\+\.theme-btn\{margin-left:0\}/);
  });

  it('keeps the card meta columns compact (status, reporter, assignee, priority, deadline), shared by header and cards', () => {
    // no delete column on the cards (deleting is in the popup)
    // one grid for header and cards, columns from the columns menu (--task-cols); default: tick, code, task, status, people, priority, deadline
    expect(css).toContain('.list-head,.task{display:grid;grid-template-columns:var(--task-cols,22px 76px minmax(0,1fr) 120px 88px 88px 64px 84px);column-gap:12px;align-items:center}');
    expect(css).toContain('.task .meta{display:contents}');
    expect(css).toContain('[data-col="due"]{order:var(--o-due,7)}');
    expect(css).not.toMatch(/(^|[^-\w])\.del[{:\s,]/m);
    // people = avatar only and priority = flag only in the column layout; role, name and label when the meta row wraps
    expect(css).toContain('.task .meta .person .pname,.task .meta .person .prole,.task .meta .prio .prio-label{display:none}');
    const narrow = css.slice(css.indexOf('@container (max-width:980px)'));
    expect(narrow).toContain('.task .meta .person .pname,.task .meta .person .prole,.task .meta .prio .prio-label{display:block}');
    expect(narrow).toMatch(/\.task \.meta \.person \.pshort\{display:none\}/);
    // avatars and flag centred under the column headings
    expect(css).toContain('.list-head [data-col="reporter"],.list-head [data-col="assignee"],.list-head [data-col="priority"]{text-align:center}');
    expect(css).toMatch(/\.task \.meta>\.person,\.task \.meta>\.prio\{justify-self:center\}/);
    // the deadline wraps on at most two lines in its 84px column, one line when the row wraps
    expect(css).toMatch(/\.task \.meta \.due-text\{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden/);
    expect(narrow).toMatch(/\.task \.meta \.due\{align-items:center;white-space:nowrap\}/);
  });

  it('keeps the topbar actions compact (36px) without touching other primary buttons', () => {
    expect(css).toMatch(/\.topbar \.btn-primary\{height:36px;padding:0 14px;gap:6px\}/);
    expect(css).toMatch(/\.topbar \.theme-btn\{width:36px;height:36px\}/);
    expect(css).toMatch(/\.btn-primary\{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:42px;padding:0 18px;/);
  });

  it('draws every locked checkbox with a dashed outline, ticked ones included (AC26)', () => {
    expect(css).toMatch(/\.check input:disabled\+\.box\{background:var\(--surface-2\);border-style:dashed\}/);
    expect(css).toMatch(/\.check input:disabled:checked\+\.box\{background:var\(--green-soft\);border-color:var\(--green\);border-style:dashed\}/);
    expect(css).not.toMatch(/disabled:checked\+\.box\{[^}]*border-style:solid/);
  });

  it('puts the dock on the left edge (bottom on phones) and makes room for it beside the window', () => {
    expect(css).toMatch(/\.dock\{position:fixed;left:var\(--win-gap\);top:50%;/);
    // one gap (16px) around the window and the dock; no max width, so the gaps stay equal on large screens
    expect(css).toContain('.desktop{--win-gap:16px;--dock-w:66px}');
    expect(css).toContain('.desktop .page{padding:var(--win-gap) var(--win-gap) 72px calc(var(--win-gap)*2 + var(--dock-w))}');
    expect(css).toContain('.desktop .board{max-width:none}');
    // 12px between the apps and at both ends (top / bottom; left / right on phones), 8px on the long sides
    expect(css).toMatch(/\.dock\{[^}]*padding:12px 8px;/);
    expect(css).toMatch(/\.dock ul\{[^}]*gap:12px\}/);
    expect(css).toMatch(/\.dock\{left:50%;top:auto;[^}]*padding:8px 12px\}/);
    expect(css).toMatch(/\.desktop\[data-max\] \.page\{padding:0\}/);
    const phone = css.slice(css.lastIndexOf('@media (max-width:640px)'));
    expect(phone).toMatch(/\.dock\{left:50%;top:auto;bottom:/);
    // phones: no wallpaper, the app fills the screen edge to edge (room under it for the dock)
    expect(phone).toContain('body::before{background-image:none;background-color:var(--surface)}');
    expect(phone).toContain('.desktop .page{min-height:100dvh;padding:0 0 calc(88px + env(safe-area-inset-bottom,0px))}');
    expect(phone).toMatch(/\.desktop \.board\{max-width:none;min-height:calc\(100dvh - 88px - env\(safe-area-inset-bottom,0px\)\);border:0;border-radius:0;box-shadow:none\}/);
  });

  it('uses the background photo on its own fixed layer, dimmed in dark mode, with no SVG filters', () => {
    expect(css).not.toMatch(/data:image\/svg|feGaussianBlur|feTurbulence|backdrop-filter|filter:/);
    expect(css).toMatch(
      /body::before\{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;will-change:transform;background-color:var\(--ground\);background-image:var\(--bg-overlay\),var\(--wallpaper,url\("\.\/assets\/bg-default\.webp"\)\);background-position:center;background-size:cover;background-repeat:no-repeat\}/,
    );
    expect(css).toMatch(/body\{margin:0;min-height:100dvh;background:var\(--ground\);/);
    expect(css).toMatch(/--ground:#23758D;/);
    expect(css.match(/--bg-overlay:linear-gradient\(rgba\(8,12,18,\.55\),rgba\(8,12,18,\.55\)\)/g)).toHaveLength(2); // both dark blocks
    expect(css).toMatch(/--bg-overlay:linear-gradient\(transparent,transparent\)/);
  });

  it('lets the photo show through the main frame via --board-alpha (1 = opaque), cards stay solid', () => {
    expect(css.match(/--board-alpha:1;/g)).toHaveLength(3);
    expect(css).toMatch(/\.content\{min-width:0;container-type:inline-size;background:color-mix\(in srgb,var\(--surface\) calc\(var\(--board-alpha\)\*100%\),transparent\)\}/);
    expect(css).toMatch(/\.side\{[^}]*background:color-mix\(in srgb,var\(--side-bg\) calc\(var\(--board-alpha\)\*100%\),transparent\)/);
    expect(css).toMatch(/\.task\{[^}]*background:var\(--card\)/);
  });

  it('draws the card checkbox as a round "mark as done" control, solid green when done', () => {
    expect(css).toMatch(/\.box\{[^}]*border-radius:50%/);
    expect(css).toMatch(/\.check:hover \.box,\.check input:focus-visible\+\.box\{border-color:var\(--green\)\}/);
    expect(css).toMatch(/\.check input:checked\+\.box\{background:var\(--green\);border-color:var\(--green\)\}/);
    expect(css).toMatch(/\.check input:checked\+\.box svg\{color:var\(--on-accent\);stroke:var\(--on-accent\);opacity:1\}/);
  });

  it('lays the form properties out in two rows with a shared label column, one column below 720px', () => {
    expect(css).toMatch(/\.f-props\{display:grid;grid-template-columns:max-content minmax\(0,1fr\);column-gap:12px;row-gap:12px/);
    expect(css).toMatch(/\.f-label\{[^}]*min-height:36px[^}]*white-space:nowrap/);
    expect(css).toMatch(/\.f-line\{display:flex;flex-wrap:wrap/);
    expect(css).toMatch(/\.f-pair\{display:grid;grid-template-columns:minmax\(0,1fr\) max-content minmax\(0,1fr\)/);
    expect(css).toMatch(/\.prio-flag\{flex:none;color:var\(--tone\)\}/);
    expect(css).not.toMatch(/\.f-props-grid|\.prio-seg|\.f-row\{|\.seg\.seg-4|\.row2\{/);
    const narrow = css.slice(css.indexOf('@container sheet (max-width:720px){\n  .f-props'));
    expect(narrow).toMatch(/^@container sheet \(max-width:720px\)\{\n  \.f-props\{grid-template-columns:minmax\(0,1fr\);row-gap:8px\}/);
    expect(narrow).toMatch(/\.f-line,\.f-pair\{display:grid;grid-template-columns:minmax\(0,1fr\);gap:8px\}/);
  });

  it('shows the default arrow on the cards while a quick title edit is open; controls and the editor keep their cursor', () => {
    expect(css).toContain('.tasks.is-editing .task,.tasks.is-editing .task .title .ttext{cursor:default}');
    expect(css).toMatch(/\.task\{[^}]*cursor:pointer/);
    expect(css).toMatch(/\.title \.ttext\{[^}]*cursor:text/);
    expect(css).toMatch(/\.title-edit\{[^}]*cursor:text/);
    expect(css).toMatch(/\.check\{[^}]*cursor:pointer/);
    expect(css).toMatch(/\.status-trigger\{[^}]*cursor:pointer\}/); // its own, not inherited from the card
    // the value is clipped to one line (line-clamp): the line must be taller than the 13.5px text, or "dừng" loses its descender
    expect(css).toMatch(/\.status-trigger\{[^}]*font-size:var\(--fs\);[^}]*line-height:18px;/);
    expect(css).not.toMatch(/is-editing[^{]*\.(check|del|status|title-edit)\b/);
  });

  it('lines the wide form up on shared columns: reporter ends with priority, deadline starts with assignee', () => {
    const wide = css.slice(css.indexOf('@container sheet (min-width:920px){'));
    expect(wide).toMatch(/^@container sheet \(min-width:920px\)\{\n  \.edit-pane \.f-props\{grid-template-columns:repeat\(5,max-content\) minmax\(0,1fr\)\}/);
    expect(wide).toContain('.edit-pane .f-line,.edit-pane .f-group{display:contents}');
    expect(wide).toContain('.edit-pane .f-pair>.f-control:first-child{grid-column:span 3}');
    // create form: reporter · assignee · followers share the row on their own five columns
    expect(wide).toContain('.edit-pane .f-trio{display:grid;grid-column:2/-1;grid-template-columns:minmax(0,1fr) max-content minmax(0,1fr) max-content minmax(0,1fr)}');
    // only the form: the detail view keeps its own layout
    expect(wide.slice(0, wide.indexOf('}\n}'))).not.toContain('.v-props');
  });

  it('shows each activity’s content in a grey box (theme token, so dark mode follows)', () => {
    expect(css).toMatch(/\.act-content\{[^}]*background:var\(--surface-2\)/);
  });

  it('strikes through and fades done cards, except in the "Đã xong" list where they read normally', () => {
    expect(css).toContain('.task.done .title .ttext{color:var(--ink-3);background-size:100% 1.5px}');
    expect(css).toContain('.task.done .meta>*{opacity:.5}');
    expect(css).toContain('.tasks.only-done .task.done .title .ttext{color:inherit;background-size:0 1.5px}');
    expect(css).toContain('.tasks.only-done .task.done .desc{color:var(--ink-2)}');
    expect(css).toContain('.tasks.only-done .task.done .meta>*{opacity:1}');
    // the override comes after the base rules, so it wins at equal or higher specificity
    expect(css.indexOf('.tasks.only-done .task.done .meta')).toBeGreaterThan(css.indexOf('.task.done .meta>*{'));
  });

  it('keeps the window buttons in a sticky title strip of the scrolling rail (content slides under the strip)', () => {
    expect(css).toMatch(/@media \(min-width:881px\)\{\s*\.side\.has-traffic\{padding-top:0\}\s*\.side\.has-traffic>\.traffic\{position:sticky;top:0;[^}]*background:inherit\}/);
  });

  it('sizes the rail from --side-w, with a 6px drag handle on its edge and one column when hidden (desktop only)', () => {
    expect(css).toContain('grid-template-columns:var(--side-w,256px) minmax(0,1fr)');
    expect(css).toMatch(/\.side-resizer\{display:block;position:absolute;top:0;bottom:0;left:calc\(var\(--side-w,256px\) - 3px\);z-index:3;width:6px;cursor:col-resize;touch-action:none/);
    expect(css).toContain('.board[data-resizing]{cursor:col-resize;user-select:none}');
    expect(css).toContain('.board[data-side="hidden"]{grid-template-columns:minmax(0,1fr)}');
    expect(css).toContain('.side-toggle{margin:-7px -6px -7px auto}');
    expect(css).toContain('@media (max-width:880px){.side-toggle{display:none}}');
  });

  it('wraps a long multi-select chip label onto 2 lines (same 8px padding both sides) and keeps a row level', () => {
    expect(css).toMatch(/\.chip\.multi span\{[^}]*height:100%;min-height:32px;padding:5px 8px;[^}]*white-space:normal/);
  });

  it('lays attachments out left of Huỷ/Lưu (scrolling inside when many) and colours chips by state', () => {
    expect(css).toMatch(/\.foot-files\{flex:1 1 240px;[^}]*max-height:118px;overflow-y:auto;margin-right:auto/);
    expect(css).toContain('.foot-files .attach-list{display:contents}');
    expect(css).toMatch(/\.attach-chip\[data-state="uploading"\]\{border-style:dashed/);
    expect(css).toMatch(/\.attach-chip\[data-state="error"\]\{border-color:var\(--red\);background:var\(--red-soft\);color:var\(--red\)\}/);
    expect(css).toMatch(/\.attach-name\{[^}]*text-overflow:ellipsis/);
    expect(css).toMatch(/\.sheet\.drop-target\{outline:2px dashed var\(--accent\)/);
  });

  it('gives the description editor one bordered box whose text scrolls inside', () => {
    expect(css).toMatch(/\.rte\{flex:1;min-height:0;display:flex;flex-direction:column;border:1px solid var\(--line\)/);
    expect(css).toMatch(/\.rte-content\{flex:1;min-height:0;overflow-y:auto/);
    expect(css).toMatch(/\.rte-toolbar\{[^}]*flex-wrap:wrap/);
    expect(css).toMatch(/\.rte-btn\[aria-pressed="true"\]\{background:var\(--accent-soft\);color:var\(--accent\)\}/);
    expect(css).toMatch(/\.edit-pane\{flex:1;min-height:0;/);
  });

  it('has no transitions or animations and no external fonts', () => {
    expect(css).not.toMatch(/transition|animation|@keyframes/);
    expect(css).not.toMatch(/googleapis|@import/);
    expect(css).toContain('--font:Inter,-apple-system,"system-ui","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif');
  });
});

describe('wallpaper (CONTRACT §10)', () => {
  it('draws --wallpaper (my picture) behind the windows, the default picture when it is not set', () => {
    expect(css).toContain('background-image:var(--bg-overlay),var(--wallpaper,url("./assets/bg-default.webp"));');
  });

  it('settings.css follows the rules of Công việc: no transitions, animations or filters', () => {
    expect(settingsCss).not.toMatch(/transition|animation|@keyframes|backdrop-filter|filter:/);
    expect(settingsCss).toMatch(/\.settings-logo\{background:linear-gradient\(180deg,#A9B2BE 0%,#5F6875 100%\)/);
    expect(settingsCss).toMatch(/\.wp-preview\{[^}]*aspect-ratio:16\/9;[^}]*background-size:cover/);
  });
});

describe('title strip of the left rail', () => {
  it('cancels the gap of each rail (30px Công việc, 22px Ghi chú): the brand starts right under the sticky window buttons', () => {
    expect(css).toMatch(/\.side\{--side-gap:30px;[^}]*gap:var\(--side-gap\)/);
    expect(css).toContain('.side.has-traffic>.traffic{position:sticky;top:0;flex:none;margin:0 -16px calc(-1*var(--side-gap));');
    expect(notesCss).toContain('.notes-side{--side-gap:22px;gap:var(--side-gap)}');
  });
});

describe('one text size in every app (CONTRACT §5 "Cỡ chữ")', () => {
  /** Every font size of a stylesheet, as `selector → value`. */
  const sizes = (sheet: string) =>
    [...sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([, sel, body]) =>
      [...body.matchAll(/(?<![\w-])font(?:-size)?:([^;}]+)/g)].map(([, v]) => [sel.trim().split('\n').pop()!.trim(), v.trim()] as const),
    );

  it('13.5px for all text, 20px for h1 / h2; only the avatar initials are sized to their circle', () => {
    expect(css).toContain('--fs:13.5px; --fs-h:20px;');
    expect(css).toContain('font:400 var(--fs)/1.5 var(--font)');
    for (const [sel, v] of [...sizes(css), ...sizes(notesCss), ...sizes(settingsCss), ...sizes(devtoolsCss)]) {
      if (v === 'inherit') continue;
      if (/\.avatar\b/.test(sel)) expect(v, sel).toMatch(/^\d+(\.\d+)?px$/);
      else expect(v, sel).toMatch(/var\(--fs(-h)?\)/);
    }
    const headings = [...sizes(css), ...sizes(notesCss)].filter(([sel]) => /(^|[\s,>])h[12]$|\.v-title$/.test(sel));
    expect(headings.length).toBeGreaterThan(5);
    for (const [sel, v] of headings) expect(v, sel).toBe('var(--fs-h)');
    expect(css).toMatch(/\.brand\{[^}]*margin:0;[^}]*font-size:var\(--fs-h\)/); // the app name is the h1 of the left rail
    expect(css).toMatch(/@layer base\{h1,h2\{font-size:var\(--fs-h\)\}h3,h4,h5,h6,small,code,pre,kbd\{font-size:var\(--fs\)\}\}/);
  });

  it('the shadcn parts use the same size (text-xs / text-sm / text-base)', () => {
    for (const k of ['xs', 'sm', 'base']) expect(tailwindCss).toContain(`--text-${k}: var(--fs);`);
  });
});
