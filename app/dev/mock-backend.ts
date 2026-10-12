// In-memory imitation of the Cogover Records API used by this module (CONTRACT §4).
// DEV/TEST ONLY: used by the Vite dev/preview server middleware and by unit tests.
// It is never imported from src/ and never ends up in dist/.

export interface MockPerson {
  id: string;
  first_name: string;
  last_name: string;
  avatar?: string | null;
  status?: 'ACTIVE' | 'INACTIVE';
  work_status?: string;
  /** Login e-mail of the person's Workspace account; people without one cannot be @mentioned. */
  account_email?: string;
  deleted?: 0 | 1;
  // extra fields the real API also returns; the client must ignore them
  email?: string;
  phone?: string;
  birthday?: string;
}

export interface MockTask {
  id: string;
  name: string;
  subject: string;
  description: string;
  due_date: number | null;
  priority: string;
  status: string;
  reporter: string | null;
  assignee: string | null;
  ccs: string[];
  /** As the Workspace stores it: FILE_METADATA items, often as JSON strings. */
  attachment_files?: unknown[] | null;
  /** Pictures of the description (system field `_attachments`). */
  _attachments?: unknown[] | null;
  project?: string;
  created: number;
  updated: number;
}

/** Object `activity` (timeline of a task, linked by its lookup `Task`). */
export interface MockActivity {
  id: string;
  name: string;
  activity_type: string;
  content: string;
  Task: string | null;
  created: number;
  created_by: string | null;
  activity_time?: number | null;
  files?: unknown[] | null;
  _attachments?: unknown[] | null;
  note_type?: string;
  source_object?: string;
  source_record?: string;
  manual_log?: number;
}

export interface MockRequest {
  method?: string;
  path: string;
  headers: Record<string, string | undefined>;
  body: unknown;
  /** Scenario switch for manual testing: "error" | "expired" | "csrf" | "slow" | "empty". */
  scenario?: string;
}

/** Body of a multipart upload, as parsed by the caller (dev middleware / test fetch). */
export interface MockUpload {
  field_slug?: string;
  object_slug?: string;
  /** Pictures of the description: `_attachments` by field id + object id. */
  field_id?: string;
  object_id?: string;
  file?: { name: string; size: number; type: string; data?: Uint8Array };
}

export interface MockResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface MockBackendOptions {
  meId: string;
  people: MockPerson[];
  tasks: MockTask[];
  now?: () => number;
  /** When set, x-csrf-token must equal it (r: 19000 otherwise). */
  csrfToken?: string;
  /** ccs the Workspace applies on create (CONTRACT: default follower). */
  defaultCcs?: string[];
  /** Max rows per page the server returns (Cogover: 100). */
  maxPage?: number;
  activities?: MockActivity[];
  /** Transition rules of `task` as GET /api/v1/object_security/transition_rule returns them (none = free). */
  transitionRules?: unknown[];
  /**
   * Records of the other objects, by slug: the notes app (`notes_cat`, `notes_content`, `notes_tag`, `notes_pin`)
   * and the org chart (`department`, `department_personnel`). Lookups hold ids, like the tasks.
   */
  records?: Record<string, Record<string, unknown>[]>;
}

export interface MockCall {
  path: string;
  service: string | undefined;
  headers: Record<string, string | undefined>;
  body: any;
}

interface Filter {
  field: string;
  op: string;
  params: unknown;
  fieldType?: string;
}

/** `file_type` of field `attachment_files` on the reference Workspace (2026-10-01, after images/media were allowed). */
/** `_attachments` of `task` (pictures pasted into the description) and what it accepts. */
const MOCK_INLINE_FIELD_ID = 'OFDEMOTASKIMG';
const MOCK_TASK_OBJECT_ID = 'OTDEMOTASK001';
/** Field `status` of `task` (what the "Status" transition rule controls). */
const MOCK_STATUS_FIELD_ID = 'OFDEMOTASKSTA';

/** `_attachments` of `activity` (pictures pasted into a note). */
const MOCK_NOTE_IMAGE_FIELD_ID = 'OFDEMOACTIMG1';
const MOCK_ACTIVITY_OBJECT_ID = 'OTDEMOACTIV01';
/** Object ids of the notes app (CONTRACT §9) → their slug and the id prefix of new records. */
const GENERIC_OBJECTS: Record<string, { slug: string; prefix: string }> = {
  OTDEMONOTECAT: { slug: 'notes_cat', prefix: 'FOLMOCK' },
  OTDEMONOTECON: { slug: 'notes_content', prefix: 'NOTMOCK' },
  OTDEMONOTETAG: { slug: 'notes_tag', prefix: 'TAGMOCK' },
  OTDEMONOTEPIN: { slug: 'notes_pin', prefix: 'PINMOCK' },
  // personal settings (CONTRACT §10): one record per user, whose = created_by
  OTDEMOSETTING: { slug: 'user_settings', prefix: 'USTMOCK' },
};
/** How the server expands lookups of these objects: person (whole personnel record) or a record of another object. */
const GENERIC_LOOKUPS: Record<string, Record<string, 'person' | string>> = {
  notes_cat: { owner: 'person', parent_folder: 'notes_cat', created_by: 'person', updated_by: 'person' },
  notes_content: {
    owner: 'person', viewers: 'person', editors: 'person', created_by: 'person', updated_by: 'person',
    folder: 'notes_cat', viewer_departments: 'department', editor_departments: 'department', tags: 'notes_tag',
  },
  notes_tag: { created_by: 'person' },
  notes_pin: { person: 'person', note: 'notes_content' },
  user_settings: { created_by: 'person', updated_by: 'person' },
  department_personnel: { personnel: 'person', department: 'department' },
  department: {},
};
/** Fields the notes objects require (r: 602 otherwise, like the Workspace). */
const GENERIC_REQUIRED: Record<string, string[]> = {
  notes_cat: ['name', 'owner'],
  notes_content: ['name', 'owner', 'visibility'],
  notes_tag: ['name'],
  notes_pin: ['person', 'note'],
};

const MOCK_INLINE_TYPES = new Set('doc docx xlsx xls csv ppt pptx pdf rtf txt html htm zip jpg jpeg png svg gif bmp tiff tif mp4 avi mov wmv mp3 mkv'.split(' '));

/** Field `desktop_wallpaper` of `user_settings`: one picture (`file_type` jpg/jpeg/png/webp). */
const MOCK_WALLPAPER_TYPES = new Set(['jpg', 'jpeg', 'png', 'webp']);

const MOCK_FILE_TYPES = new Set(
  'doc docx xlsx xls csv ppt pptx pdf txt rtf html htm zip json md jpg jpeg png gif webp svg bmp tiff tif heic mp4 mov avi wmv mkv mp3'.split(' '),
);

const ok = (data: unknown): MockResponse => ({ status: 200, headers: {}, body: { r: 0, msg: 'Success', data } });
const fail = (r: number, msg: string, status = 200): MockResponse => ({ status, headers: {}, body: { r, msg, data: null } });

/** Evaluates "(1 OR 2 OR 3) AND 4" style expressions over filter results (1-based). */
export function evalLogic(expr: string, results: boolean[]): boolean {
  const tokens = expr.match(/\(|\)|\d+|AND|OR/gi) ?? [];
  let i = 0;
  const parseOr = (): boolean => {
    let v = parseAnd();
    while (tokens[i]?.toUpperCase() === 'OR') {
      i++;
      const r = parseAnd();
      v = v || r;
    }
    return v;
  };
  const parseAnd = (): boolean => {
    let v = parseAtom();
    while (tokens[i]?.toUpperCase() === 'AND') {
      i++;
      const r = parseAtom();
      v = v && r;
    }
    return v;
  };
  const parseAtom = (): boolean => {
    const t = tokens[i++];
    if (t === '(') {
      const v = parseOr();
      i++; // ')'
      return v;
    }
    return Boolean(results[Number(t) - 1]);
  };
  return parseOr();
}

export function createMockBackend(opts: MockBackendOptions) {
  const now = opts.now ?? (() => Date.now());
  const maxPage = opts.maxPage ?? 100;
  const state = {
    people: opts.people.map(p => ({ status: 'ACTIVE' as const, ...p })),
    tasks: opts.tasks.map(t => ({ ...t, ccs: [...t.ccs] })),
    activities: (opts.activities ?? []).map(a => ({ ...a })),
    records: Object.fromEntries(Object.entries(opts.records ?? {}).map(([k, rows]) => [k, rows.map(r => ({ ...r }))])) as Record<string, Record<string, unknown>[]>,
    seq: 2000,
    fileSeq: 0,
    /** uploaded files by id (dev server serves them under /files/<id>/original/<name>?redirect=true) */
    files: new Map<string, { name: string; type: string; data?: Uint8Array }>(),
  };
  const calls: MockCall[] = [];
  // seeded attachments can be opened too (placeholder content)
  for (const t of [...state.tasks.map(x => x.attachment_files), ...state.activities.map(a => a.files)]) {
    for (const item of t ?? []) {
      try {
        const meta = (typeof item === 'string' ? JSON.parse(item) : item) as { file_id?: string; fileName?: string; fileType?: string };
        if (meta.file_id) state.files.set(meta.file_id, { name: meta.fileName ?? meta.file_id, type: 'text/plain; charset=utf-8', data: new TextEncoder().encode(`Tệp mẫu: ${meta.fileName}`) });
      } catch {
        /* not JSON: ignored like the app does */
      }
    }
  }

  const personObj = (id: string | null) => {
    if (!id) return null;
    const p = state.people.find(x => x.id === id);
    // the real API expands lookups into the whole personnel record
    return p ? { ...p, department: 'Phòng thử nghiệm', position: 'Nhân viên' } : { id, first_name: '', last_name: '' };
  };

  const resolve = (v: unknown): unknown => {
    if (v === '$currentUser') return opts.meId;
    if (Array.isArray(v)) return v.map(resolve);
    return v;
  };

  // personnel: the name fields Cogover derives from first/last name (searched by the "@" list)
  const rawValue = (row: Record<string, unknown>, field: string) => {
    if (field === 'first_last_name') return `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim();
    if (field === 'last_first_name') return `${row.last_name ?? ''} ${row.first_name ?? ''}`.trim();
    return row[field];
  };
  // `like` on the real server ignores case and Vietnamese accents; '' matches everything
  const fold = (v: unknown) =>
    String(v ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase();

  const test = (row: Record<string, unknown>, f: Filter): boolean => {
    const value = rawValue(row, f.field);
    const params = resolve(f.params);
    if (f.op === '=') return Array.isArray(value) ? value.includes(params) : value === params;
    if (f.op === 'in') {
      const list = Array.isArray(params) ? params : [params];
      return Array.isArray(value) ? value.some(v => list.includes(v)) : list.includes(value);
    }
    if (f.op === '!=') return value !== params;
    if (f.op === 'not null') return value != null && value !== '';
    if (f.op === 'like') return !String(params ?? '') || (value != null && fold(value).includes(fold(params)));
    return false;
  };

  const project = (row: Record<string, unknown>, fields: string[], lookups: string[]) => {
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      if (!(f in row)) continue;
      const v = row[f];
      if (lookups.includes(f)) out[f] = Array.isArray(v) ? v.map(id => personObj(id as string)) : personObj(v as string | null);
      else out[f] = v;
    }
    return out;
  };

  /** A record of another object as the server expands it in a lookup: the whole record (here: id + name). */
  const recordObj = (slug: string, id: unknown) => {
    if (typeof id !== 'string' || !id) return null;
    const r = (state.records[slug] ?? []).find(x => x.id === id);
    return r ? { id, name: r.name ?? '' } : { id };
  };
  const projectGeneric = (slug: string, row: Record<string, unknown>, fields: string[]) => {
    const out: Record<string, unknown> = {};
    const kinds = GENERIC_LOOKUPS[slug] ?? {};
    for (const f of fields) {
      if (!(f in row)) continue;
      const v = row[f];
      const kind = kinds[f];
      const expand = (id: unknown) => (kind === 'person' ? personObj(id as string) : recordObj(kind, id));
      out[f] = !kind || v == null ? v : Array.isArray(v) ? v.map(expand) : expand(v);
    }
    return out;
  };

  /** Notes app: create / update / delete on the generic store (long text with three formats stored as a JSON string). */
  // like the Workspace: long text with three formats and a single file come back as JSON strings
  const storeValue = (k: string, v: unknown) => ((k === 'content' || k === 'desktop_wallpaper') && v && typeof v === 'object' ? JSON.stringify(v) : v);
  function createGeneric(objectId: string, data: Record<string, unknown>): MockResponse {
    const { slug, prefix } = GENERIC_OBJECTS[objectId];
    const row: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) if (k !== 'object_type' && k !== 'workspace_id') row[k] = storeValue(k, v);
    if (slug === 'notes_content' && row.visibility == null) row.visibility = 'private';
    for (const f of GENERIC_REQUIRED[slug] ?? []) {
      if (row[f] == null || row[f] === '') return fail(602, `Field ["${f}"] is required.`);
    }
    state.seq += 1;
    row.id = `${prefix}${state.seq}`;
    row.created = now();
    row.updated = now();
    row.created_by = opts.meId;
    row.updated_by = opts.meId;
    (state.records[slug] ??= []).push(row);
    return ok({ id: row.id });
  }
  function updateGeneric(objectId: string, data: Record<string, unknown>): MockResponse {
    const { slug } = GENERIC_OBJECTS[objectId];
    const row = (state.records[slug] ?? []).find(r => r.id === data.id);
    if (!row) return fail(1, 'Record not existed');
    for (const [k, v] of Object.entries(data)) if (!['id', 'object_type', 'workspace_id'].includes(k)) row[k] = storeValue(k, v);
    for (const f of GENERIC_REQUIRED[slug] ?? []) {
      if (row[f] == null || row[f] === '') return fail(602, `Field ["${f}"] is required.`);
    }
    row.updated = now();
    row.updated_by = opts.meId;
    return ok({});
  }
  function removeGeneric(objectId: string, ids: string[]): MockResponse {
    const { slug } = GENERIC_OBJECTS[objectId];
    const rows = (state.records[slug] ??= []);
    const deleted: string[] = [];
    const notDeleted: string[] = [];
    for (const id of ids) {
      const i = rows.findIndex(r => r.id === id);
      if (i < 0) {
        notDeleted.push(id);
        continue;
      }
      rows.splice(i, 1);
      deleted.push(id);
      // `notes_pin.note` is a reference lookup: the pins go with the note
      if (slug === 'notes_content') state.records.notes_pin = (state.records.notes_pin ?? []).filter(p => p.note !== id);
    }
    return ok({ deleted, not_deleted: notDeleted });
  }

  function list(body: any): MockResponse {
    if (!body || typeof body !== 'object') return fail(1, 'Invalid body');
    if (!body.type) return fail(27, 'type is required');
    if (!Array.isArray(body.filters) || body.filters.length === 0) return fail(25, 'filters must not be empty');
    const isPeople = body.object_slug === 'personnel';
    const isActivity = body.object_slug === 'activity';
    const generic = body.object_slug in GENERIC_LOOKUPS ? String(body.object_slug) : null;
    if (!isPeople && !isActivity && !generic && body.object_slug !== 'task') return fail(404, `Unknown object ${String(body.object_slug)}`);
    const source: Record<string, unknown>[] = generic
      ? (state.records[generic] ??= [])
      : isPeople
        ? (state.people as any)
        : isActivity
          ? (state.activities as any)
          : (state.tasks as any);
    const filters: Filter[] = body.filters;
    const rows = source.filter(row => {
      const results = filters.map(f => test(row, f));
      if (body.type === 1) return results.every(Boolean);
      if (body.type === 2) return results.some(Boolean);
      return evalLogic(String(body.logic_sequence ?? ''), results);
    });
    const sort = Array.isArray(body.sorts) && body.sorts[0] ? body.sorts[0] : null;
    const sortField = sort ? Object.keys(sort)[0] : 'id';
    const dir = sort && sort[sortField]?.order === 'desc' ? -1 : 1;
    const key = (r: Record<string, unknown>) => (r[sortField] ?? null) as string | number | null;
    // nulls last whatever the direction; ties broken by id ascending
    rows.sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      if (ka === null && kb !== null) return 1;
      if (kb === null && ka !== null) return -1;
      if (ka !== null && kb !== null && ka !== kb) return (ka < kb ? -1 : 1) * dir;
      return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
    });
    let start = 0;
    const after: unknown[] = Array.isArray(body.search_after) ? body.search_after : [];
    if (after.length === 2) {
      const idx = rows.findIndex(r => String(r.id) === String(after[1]));
      start = idx >= 0 ? idx + 1 : rows.length;
    }
    const size = Math.min(Number(body.size) || maxPage, maxPage);
    const page = rows.slice(start, start + size);
    const lookups = isPeople ? [] : isActivity ? ['created_by'] : ['reporter', 'assignee', 'ccs'];
    const fields: string[] = Array.isArray(body.fields) ? body.fields : [];
    const last = page[page.length - 1];
    return ok({
      total: rows.length,
      rows: page.map(r => (generic ? projectGeneric(generic, r, fields) : project(r, fields, lookups))),
      search_after: last ? [key(last), last.id] : [],
    });
  }

  /** Like the Workspace: an active rule on field `status` limits creation (from `_initial`) and changes. */
  const statusFlows = () => {
    const flows: { from: string; to: string }[] = [];
    for (const r of (opts.transitionRules ?? []) as any[]) {
      if (Number(r?.status) !== 1 || r?.objectFieldId !== MOCK_STATUS_FIELD_ID) continue;
      for (const f of r.flows ?? []) flows.push({ from: String(f.originValue), to: String(f.targetValue) });
    }
    return flows;
  };
  const statusRefused = (from: string | null, to: string): MockResponse | null => {
    const flows = statusFlows();
    if (!flows.length) return null;
    if (from === null) {
      return flows.some(f => f.from === '_initial' && f.to === to) ? null : fail(-1, `Value: [${to}] is not in transition rule`, 500);
    }
    if (from === to || flows.some(f => f.from === from && f.to === to)) return null;
    const available = [from, ...flows.filter(f => f.from === from).map(f => f.to)];
    return fail(48, `Your target value [${to}] is not allowed, current value: [${from}], available values: [${available.join(', ')}]`, 422);
  };

  const WRITABLE = ['subject', 'description', 'due_date', 'priority', 'status', 'reporter', 'assignee', 'attachment_files', '_attachments'];

  /** `attachment_files` as the Workspace accepts it: 1–10 files (r: 607 for [], r: 608 for 11+), null clears. */
  const attachmentsError = (v: unknown) =>
    Array.isArray(v) && v.length === 0
      ? fail(607, 'attachment_files: min length is: 1')
      : Array.isArray(v) && v.length > 10
        ? fail(608, `Field [Attachment files] max length is: 10 but got: ${v.length}.0`, 422)
        : null;
  const storeAttachments = (v: unknown) =>
    Array.isArray(v) ? v.map(item => (typeof item === 'string' ? item : JSON.stringify(item))) : null;

  /** Like the file server for `_attachments`: public, resizable, served under /files/0/. */
  function uploadInline(body: MockUpload): MockResponse {
    const f = body.file;
    if (!f || !f.name) return fail(1, 'Thiếu file');
    const ext = /\.([a-z0-9]+)$/i.exec(f.name)?.[1]?.toLowerCase() ?? '';
    if (/\[loi\]/i.test(f.name) || !MOCK_INLINE_TYPES.has(ext)) return fail(15, 'file type not allowed', 400);
    state.fileSeq += 1;
    const fileId = `FILIMG${String(state.fileSeq).padStart(4, '0')}`;
    const name = f.name.replace(/\s+/g, '-');
    state.files.set(fileId, { name, type: f.type, data: f.data });
    return ok({
      fileName: name,
      fileSize: f.size,
      resizable: true,
      file_id: fileId,
      resolutionSizes: ['original', 'tiny', 'small', 'medium', 'large'],
      acl: 'public',
      fileExt: ext,
      fileServerUrlTemplate: `//asia-1{FILE_SERVER_SUFFIX_PUBLIC_URL}/0/${fileId}/${name}`,
      fileType: 'object_field',
      url: `/files/0/${fileId}/{resolution_size}/${name}?redirect=true`,
    });
  }

  function upload(body: MockUpload | null): MockResponse {
    if (body && body.field_id === MOCK_INLINE_FIELD_ID && body.object_id === MOCK_TASK_OBJECT_ID) return uploadInline(body);
    if (body && body.field_id === MOCK_NOTE_IMAGE_FIELD_ID && body.object_id === MOCK_ACTIVITY_OBJECT_ID) return uploadInline(body);
    const wallpaper = body?.field_slug === 'desktop_wallpaper' && body.object_slug === 'user_settings';
    if (!body || (!wallpaper && (body.field_slug !== 'attachment_files' || body.object_slug !== 'task'))) return fail(1, 'Thiếu field_slug/object_slug');
    const f = body.file;
    if (!f || !f.name) return fail(1, 'Thiếu file');
    const ext = /\.([a-z0-9]+)$/i.exec(f.name)?.[1]?.toLowerCase() ?? '';
    // like the file server: extensions outside the field's `file_type` list (and "[loi]" names) are refused
    if (/\[loi\]/i.test(f.name) || !(wallpaper ? MOCK_WALLPAPER_TYPES : MOCK_FILE_TYPES).has(ext)) return fail(15, 'file type not allowed', 400);
    state.fileSeq += 1;
    const fileId = `FILMOCK${String(state.fileSeq).padStart(4, '0')}`;
    state.files.set(fileId, { name: f.name, type: f.type, data: f.data });
    return ok({
      fileName: f.name,
      fileSize: f.size,
      file_id: fileId,
      acl: 'private',
      fileExt: ext,
      fileType: f.type || 'application/octet-stream',
      resolutionSizes: [],
      fileServerUrlTemplate: `/files/{file_id}/{resolution_size}/${f.name}`,
      url: `https://acme.cogover.example/files/0/{file_id}/{resolution_size}/${f.name}`,
    });
  }

  /** A note written on a task's timeline: like the Workspace, `name` must be there (empty is fine). */
  function createActivity(body: any): MockResponse {
    const data = body?.data ?? {};
    if (!('name' in data) || data.name === null) return fail(602, 'Field ["name"] is required.');
    if (!data.activity_type) return fail(602, 'Field ["activity_type"] is required.');
    state.seq += 1;
    const a: MockActivity = {
      id: `ACTMOCK${state.seq}`,
      name: String(data.name),
      activity_type: String(data.activity_type),
      content: String(data.content ?? ''),
      Task: data.Task ?? null,
      created: now(),
      created_by: opts.meId,
      activity_time: data.activity_time ?? now(),
      files: null,
      _attachments: Array.isArray(data._attachments) ? data._attachments : null,
      note_type: data.note_type,
      source_object: data.source_object,
      source_record: data.source_record,
      manual_log: data.manual_log,
    };
    state.activities.push(a);
    return ok({ id: a.id });
  }

  function create(body: any): MockResponse {
    if (body?.object_type === MOCK_ACTIVITY_OBJECT_ID) return createActivity(body);
    if (body?.object_type in GENERIC_OBJECTS) return createGeneric(body.object_type, body?.data ?? {});
    const data = body?.data ?? {};
    if (!data.subject || !String(data.subject).trim()) return fail(1, 'Trường "subject" là bắt buộc');
    if (data.due_date == null) return fail(1, 'Trường "due_date" là bắt buộc');
    const refusedCreate = statusRefused(null, String(data.status ?? 'new'));
    if (refusedCreate) return refusedCreate;
    if ('attachment_files' in data) {
      const bad = attachmentsError(data.attachment_files);
      if (bad) return bad;
    }
    state.seq += 1;
    const t: MockTask = {
      id: `TASMOCK${state.seq}`,
      name: `TAS-${state.seq}`,
      subject: String(data.subject),
      description: String(data.description ?? ''),
      due_date: Number(data.due_date),
      priority: String(data.priority ?? 'medium'),
      status: String(data.status ?? 'new'),
      reporter: data.reporter ?? null,
      assignee: data.assignee ?? null,
      // like the Workspace: the field's default followers only when the request has no `ccs`
      ccs: Array.isArray(data.ccs) ? data.ccs.map(String) : [...(opts.defaultCcs ?? [])],
      attachment_files: storeAttachments(data.attachment_files),
      _attachments: Array.isArray(data._attachments) ? data._attachments : null,
      project: 'Dự án mặc định',
      created: now(),
      updated: now(),
    };
    state.tasks.push(t);
    return ok({ id: t.id });
  }

  /** Editing a note: its content (and `_attachments`); like the Workspace, only the author's own notes. */
  function updateActivity(data: any): MockResponse {
    const a = state.activities.find(x => x.id === data.id);
    if (!a) return fail(1, 'Record not existed');
    if (a.created_by !== opts.meId) return fail(403, 'Permission denied');
    if ('content' in data) a.content = String(data.content ?? '');
    if ('_attachments' in data) a._attachments = Array.isArray(data._attachments) ? data._attachments : null;
    return ok({});
  }

  function update(body: any): MockResponse {
    const data = body?.data ?? {};
    if (body?.object_type === MOCK_ACTIVITY_OBJECT_ID) return updateActivity(data);
    if (body?.object_type in GENERIC_OBJECTS) return updateGeneric(body.object_type, data);
    const t = state.tasks.find(x => x.id === data.id);
    if (!t) return fail(404, 'Không tìm thấy bản ghi');
    if ('status' in data) {
      const refused = statusRefused(t.status, String(data.status));
      if (refused) return refused;
    }
    if ('attachment_files' in data) {
      const bad = attachmentsError(data.attachment_files);
      if (bad) return bad;
    }
    for (const k of WRITABLE) if (k in data) (t as any)[k] = k === 'attachment_files' ? storeAttachments(data[k]) : data[k];
    t.updated = now();
    return ok({});
  }

  function remove(body: any): MockResponse {
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
    if (body?.object_type in GENERIC_OBJECTS) return removeGeneric(body.object_type, ids);
    if (body?.object_type === MOCK_ACTIVITY_OBJECT_ID) {
      const deleted = ids.filter(id => state.activities.some(a => a.id === id && a.created_by === opts.meId));
      state.activities = state.activities.filter(a => !deleted.includes(a.id));
      return ok({ deleted, not_deleted: ids.filter(id => !deleted.includes(id)) });
    }
    const deleted: string[] = [];
    const notDeleted: string[] = [];
    for (const id of ids) {
      const i = state.tasks.findIndex(t => t.id === id);
      if (i >= 0) {
        state.tasks.splice(i, 1);
        deleted.push(id);
      } else notDeleted.push(id);
    }
    return ok({ deleted, not_deleted: notDeleted });
  }

  function handle(req: MockRequest): MockResponse {
    const service = req.headers['x-req-service'];
    calls.push({ path: req.path, service, headers: { ...req.headers }, body: req.body });
    if (req.scenario === 'expired') return { status: 401, headers: { 'x-proxy-error': '1' }, body: { r: 401, msg: 'Unauthorized' } };
    if (req.scenario === 'csrf') return fail(19000, 'CSRF_TOKEN_NOT_VALID');
    if (req.scenario === 'error') return fail(500, 'Lỗi giả lập từ máy chủ thử nghiệm');
    if (req.method === 'GET' && req.path === '/api/v1/object_security/transition_rule') {
      if (opts.csrfToken && req.headers['x-csrf-token'] !== opts.csrfToken) return fail(19000, 'CSRF_TOKEN_NOT_VALID');
      return ok(opts.transitionRules ?? []);
    }
    if ((req.method ?? 'POST') !== 'POST') return fail(405, 'Method not allowed', 405);
    if (req.path === '/api/v1/file/upload/v2/client_upload') {
      // the file server takes the session + CSRF, but no x-req-service / x-req-type
      if (opts.csrfToken && req.headers['x-csrf-token'] !== opts.csrfToken) return fail(19000, 'CSRF_TOKEN_NOT_VALID');
      if (service || req.headers['x-req-type']) return fail(400, 'Unexpected x-req-* headers', 400);
      return upload(req.body as MockUpload | null);
    }
    if (req.headers['x-req-type'] !== '9') return fail(400, 'x-req-type must be 9', 400);
    if (opts.csrfToken && req.headers['x-csrf-token'] !== opts.csrfToken) return fail(19000, 'CSRF_TOKEN_NOT_VALID');
    const body = req.body as any;
    switch (req.path) {
      case '/api/v1/records/list':
        if (service !== '217') return fail(400, 'Wrong x-req-service', 400);
        if (req.scenario === 'empty' && body?.object_slug === 'task') return ok({ total: 0, rows: [], search_after: [] });
        return list(body);
      case '/api/v1/records':
        if (service === '10200') return create(body);
        if (service === '10201') return update(body);
        return fail(400, 'Wrong x-req-service', 400);
      case '/api/v1/records/delete':
        if (service !== '218') return fail(400, 'Wrong x-req-service', 400);
        return remove(body);
      default:
        return fail(404, 'Not found', 404);
    }
  }

  return { handle, state, calls };
}

export type MockBackend = ReturnType<typeof createMockBackend>;
