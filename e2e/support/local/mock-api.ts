import type { BrowserContext, Route, Request } from '@playwright/test';
import {
  ACTIVITY_CONTENT_FIELD_ID,
  ACTIVITY_FIELDS,
  ACTIVITY_INLINE_FIELD_ID,
  ACTIVITY_OBJECT_TYPE,
  NOTES_OBJECTS,
  OBJECT_TYPE,
  SERVICE,
  SETTINGS_OBJECT,
  WALLPAPER_EXTS,
  WALLPAPER_FIELD,
  WALLPAPER_MAX_BYTES,
  WORKSPACE_ID,
} from '../model';
import { DESC_FIELD_ID, INLINE_FIELD_ID } from '../paste';

/**
 * Mock có state trong bộ nhớ cho API record Cogover (CONTRACT mục 4).
 * - Đánh giá filters/logic_sequence/$currentUser, sort, phân trang search_after (≤100 dòng/trang như thật).
 * - Ghi lại mọi request (header + body) để assert; ghi "violations" khi lệch contract.
 * - Chèn lỗi (failNext) và giữ response (hold) để test loading/error/session.
 */

/** Header đánh dấu response do mock E2E trả (để chứng minh request không lọt ra mock dev của preview). */
export const MOCK_MARK_HEADER = 'x-e2e-mock';

export interface MockPerson {
  id: string;
  first_name: string;
  last_name: string;
  avatar: string;
  work_status?: string;
  status: 'ACTIVE' | 'INACTIVE';
  /** Email tài khoản đăng nhập (null = nhân sự không có tài khoản). */
  account_email?: string | null;
  /** 1 = đã xoá (mềm). */
  deleted?: number;
}

/** Bỏ dấu tiếng Việt + lowercase — server so `like` không phân biệt hoa/thường và dấu (CONTRACT 3f). */
const foldText = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');

export interface MockTask {
  id: string;
  name: string;
  subject: string;
  description: string;
  due_date: number;
  priority: string | null;
  status: string;
  reporter: string | null;
  assignee: string | null;
  ccs: string[];
  created: number;
  updated: number;
  project?: string;
  /** File đính kèm: object FILE_METADATA hoặc chuỗi JSON (server có thể trả cả hai dạng). */
  attachment_files?: (FileMeta | string)[] | null;
  /** Field hệ thống `_attachments`: FILE_METADATA của ảnh trong mô tả (CONTRACT 3b). */
  _attachments?: (InlineFileMeta | Record<string, unknown> | string)[] | null;
}

/** FILE_METADATA của upload vào `_attachments` (field_id/object_id) — giống server thật (field `is_public: true`). */
export interface InlineFileMeta {
  fileName: string;
  fileSize: number;
  resizable: boolean;
  file_id: string;
  resolutionSizes: string[];
  acl: string;
  fileExt: string;
  fileServerUrlTemplate: string;
  fileType: string;
  url: string;
}

export interface FileMeta {
  fileName: string;
  fileSize: number;
  file_id: string;
  acl: string;
  fileExt: string;
  fileType: string;
  resolutionSizes: string[];
  fileServerUrlTemplate: string;
  url: string;
}

/** Thông tin multipart của một request upload (đã tách từ body). */
export interface UploadInfo {
  fields: Record<string, string>;
  fileName: string | null;
  fileSize: number;
  contentType: string | null;
  content?: Buffer;
}

/**
 * Bản ghi Object `activity` (CONTRACT mục 4 "Activities"): liên kết task qua lookup `Task`.
 * `name` có thể rỗng/null; `content` là HTML CKEditor (ảnh còn placeholder `{resolution_size}`).
 */
export interface MockActivity {
  id: string;
  /** ID task (lookup `Task`). */
  Task: string;
  activity_type: string;
  name: string | null;
  content: string;
  /** ID nhân sự tạo (lookup `created_by`). */
  created_by: string;
  created: number;
  activity_time: number | null;
  files?: (FileMeta | string)[] | null;
  note_type?: string;
  source_object?: string;
  source_record?: string;
  manual_log?: number;
  _attachments?: (InlineFileMeta | Record<string, unknown> | string)[] | null;
}

export interface Dataset {
  meId: string;
  people: MockPerson[];
  tasks: MockTask[];
  activities?: MockActivity[];
}

export type Kind = 'list' | 'create' | 'update' | 'delete' | 'upload' | 'rule' | 'unknown';

/** Một bước của quy trình trạng thái (flow của transition rule; `_initial` = lúc tạo). */
export interface StatusFlowStep {
  from: string;
  to: string;
}

/** Field `status` của task (field mà rule "Status" kiểm soát) — CONTRACT mục 4 "Quy trình trạng thái". */
export const STATUS_FIELD_ID = 'OFDEMOTASKSTA';
export const TRANSITION_RULE_PATH = '/api/v1/object_security/transition_rule';

/** Rule "Status" của Workspace (đọc 03/10/2026, CONTRACT mục 4). */
export const WORKSPACE_STATUS_FLOWS: StatusFlowStep[] = [
  { from: '_initial', to: 'new' },
  { from: 'new', to: 'in_progress' },
  { from: 'new', to: 'cancelled' },
  { from: 'in_progress', to: 'pending' },
  { from: 'in_progress', to: 'on_hold' },
  { from: 'in_progress', to: 'resolved' },
  { from: 'pending', to: 'in_progress' },
  { from: 'pending', to: 'resolved' },
  { from: 'pending', to: 'cancelled' },
  { from: 'on_hold', to: 'in_progress' },
  { from: 'on_hold', to: 'cancelled' },
  { from: 'resolved', to: 'closed' },
];

export interface RecordedRequest {
  seq: number;
  kind: Kind;
  path: string;
  method: string;
  headers: Record<string, string>;
  body: any;
  response?: any;
  status?: number;
  upload?: UploadInfo;
  /** Tham số query (GET). */
  query?: Record<string, string>;
}

type Pred = (r: RecordedRequest) => boolean;
interface Injected {
  pred: Pred;
  times: number;
  status: number;
  body: any;
  headers?: Record<string, string>;
}

const ALLOWED_WRITE_FIELDS = new Set([
  'id',
  'object_type',
  'workspace_id',
  'subject',
  'description',
  'due_date',
  'priority',
  'status',
  'reporter',
  'assignee',
  'attachment_files',
  '_attachments',
  // CONTRACT mục 4 "Ghi dữ liệu" (2026-10-03): ccs ghi được khi sửa (mảng personnel ID hoặc null).
  'ccs',
]);
/** Field được ghi khi tạo ghi chú (activity) theo CONTRACT mục 4 "Activities". */
const ACTIVITY_WRITE_FIELDS = new Set([
  'object_type',
  'workspace_id',
  'activity_type',
  'note_type',
  'name',
  'content',
  'Task',
  'source_object',
  'source_record',
  'manual_log',
  'activity_time',
  '_attachments',
]);
const CREATE_REQUIRED = ['subject', 'description', 'due_date', 'priority', 'status', 'reporter', 'assignee'];

/** `file_type` của field attachment_files (CONTRACT mục 4, đọc lại 2026-10-01). Đuôi khác → HTTP 400 r:15. */
export const ALLOWED_FILE_EXTS = [
  'doc', 'docx', 'xlsx', 'xls', 'csv', 'ppt', 'pptx', 'pdf', 'txt', 'rtf', 'html', 'htm', 'zip', 'json', 'md',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'tif', 'heic', 'mp4', 'mov', 'avi', 'wmv', 'mkv', 'mp3',
];
/** `max_size` 50 MB và `multiple_limit` 10 của field attachment_files. */
const MOCK_MAX_FILE_BYTES = 50 * 1024 * 1024;
const MOCK_MAX_FILES = 10;
/** Lỗi thật của Workspace khi upload đuôi không cho phép. */
export const FILE_TYPE_NOT_ALLOWED = { status: 400, json: { r: 15, msg: 'file type not allowed' } };

/** Field `_attachments` (nơi trình soạn tải ảnh trong mô tả lên) và field `description` (CONTRACT 3b). */
export { DESC_FIELD_ID, INLINE_FIELD_ID };
/** `file_type` của field `_attachments` (không có webp/heic/json/md như attachment_files). */
export const INLINE_ALLOWED_EXTS = [
  'doc', 'docx', 'xlsx', 'xls', 'csv', 'ppt', 'pptx', 'pdf', 'rtf', 'txt', 'html', 'htm', 'zip',
  'jpg', 'jpeg', 'png', 'svg', 'gif', 'bmp', 'tiff', 'tif', 'mp4', 'avi', 'mov', 'wmv', 'mp3', 'mkv',
];
const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml',
  tif: 'image/tiff', tiff: 'image/tiff', webp: 'image/webp', pdf: 'application/pdf', txt: 'text/plain',
};

/* ---------------- Object khác task / activity (CONTRACT mục 9, 10) ---------------- */

/** Một bản ghi của object chung: lookup lưu ID (như task), `content` / `desktop_wallpaper` lưu chuỗi JSON như server. */
export type GenericRow = Record<string, any> & { id: string };

interface GenericSpec {
  /** ID object (object_type khi ghi); null = chỉ đọc (object hệ thống). */
  id: string | null;
  /** Tiền tố ID bản ghi mới. */
  prefix: string;
  /** Lookup được server mở rộng khi đọc: 'person' = nguyên bản ghi nhân sự, còn lại = slug object đích (id + name). */
  lookups: Record<string, 'person' | string>;
  /** Field app được ghi (ngoài object_type, workspace_id, id). */
  writable: string[];
  /** Field bắt buộc khi tạo (thiếu → r:602 như Workspace). */
  required: string[];
}

/** Object Ghi chú (9.2), thiết lập cá nhân (10.1) và sơ đồ tổ chức (đọc phòng của tôi / danh sách phòng). */
export const GENERIC_OBJECTS: Record<string, GenericSpec> = {
  [NOTES_OBJECTS.folder.slug]: {
    id: NOTES_OBJECTS.folder.id,
    prefix: 'FOLMOCKNEW',
    lookups: { owner: 'person', parent_folder: NOTES_OBJECTS.folder.slug, created_by: 'person', updated_by: 'person' },
    writable: ['name', 'parent_folder', 'owner'],
    required: ['name', 'owner'],
  },
  [NOTES_OBJECTS.note.slug]: {
    id: NOTES_OBJECTS.note.id,
    prefix: 'NOTMOCKNEW',
    lookups: {
      owner: 'person', viewers: 'person', editors: 'person', created_by: 'person', updated_by: 'person',
      folder: NOTES_OBJECTS.folder.slug, viewer_departments: 'department', editor_departments: 'department', tags: NOTES_OBJECTS.tag.slug,
    },
    writable: ['name', 'folder', 'owner', 'content', 'visibility', 'viewers', 'editors', 'viewer_departments', 'editor_departments', 'tags'],
    required: ['name', 'owner'],
  },
  [NOTES_OBJECTS.tag.slug]: { id: NOTES_OBJECTS.tag.id, prefix: 'TAGMOCKNEW', lookups: { created_by: 'person' }, writable: ['name'], required: ['name'] },
  [NOTES_OBJECTS.pin.slug]: {
    id: NOTES_OBJECTS.pin.id,
    prefix: 'PINMOCKNEW',
    lookups: { person: 'person', note: NOTES_OBJECTS.note.slug },
    writable: ['note', 'order', 'person'],
    required: ['note', 'person'],
  },
  [SETTINGS_OBJECT.slug]: {
    id: SETTINGS_OBJECT.id,
    prefix: 'USTMOCKNEW',
    lookups: { created_by: 'person', updated_by: 'person' },
    writable: [WALLPAPER_FIELD],
    required: [],
  },
  department_personnel: { id: null, prefix: 'DPPMOCK', lookups: { personnel: 'person', department: 'department' }, writable: [], required: [] },
  department: { id: null, prefix: 'DEPMOCK', lookups: {}, writable: [], required: [] },
};
const GENERIC_BY_ID = new Map(Object.entries(GENERIC_OBJECTS).flatMap(([slug, s]) => (s.id ? [[s.id, slug] as const] : [])));
/** Field nhiều giá trị của ghi chú: mảng ID ≥ 1 phần tử hoặc null (rỗng không gửi `[]`). */
const NOTE_LIST_FIELDS = ['viewers', 'editors', 'viewer_departments', 'editor_departments', 'tags'];
const VISIBILITIES = ['private', 'shared', 'public'];

export class MockCogover {
  meId: string;
  people = new Map<string, MockPerson>();
  tasks = new Map<string, MockTask>();
  activities = new Map<string, MockActivity>();
  /** Bản ghi các object chung theo slug (Ghi chú, user_settings, phòng ban) — mặc định rỗng. */
  records: Record<string, GenericRow[]> = Object.fromEntries(Object.keys(GENERIC_OBJECTS).map((k) => [k, []]));
  readonly requests: RecordedRequest[] = [];
  readonly violations: string[] = [];
  /** Default Workspace áp khi tạo (người theo dõi và dự án mặc định của Workspace). */
  createDefaults: { ccs: string[]; project: string } = { ccs: [], project: 'PRJMOCKDEFAULT' };
  /** Đuôi file server nhận (null = nhận mọi đuôi). */
  allowedExts: Set<string> | null = new Set(ALLOWED_FILE_EXTS);
  /** Đuôi field `_attachments` nhận (ảnh dán vào mô tả); null = nhận mọi đuôi. */
  inlineAllowedExts: Set<string> | null = new Set(INLINE_ALLOWED_EXTS);
  /** `url` trong metadata upload `_attachments`: tuyệt đối `<origin>/files/0/…` hoặc tương đối `/files/0/…`. */
  inlineUrlStyle: 'absolute' | 'relative' = 'absolute';
  /** Origin của app (đặt ở install) — để dựng `url` tuyệt đối như server thật. */
  origin = '';
  /**
   * Quy trình trạng thái (transition rule "Status"): dùng cho GET rule và cho server kiểm 10200/10201.
   * null = Workspace không có rule (GET trả danh sách rỗng, server không chặn).
   */
  statusFlows: StatusFlowStep[] | null = WORKSPACE_STATUS_FLOWS.map((f) => ({ ...f }));
  /** GET rule trả HTTP 403 (app không đọc được rule) — server vẫn kiểm theo `statusFlows`. */
  ruleReadForbidden = false;
  /** Ghi đè thuộc tính rule trả về khi GET (ví dụ `{ status: 0 }` = rule tắt, `{ shouldFilterRecord: true }`) — server vẫn kiểm theo `statusFlows`. */
  ruleOverrides: Record<string, unknown> = {};
  /** Rule app đã đọc được (lần GET gần nhất); null = chưa đọc / không có / không đọc được. */
  private servedFlows: StatusFlowStep[] | null = null;
  private injected: Injected[] = [];
  private holds: { pred: Pred; gate: Promise<void>; release: () => void }[] = [];
  private cursors = new Map<string, number>();
  private seq = 0;
  private idSeq = 0;
  /** Đồng hồ server mock (ms) cho created/updated. */
  private clock: number;

  constructor(dataset: Dataset, now: number) {
    this.meId = dataset.meId;
    this.clock = now;
    this.load(dataset);
  }

  load(dataset: Dataset) {
    this.meId = dataset.meId;
    this.people = new Map(dataset.people.map((p) => [p.id, { ...p }]));
    this.tasks = new Map(dataset.tasks.map((t) => [t.id, structuredClone(t)]));
    this.activities = new Map((dataset.activities ?? []).map((a) => [a.id, structuredClone(a)]));
  }

  /** Thay toàn bộ activity (giữ task). */
  setActivities(list: MockActivity[]) {
    this.activities = new Map(list.map((a) => [a.id, structuredClone(a)]));
  }

  addActivities(...list: MockActivity[]) {
    for (const a of list) this.activities.set(a.id, structuredClone(a));
  }

  /** Activity của một task, mới nhất (created) trước. */
  activitiesOf(taskId: string) {
    return [...this.activities.values()].filter((a) => a.Task === taskId).sort((a, b) => b.created - a.created);
  }

  setTasks(tasks: MockTask[]) {
    this.tasks = new Map(tasks.map((t) => [t.id, structuredClone(t)]));
  }

  addTasks(...tasks: MockTask[]) {
    for (const t of tasks) this.tasks.set(t.id, structuredClone(t));
  }

  task(id: string) {
    return this.tasks.get(id);
  }

  /* ---------------- object chung (Ghi chú, Cài đặt) ---------------- */

  /** Thay toàn bộ bản ghi của một object chung. */
  setRecords(slug: string, rows: GenericRow[]) {
    this.records[slug] = rows.map((r) => structuredClone(r));
  }

  addRecords(slug: string, ...rows: GenericRow[]) {
    (this.records[slug] ??= []).push(...rows.map((r) => structuredClone(r)));
  }

  rows(slug: string): GenericRow[] {
    return this.records[slug] ?? [];
  }

  record(slug: string, id: string): GenericRow | undefined {
    return this.rows(slug).find((r) => r.id === id);
  }

  /** Request ghi (tạo / sửa / xoá) trên object chung `slug`. */
  genericWrites(slug: string, kind?: 'create' | 'update' | 'delete') {
    const id = GENERIC_OBJECTS[slug]?.id;
    return this.writes().filter((r) => r.body?.object_type === id && (!kind || r.kind === kind));
  }

  /** Request list object chung `slug`. */
  genericLists(slug: string) {
    return this.byKind('list').filter((r) => r.body?.object_slug === slug);
  }

  /** Upload ảnh nền (`desktop_wallpaper` / `user_settings`). */
  wallpaperUploads() {
    return this.uploads().filter((r) => r.upload?.fields.field_slug === WALLPAPER_FIELD);
  }

  /* ---------------- truy vấn request đã ghi ---------------- */

  byKind(kind: Kind) {
    return this.requests.filter((r) => r.kind === kind);
  }
  writes() {
    return this.requests.filter((r) => r.kind === 'create' || r.kind === 'update' || r.kind === 'delete');
  }
  updates(id?: string) {
    return this.byKind('update').filter((r) => !id || r.body?.data?.id === id);
  }
  uploads() {
    return this.byKind('upload');
  }
  /** Upload ảnh trong mô tả vào `_attachments` (multipart có field_id/object_id). */
  inlineUploads() {
    return this.uploads().filter((r) => isInlineUpload(r));
  }
  /** Upload file đính kèm (`attachment_files`, field_slug/object_slug). */
  attachmentUploads() {
    return this.uploads().filter((r) => !isInlineUpload(r));
  }
  creates() {
    return this.byKind('create');
  }
  /** Request tìm nhân sự cho danh sách @mention (list personnel, type 3 — CONTRACT 3f). */
  mentionSearches() {
    return this.byKind('list').filter((r) => r.body?.object_slug === 'personnel' && r.body?.type === 3);
  }
  /** Request đọc transition rule. */
  ruleReads() {
    return this.byKind('rule');
  }
  /** Bước trạng thái server cho phép từ `from` (null = không có rule). */
  allowedFrom(from: string): string[] | null {
    if (!this.statusFlows) return null;
    return this.statusFlows.filter((f) => f.from === from).map((f) => f.to);
  }
  /** Tạo task (object_type task). */
  taskCreates() {
    return this.creates().filter((r) => r.body?.object_type === OBJECT_TYPE);
  }
  /** Tạo ghi chú (object_type activity). */
  activityCreates() {
    return this.creates().filter((r) => r.body?.object_type === ACTIVITY_OBJECT_TYPE);
  }
  /** Sửa ghi chú (10201 trên activity). */
  activityUpdates() {
    return this.byKind('update').filter((r) => r.body?.object_type === ACTIVITY_OBJECT_TYPE);
  }
  /** Xoá ghi chú (218 trên activity). */
  activityDeletes() {
    return this.byKind('delete').filter((r) => r.body?.object_type === ACTIVITY_OBJECT_TYPE);
  }
  /** Request list Object activity (timeline theo `Task`, hoặc đọc 1 bản ghi theo `id`). */
  activityLists(taskId?: string) {
    return this.byKind('list').filter(
      (r) =>
        r.body?.object_slug === 'activity' &&
        (!taskId || (r.body.filters ?? []).some((f: any) => f.field === 'Task' && f.params === taskId)),
    );
  }
  /** Đọc lại 1 activity theo id. */
  activityReadById(id?: string) {
    return this.byKind('list').filter(
      (r) =>
        r.body?.object_slug === 'activity' &&
        (r.body.filters ?? []).some((f: any) => f.field === 'id' && f.op === '=' && (!id || f.params === id)),
    );
  }
  /** Upload ảnh dán vào ghi chú (`_attachments` của activity). */
  activityImageUploads() {
    return this.uploads().filter((r) => r.upload?.fields.field_id === ACTIVITY_INLINE_FIELD_ID);
  }
  deletes() {
    return this.byKind('delete');
  }
  /** Request list task có filter status ⊂ nhóm (open/done). */
  taskLists(group?: 'open' | 'done') {
    return this.byKind('list').filter((r) => {
      if (r.body?.object_slug !== 'task') return false;
      if (!group) return true;
      const st = (r.body.filters ?? []).find((f: any) => f.field === 'status');
      if (!st) return false;
      const params: string[] = Array.isArray(st.params) ? st.params : [st.params];
      const set = group === 'open' ? ['new', 'in_progress', 'pending', 'on_hold'] : ['resolved', 'closed', 'cancelled'];
      return params.length > 0 && params.every((p) => set.includes(p));
    });
  }
  /** Các field vai trò (assignee/reporter/ccs) có trong filter của request, đã sắp xếp. */
  static roleFields(r: RecordedRequest): string[] {
    return [
      ...new Set(
        (r.body?.filters ?? [])
          .map((f: any) => f.field)
          .filter((f: string) => f === 'assignee' || f === 'reporter' || f === 'ccs'),
      ),
    ].sort() as string[];
  }

  /** Request đọc 1 task theo id. */
  readById(id?: string) {
    return this.byKind('list').filter(
      (r) =>
        r.body?.object_slug === 'task' &&
        (r.body.filters ?? []).some((f: any) => f.field === 'id' && f.op === '=' && (!id || f.params === id)),
    );
  }

  /* ---------------- chèn lỗi / giữ response ---------------- */

  failNext(pred: Pred, resp: { status?: number; body?: any; headers?: Record<string, string> }, times = 1) {
    this.injected.push({
      pred,
      times,
      status: resp.status ?? 200,
      body: resp.body ?? { r: 500, msg: 'Lỗi giả lập' },
      headers: resp.headers,
    });
  }

  hold(pred: Pred) {
    let release!: () => void;
    const gate = new Promise<void>((res) => (release = res));
    const h = { pred, gate, release };
    this.holds.push(h);
    return {
      release: () => {
        this.holds = this.holds.filter((x) => x !== h);
        release();
      },
    };
  }

  /* ---------------- cài route ---------------- */

  /** Token CSRF ngẫu nhiên mỗi test → app phải đọc cookie, không thể hardcode. */
  readonly xsrf = `e2e-xsrf-${Math.random().toString(36).slice(2, 10)}`;

  async install(context: BrowserContext, baseURL: string) {
    const origin = new URL(baseURL).origin;
    this.origin = origin;
    await context.addCookies([{ name: 'XSRF-TOKEN', value: this.xsrf, url: baseURL }]);
    // vite preview của app có mock dev riêng và đặt Set-Cookie XSRF-TOKEN=mock-csrf-token:
    // bỏ Set-Cookie khỏi mọi response tĩnh để cookie do test kiểm soát.
    // Link tải giống thật: không có ?redirect=true → JSON {url} ký tạm; có → nội dung file (octet-stream).
    await context.route(
      (url) => url.origin === origin && url.pathname.startsWith('/files/'),
      async (route, request) => {
        const url = new URL(request.url());
        const redirectParam = url.searchParams.get('redirect') === 'true';
        // Ảnh công khai trong mô tả (`_attachments`): /files/0/<file_id>/<resolution_size>/<fileName>.
        const pub = url.pathname.match(/^\/files\/0\/([^/]+)\/([^/]+)\/(.+)$/);
        if (pub) {
          const fileId = decodeURIComponent(pub[1]);
          const pubEntry = this.fileStore.get(fileId);
          this.fileGets.push({ fileId, redirect: redirectParam, size: decodeURIComponent(pub[2]), path: url.pathname, query: url.search });
          if (!pubEntry) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'File not found.' });
          if (!redirectParam)
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ url: `https://files.cogover.example/SIGNED-MOCK/${pub[1]}/${encodeURIComponent(pubEntry.fileName)}` }),
            });
          const ext = pubEntry.fileName.includes('.') ? pubEntry.fileName.split('.').pop()!.toLowerCase() : '';
          return route.fulfill({ status: 200, contentType: MIME_BY_EXT[ext] ?? 'application/octet-stream', body: pubEntry.content });
        }
        const m = url.pathname.match(/^\/files\/([^/]+)\/original\/(.+)$/);
        const entry = m ? this.fileStore.get(decodeURIComponent(m[1])) : undefined;
        const redirect = url.searchParams.get('redirect') === 'true';
        if (m) this.fileGets.push({ fileId: decodeURIComponent(m[1]), redirect });
        if (!entry) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'File not found.' });
        if (!redirect)
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ url: `https://files.cogover.example/SIGNED-MOCK/${m![1]}/${encodeURIComponent(entry.fileName)}` }),
          });
        // Ảnh nền (CONTRACT 10.1): server trả thẳng ảnh (image/png…); file đính kèm: octet-stream tải về.
        if (entry.mime) return route.fulfill({ status: 200, contentType: entry.mime, body: entry.content });
        return route.fulfill({
          status: 200,
          contentType: 'application/octet-stream',
          headers: { 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(entry.fileName)}` },
          body: entry.content,
        });
      },
    );
    await context.route(
      (url) => url.origin === origin && !/^\/(api|files)\//.test(url.pathname),
      async (route) => {
        // Hiếm khi Playwright báo "Fetch response has been disposed" giữa route.fetch() và fulfill
        // (body bị xoá khỏi store trước khi fulfill) → fetch lại, tối đa 3 lần.
        for (let attempt = 1; ; attempt++) {
          try {
            const resp = await route.fetch();
            const headers = { ...resp.headers() };
            delete headers['set-cookie'];
            await route.fulfill({ response: resp, headers });
            return;
          } catch (e) {
            if (attempt >= 3 || !/disposed/i.test(String((e as Error)?.message ?? e))) throw e;
          }
        }
      },
    );
    await context.route(/\/api\/v\d+\//, (route, request) => this.handle(route, request));
  }

  private async handle(route: Route, request: Request) {
    const url = new URL(request.url());
    const headers = request.headers();
    const isUpload = url.pathname === '/api/v1/file/upload/v2/client_upload';
    let body: any = null;
    let upload: UploadInfo | undefined;
    if (isUpload) {
      upload = parseMultipart(request.postDataBuffer(), headers['content-type'] ?? '');
    } else {
      try {
        body = request.postDataJSON();
      } catch {
        body = request.postData();
      }
    }
    const service = headers['x-req-service'];
    const kind: Kind = isUpload
      ? 'upload'
      : url.pathname === '/api/v1/records/list'
        ? 'list'
        : url.pathname === '/api/v1/records' && service === SERVICE.create
          ? 'create'
          : url.pathname === '/api/v1/records' && service === SERVICE.update
            ? 'update'
            : url.pathname === '/api/v1/records/delete'
              ? 'delete'
              : url.pathname === TRANSITION_RULE_PATH && request.method() === 'GET'
                ? 'rule'
                : 'unknown';
    const rec: RecordedRequest = {
      seq: ++this.seq,
      kind,
      path: url.pathname,
      method: request.method(),
      headers,
      body,
      upload,
      query: Object.fromEntries(url.searchParams.entries()),
    };
    this.requests.push(rec);
    this.checkProtocol(rec);

    for (const h of this.holds) if (h.pred(rec)) await h.gate;

    const inj = this.injected.find((i) => i.times > 0 && i.pred(rec));
    if (inj) {
      inj.times--;
      rec.status = inj.status;
      rec.response = inj.body;
      await route.fulfill({
        status: inj.status,
        contentType: 'application/json',
        headers: { ...(inj.headers ?? {}), [MOCK_MARK_HEADER]: '1' },
        body: typeof inj.body === 'string' ? inj.body : JSON.stringify(inj.body),
      });
      return;
    }

    let out: { status: number; json: any };
    try {
      out = this.dispatch(rec);
    } catch (e) {
      this.violations.push(`#${rec.seq} ${rec.path}: exception ${(e as Error).message}`);
      out = { status: 200, json: { r: 99, msg: `Mock lỗi: ${(e as Error).message}` } };
    }
    rec.status = out.status;
    rec.response = out.json;
    await route.fulfill({
      status: out.status,
      contentType: 'application/json',
      headers: { [MOCK_MARK_HEADER]: '1' },
      body: JSON.stringify(out.json),
    });
  }

  private checkProtocol(r: RecordedRequest) {
    const v = (m: string) => this.violations.push(`#${r.seq} ${r.kind} ${r.path}: ${m}`);
    if (r.kind === 'rule') {
      // CONTRACT mục 4 "Quy trình trạng thái": GET ?objectSlug=task, cookie + CSRF, không x-req-*.
      if (r.query?.objectSlug !== 'task') v(`objectSlug "${r.query?.objectSlug}" (phải task)`);
      if (r.headers['x-csrf-token'] !== this.xsrf) v('x-csrf-token không bằng cookie XSRF-TOKEN');
      if (r.headers['x-xsrf-token'] !== this.xsrf) v('x-xsrf-token không bằng cookie XSRF-TOKEN');
      if (r.headers['x-req-service'] !== undefined) v('GET rule không được gửi x-req-service');
      if (r.headers['x-req-type'] !== undefined) v('GET rule không được gửi x-req-type');
      return;
    }
    if (r.method !== 'POST') v(`method ${r.method} (phải POST)`);
    if (r.kind === 'upload') {
      // Upload: multipart, có CSRF, KHÔNG gửi x-req-service / x-req-type (contract mục 4).
      if (!(r.headers['content-type'] ?? '').startsWith('multipart/form-data')) v(`content-type "${r.headers['content-type']}" (phải multipart/form-data)`);
      if (r.headers['x-csrf-token'] !== this.xsrf) v('x-csrf-token không bằng cookie XSRF-TOKEN');
      if (r.headers['x-xsrf-token'] !== this.xsrf) v('x-xsrf-token không bằng cookie XSRF-TOKEN');
      if (r.headers['x-req-service'] !== undefined) v('upload không được gửi x-req-service');
      if (r.headers['x-req-type'] !== undefined) v('upload không được gửi x-req-type');
      if (isInlineUpload(r)) {
        // Ảnh dán vào mô tả task → `_attachments` của task (CONTRACT 3b); ảnh dán vào ghi chú → `_attachments` của activity (3c).
        // Theo field_id + object_id đúng cặp, không có slug.
        const fid = r.upload?.fields.field_id;
        const oid = r.upload?.fields.object_id;
        const pairOk = (fid === INLINE_FIELD_ID && oid === OBJECT_TYPE) || (fid === ACTIVITY_INLINE_FIELD_ID && oid === ACTIVITY_OBJECT_TYPE);
        if (!pairOk)
          v(`field_id/object_id "${fid}"/"${oid}" (phải ${INLINE_FIELD_ID}/${OBJECT_TYPE} hoặc ${ACTIVITY_INLINE_FIELD_ID}/${ACTIVITY_OBJECT_TYPE})`);
        if (r.upload?.fields.field_slug !== undefined) v('upload ảnh mô tả không được gửi field_slug');
        if (r.upload?.fields.object_slug !== undefined) v('upload ảnh mô tả không được gửi object_slug');
      } else {
        // File đính kèm task (attachment_files/task) hoặc ảnh nền (desktop_wallpaper/user_settings — CONTRACT 10.1).
        const fs = r.upload?.fields.field_slug;
        const os = r.upload?.fields.object_slug;
        const pairOk = (fs === 'attachment_files' && os === 'task') || (fs === WALLPAPER_FIELD && os === SETTINGS_OBJECT.slug);
        if (!pairOk) v(`field_slug/object_slug "${fs}"/"${os}" (phải attachment_files/task hoặc ${WALLPAPER_FIELD}/${SETTINGS_OBJECT.slug})`);
      }
      if (!r.upload?.fileName) v('thiếu phần file');
      return;
    }
    if (!(r.headers['content-type'] ?? '').includes('application/json')) v(`content-type "${r.headers['content-type']}"`);
    if (r.headers['x-req-type'] !== '9') v(`x-req-type "${r.headers['x-req-type']}" (phải "9")`);
    if (r.headers['x-csrf-token'] !== this.xsrf) v('x-csrf-token không bằng cookie XSRF-TOKEN');
    if (r.headers['x-xsrf-token'] !== this.xsrf) v('x-xsrf-token không bằng cookie XSRF-TOKEN');
    const expectService: Record<string, string[]> = {
      '/api/v1/records/list': [SERVICE.list],
      '/api/v1/records': [SERVICE.create, SERVICE.update],
      '/api/v1/records/delete': [SERVICE.delete],
    };
    const allowed = expectService[r.path];
    if (!allowed) v('endpoint ngoài contract');
    else if (!allowed.includes(r.headers['x-req-service'])) v(`x-req-service "${r.headers['x-req-service']}" (phải ${allowed.join('/')})`);
  }

  private ok(data: any) {
    return { status: 200, json: { r: 0, msg: 'Success', data } };
  }

  private dispatch(r: RecordedRequest): { status: number; json: any } {
    const isActivity = r.body?.object_type === ACTIVITY_OBJECT_TYPE;
    const genericSlug = GENERIC_BY_ID.get(r.body?.object_type);
    if (genericSlug && (r.kind === 'create' || r.kind === 'update' || r.kind === 'delete')) return this.writeGeneric(r, genericSlug);
    switch (r.kind) {
      case 'list':
        return this.list(r);
      case 'create':
        return isActivity ? this.createActivity(r) : this.create(r);
      case 'update':
      case 'delete':
        if (isActivity) return r.kind === 'update' ? this.updateActivity(r) : this.delActivity(r);
        return r.kind === 'update' ? this.update(r) : this.del(r);
      case 'upload':
        return this.uploadFile(r);
      case 'rule':
        return this.readRule();
      default:
        return { status: 404, json: { r: 404, msg: 'Not found (mock)' } };
    }
  }

  /* ---------------- transition rule ---------------- */

  /** Danh sách rule của Object task như API thật: rule "Status" active trên field status (hoặc rỗng / 403). */
  private readRule(): { status: number; json: any } {
    if (this.ruleReadForbidden) {
      this.servedFlows = null;
      return { status: 403, json: { r: 403, msg: 'Access denied (mock)' } };
    }
    // Rule tắt / chỉ áp cho một số record → app không được dùng nó để chặn (CONTRACT mục 4).
    const usable = this.ruleOverrides.status === undefined || Number(this.ruleOverrides.status) === 1;
    const filtered = this.ruleOverrides.shouldFilterRecord === true;
    this.servedFlows = this.statusFlows && usable && !filtered ? this.statusFlows.map((f) => ({ ...f })) : null;
    if (!this.statusFlows) return this.ok([]);
    return this.ok([
      {
        id: 'TRDEMOSTATUS1',
        name: 'Status',
        slug: 'status',
        status: 1,
        objectFieldId: STATUS_FIELD_ID,
        objectTypeId: OBJECT_TYPE,
        objectSlug: 'task',
        workspaceId: WORKSPACE_ID,
        shouldFilterRecord: false,
        flows: this.statusFlows.map((f, i) => ({
          id: `TRFMOCK${String(i + 1).padStart(4, '0')}`,
          name: `${f.from}→${f.to}`,
          slug: `flow_${i + 1}`,
          allowUndo: f.from !== '_initial',
          originValue: f.from,
          targetValue: f.to,
          objectFieldId: STATUS_FIELD_ID,
          objectTypeId: OBJECT_TYPE,
          transitionRuleId: 'TRDEMOSTATUS1',
          conditionBlocks: [],
          metaData: '{}',
        })),
        ...this.ruleOverrides,
      },
    ]);
  }

  /** App đã biết rule (đọc được) mà vẫn gửi bước bị chặn → vi phạm "bước bị chặn trong app → không gửi request". */
  private checkKnownStep(r: RecordedRequest, from: string, to: string) {
    if (this.servedFlows && !this.servedFlows.some((f) => f.from === from && f.to === to))
      this.violations.push(`#${r.seq} ${r.kind}: gửi bước trạng thái ${from} → ${to} dù rule đã đọc không cho phép`);
  }

  /* ---------------- list ---------------- */

  private list(r: RecordedRequest) {
    const b = r.body ?? {};
    if (b.type === undefined || b.type === null) return { status: 200, json: { r: 27, msg: 'type is required' } };
    if (!Array.isArray(b.filters) || b.filters.length === 0) return { status: 200, json: { r: 25, msg: 'filters is empty' } };
    let source: any[];
    let valueOf: (row: any, field: string) => any;
    if (b.object_slug === 'task') {
      source = [...this.tasks.values()];
      valueOf = (t: MockTask, f) => (t as any)[f];
    } else if (b.object_slug === 'personnel') {
      source = [...this.people.values()];
      // Field ảo như server: first_last_name / last_first_name; deleted mặc định 0.
      valueOf = (p: MockPerson, f) =>
        f === 'first_last_name'
          ? `${p.first_name} ${p.last_name}`.trim()
          : f === 'last_first_name'
            ? `${p.last_name} ${p.first_name}`.trim()
            : f === 'deleted'
              ? (p.deleted ?? 0)
              : f === 'account_email'
                ? (p.account_email ?? null)
                : (p as any)[f];
    } else if (b.object_slug === 'activity') {
      this.checkActivityList(r);
      source = [...this.activities.values()];
      valueOf = (a: MockActivity, f) => (a as any)[f];
    } else if (b.object_slug in GENERIC_OBJECTS) {
      if (!Array.isArray(b.fields) || !b.fields.includes('id')) this.violations.push(`#${r.seq} list ${b.object_slug}: fields phải có "id"`);
      source = [...this.rows(b.object_slug)];
      valueOf = (row: GenericRow, f) => row[f];
    } else {
      this.violations.push(`#${r.seq} list object_slug "${b.object_slug}" ngoài contract`);
      return { status: 200, json: { r: 404, msg: 'object not found' } };
    }
    const results = b.filters.map((f: any) => (row: any) => this.matchFilter(r, f, valueOf(row, f.field)));
    const combine = (row: any) => {
      const vals: boolean[] = results.map((fn: (x: any) => boolean) => fn(row));
      if (b.type === 1) return vals.every(Boolean);
      if (b.type === 2) return vals.some(Boolean);
      if (b.type === 3) return evalLogic(b.logic_sequence || vals.map((_, i) => i + 1).join(' AND '), vals);
      this.violations.push(`#${r.seq} type ${b.type} không hỗ trợ`);
      return false;
    };
    let rows = source.filter(combine);
    rows = sortRows(rows, b.sorts ?? []);
    const total = rows.length;
    const size = Math.min(Math.max(Number(b.size) || 20, 1), 100);
    let offset = 0;
    const sa = b.search_after ?? [];
    if (Array.isArray(sa) && sa.length > 0) {
      const key = JSON.stringify(sa);
      if (!this.cursors.has(key)) {
        this.violations.push(`#${r.seq} search_after không phải giá trị server đã trả (phải gửi lại nguyên văn)`);
        return { status: 200, json: { r: 400, msg: 'invalid search_after' } };
      }
      offset = this.cursors.get(key)!;
    }
    const page = rows.slice(offset, offset + size);
    let searchAfter: any[] = [];
    if (page.length > 0) {
      const last = page[page.length - 1];
      searchAfter = [typeof last.updated === 'number' ? last.updated : offset + page.length, `${last.id}#${offset + page.length}`];
      this.cursors.set(JSON.stringify(searchAfter), offset + page.length);
    }
    const fields: string[] | undefined = Array.isArray(b.fields) ? b.fields : undefined;
    const outRows = page.map((row) =>
      b.object_slug === 'task'
        ? this.renderTask(row, fields)
        : b.object_slug === 'activity'
          ? this.renderActivity(row, fields)
          : b.object_slug in GENERIC_OBJECTS
            ? this.renderGeneric(b.object_slug, row, fields)
            : this.renderPerson(row, fields),
    );
    return this.ok({ total, rows: outRows, search_after: searchAfter });
  }

  private matchFilter(r: RecordedRequest, f: any, value: any): boolean {
    const sub = (p: any) => (p === '$currentUser' ? this.meId : p);
    const params = Array.isArray(f.params) ? f.params.map(sub) : sub(f.params);
    const arr = Array.isArray(value) ? value : null;
    switch (f.op) {
      case '=':
        return arr ? arr.includes(params) : value === params;
      case '!=':
        // So lỏng theo chuỗi (deleted 1 / "1").
        return arr ? !arr.some((v) => String(v) === String(params)) : String(value ?? '') !== String(params ?? '');
      case 'in': {
        const ps: any[] = Array.isArray(params) ? params : [params];
        return arr ? arr.some((v) => ps.includes(v)) : ps.includes(value);
      }
      case 'not in': {
        const ps: any[] = Array.isArray(params) ? params : [params];
        return arr ? !arr.some((v) => ps.includes(v)) : !ps.includes(value);
      }
      case 'like':
        // Không phân biệt hoa/thường và dấu; chuỗi rỗng khớp tất cả.
        return foldText(value).includes(foldText(params));
      case 'startsWith':
        return String(value ?? '').startsWith(String(params));
      case 'not null':
        return value !== null && value !== undefined && value !== '' && !(arr && arr.length === 0);
      case 'is null':
        return value === null || value === undefined || value === '' || (arr !== null && arr.length === 0);
      case '>':
        return Number(value) > Number(params);
      case '>=':
        return Number(value) >= Number(params);
      case '<':
        return Number(value) < Number(params);
      case '<=':
        return Number(value) <= Number(params);
      case 'between':
        return Number(value) >= Number(params[0]) && Number(value) <= Number(params[1]);
      default:
        this.violations.push(`#${r.seq} op "${f.op}" chưa hỗ trợ trong mock`);
        return false;
    }
  }

  /** Lookup trả nguyên object nhân sự kèm PII giả (app chỉ được đọc id/first_name/last_name/avatar). */
  personObject(id: string | null) {
    if (!id) return null;
    const p = this.people.get(id);
    if (!p) return null;
    return {
      ...p,
      object_type: 'OTPERSONNEL',
      workspace_id: WORKSPACE_ID,
      name: `${p.last_name} ${p.first_name}`.trim(),
      first_last_name: `${p.first_name} ${p.last_name}`.trim(),
      last_first_name: `${p.last_name} ${p.first_name}`.trim(),
      work_email: `${p.id.toLowerCase()}@pii.invalid`,
      account_email: p.account_email ?? null,
      deleted: p.deleted ?? 0,
      emails: [`${p.id.toLowerCase()}.private@pii.invalid`],
      phone_numbers: ['+84 900 111 222'],
      birthday: 631152000000,
      code: `NV-${p.id.slice(-4)}`,
      gender: 'other',
      timezone: 'Asia/Saigon',
    };
  }

  private renderTask(t: MockTask, fields?: string[]) {
    const full: Record<string, any> = {
      id: t.id,
      name: t.name,
      subject: t.subject,
      description: t.description,
      due_date: t.due_date,
      priority: t.priority,
      status: t.status,
      reporter: this.personObject(t.reporter),
      assignee: this.personObject(t.assignee),
      ccs: t.ccs.map((c) => this.personObject(c)).filter(Boolean),
      created: t.created,
      updated: t.updated,
      project: t.project ?? null,
      attachment_files: t.attachment_files ?? null,
      _attachments: t._attachments ?? null,
    };
    if (!fields) return full;
    return Object.fromEntries(fields.filter((f) => f in full).map((f) => [f, full[f]]));
  }

  /** Activity như API thật: lookup `created_by` trả nguyên object nhân sự, `Task` trả object task rút gọn. */
  private renderActivity(a: MockActivity, fields?: string[]) {
    const t = this.tasks.get(a.Task);
    const full: Record<string, any> = {
      id: a.id,
      name: a.name,
      activity_type: a.activity_type,
      content: a.content,
      created: a.created,
      created_by: this.personObject(a.created_by),
      activity_time: a.activity_time,
      files: a.files ?? null,
      Task: t ? { id: t.id, name: t.name, subject: t.subject, object_type: OBJECT_TYPE } : null,
      note_type: a.note_type ?? null,
      source_object: a.source_object ?? null,
      source_record: a.source_record ?? null,
      manual_log: a.manual_log ?? null,
      _attachments: a._attachments ?? null,
    };
    if (!fields) return full;
    return Object.fromEntries(fields.filter((f) => f in full).map((f) => [f, full[f]]));
  }

  /** List activity theo contract: `type: 1`, filter `Task =` (lookup_normal) hoặc `id =`, `fields` có id, sort created desc. */
  private checkActivityList(r: RecordedRequest) {
    const b = r.body ?? {};
    const v = (m: string) => this.violations.push(`#${r.seq} list activity: ${m}`);
    const fields: string[] = Array.isArray(b.fields) ? b.fields : [];
    if (!fields.includes('id')) v('fields phải có "id"');
    const byTask = (b.filters ?? []).find((f: any) => f.field === 'Task');
    const byId = (b.filters ?? []).find((f: any) => f.field === 'id');
    if (!byTask && !byId) v('phải lọc theo Task (hoặc id khi đọc lại 1 bản ghi)');
    if (byTask) {
      if (byTask.op !== '=' || byTask.fieldType !== 'lookup_normal' || typeof byTask.params !== 'string')
        v(`filter Task phải {op:"=", params:"<TAS…>", fieldType:"lookup_normal"} (nhận ${JSON.stringify(byTask)})`);
      for (const f of ACTIVITY_FIELDS) if (!fields.includes(f)) v(`fields thiếu "${f}"`);
      const sorts = JSON.stringify(b.sorts ?? []);
      if (!/"created":\{"order":"desc"\}/.test(sorts)) v(`sort phải created desc (nhận ${sorts})`);
      if (Number(b.size) !== 15) v(`size timeline phải 15 (nhận ${b.size})`);
    }
  }

  private renderPerson(p: MockPerson, fields?: string[]) {
    const full = this.personObject(p.id)!;
    if (!fields) return full;
    return Object.fromEntries(fields.filter((f) => f in full).map((f) => [f, (full as any)[f]]));
  }

  /* ---------------- ghi ---------------- */

  private checkWriteEnvelope(r: RecordedRequest) {
    const b = r.body ?? {};
    const v = (m: string) => this.violations.push(`#${r.seq} ${r.kind}: ${m}`);
    if (b.workspace_id !== WORKSPACE_ID) v(`workspace_id "${b.workspace_id}"`);
    if (b.object_type !== OBJECT_TYPE) v(`object_type "${b.object_type}"`);
    if (r.kind !== 'delete') {
      const d = b.data ?? {};
      if (d.workspace_id !== WORKSPACE_ID) v(`data.workspace_id "${d.workspace_id}"`);
      if (d.object_type !== OBJECT_TYPE) v(`data.object_type "${d.object_type}"`);
      for (const k of Object.keys(d)) if (!ALLOWED_WRITE_FIELDS.has(k)) v(`ghi field ngoài contract "${k}"`);
      if ('subject' in d && (typeof d.subject !== 'string' || d.subject.trim().length < 1 || d.subject.length > 255))
        v(`subject không hợp lệ (độ dài ${String(d.subject ?? '').length})`);
      if ('due_date' in d && typeof d.due_date !== 'number') v(`due_date phải là số ms (nhận ${typeof d.due_date})`);
      if ('priority' in d && d.priority !== null && !['urgent', 'high', 'medium', 'low'].includes(d.priority))
        v(`priority "${d.priority}"`);
      if (
        'status' in d &&
        !['new', 'in_progress', 'pending', 'on_hold', 'resolved', 'closed', 'cancelled'].includes(d.status)
      )
        v(`status "${d.status}"`);
      if ('description' in d && typeof d.description !== 'string') v('description phải là chuỗi HTML');
      if ('ccs' in d) {
        // CONTRACT mục 4 (2026-10-03): sửa → mảng personnel ID, bỏ hết → null; tạo → không gửi ccs.
        // 2026-10-04: tạo có "Người theo dõi" → chỉ gửi khi có chọn (mảng ID ≥ 1), trống thì không gửi (không null / []).
        const c = d.ccs;
        if (r.kind === 'create' && (!Array.isArray(c) || c.length === 0))
          v(`tạo: ccs chỉ gửi khi có chọn người theo dõi — mảng ID ≥ 1 phần tử (nhận ${JSON.stringify(c)})`);
        else if (c !== null && (!Array.isArray(c) || c.length === 0))
          v(`ccs phải là mảng personnel ID ≥ 1 phần tử hoặc null (nhận ${JSON.stringify(c)})`);
        else if (Array.isArray(c)) {
          for (const x of c) if (typeof x !== 'string' || !this.people.has(x)) v(`ccs có phần tử không phải personnel ID: ${JSON.stringify(x)}`);
          if (new Set(c).size !== c.length) v('ccs có ID trùng');
        }
      }
      if ('attachment_files' in d) {
        const a = d.attachment_files;
        if (a === null) {
          if (r.kind === 'create') v('tạo: không có file thì không gửi attachment_files');
        } else if (!Array.isArray(a) || a.length === 0) v('attachment_files phải là mảng ≥ 1 phần tử hoặc null');
        else
          for (const f of a) {
            const m = typeof f === 'string' ? safeJson(f) : f;
            if (!m || typeof m.file_id !== 'string' || typeof m.fileName !== 'string') v('phần tử attachment_files không phải FILE_METADATA');
          }
      }
      if ('_attachments' in d) {
        // CONTRACT 3b: chỉ gửi khi có ảnh mới; mỗi phần tử là metadata upload, url có long_text_field_id = field description.
        const a = d._attachments;
        if (!Array.isArray(a) || a.length === 0) v('_attachments phải là mảng metadata ≥ 1 phần tử (không có ảnh mới thì không gửi)');
        else
          for (const f of a) {
            const m = typeof f === 'string' ? safeJson(f) : f;
            if (!m || typeof m.file_id !== 'string' || typeof m.fileName !== 'string' || typeof m.url !== 'string')
              v('phần tử _attachments không phải FILE_METADATA');
            else if (!/[?&]long_text_field_id=OFDEMOTASKDSC(&|$)/.test(m.url)) v(`_attachments url thiếu long_text_field_id=${DESC_FIELD_ID}`);
          }
        const ids = (Array.isArray(a) ? a : []).map((f: any) => (typeof f === 'string' ? safeJson(f) : f)?.file_id);
        if (new Set(ids).size !== ids.length) v('_attachments có file_id trùng');
      }
    }
  }

  /** Ghi record quá 10 file → HTTP 422 r:608 như Workspace thật (client phải chặn trước nên cũng là violation). */
  private tooManyFiles(r: RecordedRequest): { status: number; json: any } | null {
    const a = r.body?.data?.attachment_files;
    if (!Array.isArray(a) || a.length <= MOCK_MAX_FILES) return null;
    this.violations.push(`#${r.seq} ${r.kind}: ghi ${a.length} file đính kèm (tối đa ${MOCK_MAX_FILES} mỗi công việc)`);
    return { status: 422, json: { r: 608, msg: `Field [Attachment files] max length is: ${MOCK_MAX_FILES} but got: ${a.length}.0` } };
  }

  private create(r: RecordedRequest) {
    this.checkWriteEnvelope(r);
    const tooMany = this.tooManyFiles(r);
    if (tooMany) return tooMany;
    const d = r.body?.data ?? {};
    for (const k of CREATE_REQUIRED) if (!(k in d)) this.violations.push(`#${r.seq} create thiếu field "${k}"`);
    if (r.body?.client_time_zone === undefined) this.violations.push(`#${r.seq} create thiếu client_time_zone`);
    const initial = this.allowedFrom('_initial');
    if (initial && !initial.includes(d.status)) {
      // Workspace thật: HTTP 500 r:-1 (CONTRACT mục 4 "Quy trình trạng thái").
      this.checkKnownStep(r, '_initial', d.status);
      return { status: 500, json: { r: -1, msg: `Value: [${d.status}] is not in transition rule` } };
    }
    const n = ++this.idSeq;
    const id = `TASMOCKNEW${String(n).padStart(4, '0')}`;
    const now = this.tick();
    const t: MockTask = {
      id,
      name: `TAS-${5000 + n}`,
      subject: d.subject,
      description: d.description ?? '',
      due_date: d.due_date,
      priority: d.priority ?? 'medium',
      status: d.status ?? 'new',
      attachment_files: d.attachment_files ?? null,
      _attachments: d._attachments ?? null,
      reporter: d.reporter ?? null,
      assignee: d.assignee ?? null,
      // Workspace tự áp người theo dõi mặc định khi tạo không gửi ccs.
      ccs: Array.isArray(d.ccs) && d.ccs.length ? [...d.ccs] : [...this.createDefaults.ccs],
      project: this.createDefaults.project,
      created: now,
      updated: now,
    };
    this.tasks.set(id, t);
    return this.ok({ id });
  }

  private update(r: RecordedRequest) {
    this.checkWriteEnvelope(r);
    const d = r.body?.data ?? {};
    const t = this.tasks.get(d.id);
    if (!t) return { status: 200, json: { r: 404, msg: 'Record not found' } };
    const tooMany = this.tooManyFiles(r);
    if (tooMany) return tooMany;
    if ('attachment_files' in d && Array.isArray(d.attachment_files) && d.attachment_files.length === 0)
      return { status: 200, json: { r: 607, msg: 'attachment_files: min length is: 1' } };
    if ('status' in d && d.status !== t.status) {
      const allowed = this.allowedFrom(t.status);
      if (allowed && !allowed.includes(d.status)) {
        // Workspace thật: HTTP 422 r:48 (allowUndo không cho quay ngược qua Records API).
        this.checkKnownStep(r, t.status, d.status);
        return {
          status: 422,
          json: {
            r: 48,
            msg: `Your target value [${d.status}] is not allowed, current value: [${t.status}], available values: [${allowed.join(', ')}]`,
          },
        };
      }
    }
    for (const k of ['subject', 'description', 'due_date', 'priority', 'status', 'reporter', 'assignee', 'attachment_files', '_attachments'] as const)
      if (k in d) (t as any)[k] = d[k];
    if ('ccs' in d) t.ccs = Array.isArray(d.ccs) ? [...d.ccs] : [];
    t.updated = this.tick();
    return this.ok({});
  }

  private del(r: RecordedRequest) {
    this.checkWriteEnvelope(r);
    const ids: string[] = r.body?.ids ?? [];
    if (!Array.isArray(ids) || ids.length === 0) this.violations.push(`#${r.seq} delete không có ids`);
    const deleted: string[] = [];
    const notDeleted: string[] = [];
    for (const id of ids) (this.tasks.delete(id) ? deleted : notDeleted).push(id);
    return this.ok({ deleted, not_deleted: notDeleted });
  }

  /** Ghi chú của chính mình (contract 3c 2026-10-08): chỉ note do tôi tạo mới được sửa / xoá. */
  private ownNote(id: unknown) {
    const a = typeof id === 'string' ? this.activities.get(id) : undefined;
    return a && a.activity_type === 'note' && a.created_by === this.meId ? a : null;
  }

  /** Sửa ghi chú: 10201, `data` chỉ gồm object_type, workspace_id, id, content (+ `_attachments` khi dán ảnh mới). */
  private updateActivity(r: RecordedRequest) {
    const b = r.body ?? {};
    const d = b.data ?? {};
    const v = (m: string) => this.violations.push(`#${r.seq} update activity: ${m}`);
    if (b.workspace_id !== WORKSPACE_ID) v(`workspace_id "${b.workspace_id}"`);
    if (d.workspace_id !== WORKSPACE_ID) v(`data.workspace_id "${d.workspace_id}"`);
    if (d.object_type !== ACTIVITY_OBJECT_TYPE) v(`data.object_type "${d.object_type}"`);
    if (b.client_time_zone === undefined) v('thiếu client_time_zone');
    for (const k of Object.keys(d)) if (!['object_type', 'workspace_id', 'id', 'content', '_attachments'].includes(k)) v(`ghi field ngoài contract "${k}"`);
    if (typeof d.content !== 'string' || !d.content.trim()) v('content phải là HTML không rỗng');
    const a = this.ownNote(d.id);
    if (!a) {
      v(`sửa activity "${d.id}" không phải ghi chú của tôi`);
      return { status: 200, json: { r: 403, msg: 'Permission denied (mock)' } };
    }
    a.content = d.content;
    if ('_attachments' in d) a._attachments = d._attachments;
    return this.ok({});
  }

  /** Xoá ghi chú: 218, object_type activity, ids = [một ghi chú của tôi]. */
  private delActivity(r: RecordedRequest) {
    const b = r.body ?? {};
    const ids: string[] = Array.isArray(b.ids) ? b.ids : [];
    if (b.workspace_id !== WORKSPACE_ID) this.violations.push(`#${r.seq} delete activity: workspace_id "${b.workspace_id}"`);
    if (ids.length !== 1) this.violations.push(`#${r.seq} delete activity: ids phải có đúng 1 phần tử`);
    const deleted: string[] = [];
    const notDeleted: string[] = [];
    for (const id of ids) {
      if (this.ownNote(id)) {
        this.activities.delete(id);
        deleted.push(id);
      } else {
        this.violations.push(`#${r.seq} delete activity "${id}" không phải ghi chú của tôi`);
        notDeleted.push(id);
      }
    }
    return this.ok({ deleted, not_deleted: notDeleted });
  }

  /**
   * Tạo ghi chú (CONTRACT mục 4 "Activities"): POST /api/v1/records service 10200, object_type activity.
   * Thiếu key `name` hoặc `name: null` → r:602 như Workspace thật; app luôn gửi `name: ""` (không có ô Chủ đề).
   */
  private createActivity(r: RecordedRequest) {
    const b = r.body ?? {};
    const d = b.data ?? {};
    const v = (m: string) => this.violations.push(`#${r.seq} create activity: ${m}`);
    if (b.workspace_id !== WORKSPACE_ID) v(`workspace_id "${b.workspace_id}"`);
    if (d.workspace_id !== WORKSPACE_ID) v(`data.workspace_id "${d.workspace_id}"`);
    if (d.object_type !== ACTIVITY_OBJECT_TYPE) v(`data.object_type "${d.object_type}"`);
    if (b.client_time_zone === undefined) v('thiếu client_time_zone');
    for (const k of Object.keys(d)) if (!ACTIVITY_WRITE_FIELDS.has(k)) v(`ghi field ngoài contract "${k}"`);
    if (!('name' in d) || d.name === null) {
      v('thiếu key name hoặc name = null (Workspace trả r:602)');
      return { status: 422, json: { r: 602, msg: 'Field ["name"] is required.' } };
    }
    // Contract 2026-10-03: ô soạn không có Chủ đề → luôn gửi name: "".
    if (d.name !== '') v(`name phải là chuỗi rỗng "" (nhận ${JSON.stringify(d.name)})`);
    if (d.activity_type !== 'note') v(`activity_type "${d.activity_type}" (phải note)`);
    if (d.note_type !== 'normal') v(`note_type "${d.note_type}" (phải normal)`);
    if (typeof d.content !== 'string' || !d.content.trim()) v('content phải là HTML không rỗng');
    if (typeof d.Task !== 'string' || !this.tasks.has(d.Task)) v(`Task "${d.Task}" không phải task id`);
    if (d.source_object !== 'task') v(`source_object "${d.source_object}" (phải task)`);
    if (d.source_record !== d.Task) v(`source_record "${d.source_record}" phải = Task`);
    if (d.manual_log !== 1) v(`manual_log ${JSON.stringify(d.manual_log)} (phải 1)`);
    if (typeof d.activity_time !== 'number' || !(d.activity_time > 1e12)) v(`activity_time phải là số ms (nhận ${JSON.stringify(d.activity_time)})`);
    if ('_attachments' in d) {
      const a = d._attachments;
      if (!Array.isArray(a) || a.length === 0) v('_attachments phải là mảng metadata ≥ 1 phần tử (không có ảnh thì không gửi)');
      else {
        for (const f of a) {
          const m = typeof f === 'string' ? safeJson(f) : f;
          if (!m || typeof m.file_id !== 'string' || typeof m.fileName !== 'string' || typeof m.url !== 'string')
            v('phần tử _attachments không phải FILE_METADATA');
          else if (!new RegExp(`[?&]long_text_field_id=${ACTIVITY_CONTENT_FIELD_ID}(&|$)`).test(m.url))
            v(`_attachments url thiếu long_text_field_id=${ACTIVITY_CONTENT_FIELD_ID}`);
        }
        const ids = a.map((f: any) => (typeof f === 'string' ? safeJson(f) : f)?.file_id);
        if (new Set(ids).size !== ids.length) v('_attachments có file_id trùng');
      }
    }
    const n = ++this.idSeq;
    const id = `ACTMOCKNEW${String(n).padStart(4, '0')}`;
    const now = this.tick();
    this.activities.set(id, {
      id,
      Task: d.Task,
      activity_type: d.activity_type ?? 'note',
      name: d.name,
      content: d.content ?? '',
      created_by: this.meId,
      created: now,
      activity_time: typeof d.activity_time === 'number' ? d.activity_time : now,
      files: null,
      note_type: d.note_type,
      source_object: d.source_object,
      source_record: d.source_record,
      manual_log: d.manual_log,
      _attachments: d._attachments ?? null,
    });
    return this.ok({ id });
  }


  /* ---------------- object chung: đọc / ghi ---------------- */

  /** Bản ghi của object khác khi được mở rộng trong lookup: id + name (server trả nguyên bản ghi). */
  private recordRef(slug: string, id: unknown) {
    if (typeof id !== 'string' || !id) return null;
    const r = this.record(slug, id);
    return r ? { id, name: r.name ?? '', object_type: GENERIC_OBJECTS[slug]?.id ?? 'OTSYSTEM' } : { id };
  }

  private renderGeneric(slug: string, row: GenericRow, fields?: string[]) {
    const kinds = GENERIC_OBJECTS[slug]?.lookups ?? {};
    const out: Record<string, any> = {};
    for (const f of fields ?? Object.keys(row)) {
      if (!(f in row)) continue;
      const v = row[f];
      const kind = kinds[f];
      const expand = (x: unknown) => (kind === 'person' ? this.personObject(x as string) : this.recordRef(kind, x));
      out[f] = !kind || v == null ? v : Array.isArray(v) ? v.map(expand).filter(Boolean) : expand(v);
    }
    return out;
  }

  /** Kiểm field ghi của object chung theo contract; trả lỗi server (nếu có) như Workspace. */
  private checkGenericData(r: RecordedRequest, slug: string, d: Record<string, any>): { status: number; json: any } | null {
    const v = (m: string) => this.violations.push(`#${r.seq} ${r.kind} ${slug}: ${m}`);
    const spec = GENERIC_OBJECTS[slug];
    for (const k of Object.keys(d)) if (!['id', 'object_type', 'workspace_id', ...spec.writable].includes(k)) v(`ghi field ngoài contract "${k}"`);
    const isCreate = r.kind === 'create';
    const str = (k: string) => typeof d[k] === 'string' && d[k].trim().length > 0;
    if (slug === NOTES_OBJECTS.folder.slug) {
      if ('name' in d && !str('name')) v('name phải là chuỗi không rỗng');
      if ('parent_folder' in d && d.parent_folder !== null && !this.record(slug, d.parent_folder)) v(`parent_folder "${d.parent_folder}" không phải thư mục`);
      if ('parent_folder' in d && d.parent_folder !== null && d.id) {
        // Không cho thả thư mục vào chính nó / thư mục con của nó (CONTRACT 9.3).
        const seen = new Set<string>();
        for (let cur: string | null = d.parent_folder; cur && !seen.has(cur); cur = this.record(slug, cur)?.parent_folder ?? null) {
          if (cur === d.id) {
            v('thư mục không được nằm trong chính nó / thư mục con của nó');
            break;
          }
          seen.add(cur);
        }
      }
      if (isCreate && d.owner !== this.meId) v(`owner phải là tôi (nhận ${JSON.stringify(d.owner)})`);
      if (!isCreate && 'owner' in d) v('sửa thư mục không được đổi owner');
    }
    if (slug === NOTES_OBJECTS.note.slug) {
      if ('name' in d && !str('name')) v('name phải là chuỗi không rỗng');
      if ('folder' in d && d.folder !== null && !this.record(NOTES_OBJECTS.folder.slug, d.folder)) v(`folder "${d.folder}" không phải thư mục`);
      if (isCreate && d.owner !== this.meId) v(`owner phải là tôi (nhận ${JSON.stringify(d.owner)})`);
      if (!isCreate && 'owner' in d) v('sửa ghi chú không được đổi owner');
      if (isCreate && d.visibility !== 'private') v(`tạo ghi chú: visibility phải private (nhận ${JSON.stringify(d.visibility)})`);
      if ('visibility' in d && !VISIBILITIES.includes(d.visibility)) v(`visibility "${d.visibility}"`);
      if ('content' in d) {
        const c = d.content;
        const okShape = c && typeof c === 'object' && !Array.isArray(c) && [1, 2, 3].includes(c.text_type) && (typeof c.value === 'string' || c.value === null);
        if (!okShape) v(`content phải là {text_type: 1|2|3, value} (nhận ${JSON.stringify(c)?.slice(0, 120)})`);
      }
      for (const k of NOTE_LIST_FIELDS)
        if (k in d && d[k] !== null && (!Array.isArray(d[k]) || d[k].length === 0 || d[k].some((x: unknown) => typeof x !== 'string')))
          v(`${k} phải là mảng ID ≥ 1 phần tử hoặc null (nhận ${JSON.stringify(d[k])})`);
    }
    if (slug === NOTES_OBJECTS.pin.slug && isCreate) {
      if (d.person !== this.meId) v(`ghim: person phải là tôi (nhận ${JSON.stringify(d.person)})`);
      if (!this.record(NOTES_OBJECTS.note.slug, d.note)) v(`ghim: note "${d.note}" không phải ghi chú`);
      if (typeof d.order !== 'number') v(`ghim: order phải là số (nhận ${JSON.stringify(d.order)})`);
    }
    if (slug === NOTES_OBJECTS.tag.slug && 'name' in d && !str('name')) v('thẻ: name phải là chuỗi không rỗng');
    if (slug === SETTINGS_OBJECT.slug && WALLPAPER_FIELD in d) {
      const w = d[WALLPAPER_FIELD];
      if (Array.isArray(w)) {
        // Thật: field file một giá trị nhận mảng → r:626 "not found file id" (CONTRACT 10.1).
        v(`${WALLPAPER_FIELD} phải là một object FILE_METADATA (không phải mảng)`);
        return { status: 422, json: { r: 626, msg: 'Field [Ảnh nền Desktop] not found file id' } };
      }
      if (w !== null && (typeof w !== 'object' || typeof w.file_id !== 'string' || typeof w.fileName !== 'string'))
        v(`${WALLPAPER_FIELD} phải là FILE_METADATA hoặc null (nhận ${JSON.stringify(w)?.slice(0, 120)})`);
      if (w && !this.fileStore.has(w.file_id)) v(`${WALLPAPER_FIELD}.file_id "${w.file_id}" chưa từng upload`);
      if (isCreate && w === null) v('tạo user_settings với ảnh nền null (chưa có bản ghi và về mặc định thì không cần ghi)');
    }
    return null;
  }

  /** Lưu như server: long text nhiều định dạng và file một giá trị trả về dạng chuỗi JSON. */
  private storeGeneric(k: string, v: unknown) {
    return (k === 'content' || k === WALLPAPER_FIELD) && v && typeof v === 'object' ? JSON.stringify(v) : v;
  }

  private writeGeneric(r: RecordedRequest, slug: string): { status: number; json: any } {
    const spec = GENERIC_OBJECTS[slug];
    const b = r.body ?? {};
    const v = (m: string) => this.violations.push(`#${r.seq} ${r.kind} ${slug}: ${m}`);
    if (b.workspace_id !== WORKSPACE_ID) v(`workspace_id "${b.workspace_id}"`);
    const rows = (this.records[slug] ??= []);
    if (r.kind === 'delete') {
      const ids: string[] = Array.isArray(b.ids) ? b.ids : [];
      if (!ids.length) v('delete không có ids');
      const deleted: string[] = [];
      const notDeleted: string[] = [];
      for (const id of ids) {
        const i = rows.findIndex((x) => x.id === id);
        if (i < 0 || (slug === SETTINGS_OBJECT.slug && rows[i].created_by !== this.meId)) {
          notDeleted.push(id);
          continue;
        }
        if (slug === NOTES_OBJECTS.folder.slug) {
          // App chỉ xoá thư mục trống (CONTRACT 9.3).
          if (rows.some((x) => x.parent_folder === id) || this.rows(NOTES_OBJECTS.note.slug).some((n) => n.folder === id))
            v(`xoá thư mục ${id} còn thư mục con / ghi chú`);
        }
        rows.splice(i, 1);
        deleted.push(id);
        // notes_pin.note là reference: xoá ghi chú thì ghim mất theo.
        if (slug === NOTES_OBJECTS.note.slug) this.records[NOTES_OBJECTS.pin.slug] = this.rows(NOTES_OBJECTS.pin.slug).filter((p) => p.note !== id);
      }
      return this.ok({ deleted, not_deleted: notDeleted });
    }
    const d = b.data ?? {};
    if (d.workspace_id !== WORKSPACE_ID) v(`data.workspace_id "${d.workspace_id}"`);
    if (d.object_type !== spec.id) v(`data.object_type "${d.object_type}"`);
    if (b.client_time_zone === undefined) v('thiếu client_time_zone');
    const err = this.checkGenericData(r, slug, d);
    if (err) return err;
    if (r.kind === 'create') {
      for (const f of spec.required) if (d[f] === undefined || d[f] === null || d[f] === '') return { status: 422, json: { r: 602, msg: `Field ["${f}"] is required.` } };
      if ('id' in d) v('tạo không được gửi id');
      const now = this.tick();
      const row: GenericRow = { id: `${spec.prefix}${String(++this.idSeq).padStart(4, '0')}` };
      for (const [k, val] of Object.entries(d)) if (k !== 'object_type' && k !== 'workspace_id') row[k] = this.storeGeneric(k, val);
      if (slug === NOTES_OBJECTS.note.slug && row.visibility == null) row.visibility = 'private';
      if (slug === SETTINGS_OBJECT.slug) row.name = `UST-${String(this.idSeq).padStart(5, '0')}`;
      Object.assign(row, { created: now, updated: now, created_by: this.meId, updated_by: this.meId });
      rows.push(row);
      return this.ok({ id: row.id });
    }
    const row = rows.find((x) => x.id === d.id);
    // Security rule (CONTRACT 9.3, 10.1): chỉ sửa được bản ghi do mình tạo.
    if (!row || (row.created_by && row.created_by !== this.meId)) return { status: 200, json: { r: 1, msg: 'Record not existed' } };
    for (const [k, val] of Object.entries(d)) if (!['id', 'object_type', 'workspace_id'].includes(k)) row[k] = this.storeGeneric(k, val);
    for (const f of spec.required) if (row[f] === undefined || row[f] === null || row[f] === '') return { status: 422, json: { r: 602, msg: `Field ["${f}"] is required.` } };
    row.updated = this.tick();
    row.updated_by = this.meId;
    return this.ok({});
  }

  /** Metadata giả cho file upload (giống FILE_METADATA thật). */
  private fileSeq = 0;
  /** Nội dung file theo file_id (để mock link tải /files/<id>/original/<name>). */
  readonly fileStore = new Map<string, { fileName: string; content: Buffer; mime?: string }>();
  readonly fileGets: { fileId: string; redirect: boolean; size?: string; path?: string; query?: string }[] = [];
  makeFileMeta(fileName: string, fileSize: number, content?: Buffer): FileMeta {
    const n = ++this.fileSeq;
    const fileId = `FILEMOCK${String(n).padStart(5, '0')}`;
    this.fileStore.set(fileId, { fileName, content: content ?? Buffer.from(`Nội dung mẫu của ${fileName}`) });
    const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';
    return {
      fileName,
      fileSize,
      file_id: fileId,
      acl: 'private',
      fileExt: ext,
      fileType: ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'text/plain',
      resolutionSizes: [],
      fileServerUrlTemplate: 'https://files.cogover.example/0/{file_id}/{resolution_size}/' + fileName,
      url: 'https://acme.cogover.example/files/0/{file_id}/{resolution_size}/' + fileName,
    };
  }

  /**
   * Metadata giả cho ảnh upload vào `_attachments` (giống server thật: acl public, resizable, url /files/0/<id>/{resolution_size}/<tên>?redirect=true).
   * Lưu nội dung để GET /files/0/<id>/<size>/<tên>?redirect=true trả đúng bytes.
   */
  makeInlineMeta(fileName: string, content: Buffer): InlineFileMeta {
    const n = ++this.fileSeq;
    const fileId = `asia-1_INLMOCK${String(n).padStart(5, '0')}`;
    this.fileStore.set(fileId, { fileName, content });
    const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';
    const path = `/files/0/${fileId}/{resolution_size}/${encodeURIComponent(fileName)}?redirect=true`;
    return {
      fileName,
      fileSize: content.length,
      resizable: true,
      file_id: fileId,
      resolutionSizes: ['original', 'tiny', 'small', 'medium', 'large'],
      acl: 'public',
      fileExt: ext,
      fileServerUrlTemplate: `//files.cogover.example/0/${fileId}/{resolution_size}/${encodeURIComponent(fileName)}`,
      fileType: 'object_field',
      url: this.inlineUrlStyle === 'relative' ? path : `${this.origin}${path}`,
    };
  }

  /**
   * Metadata ảnh như đã lưu trong `_attachments` của record (trình soạn ghi url kèm `long_text_field_id` của field description,
   * `{resolution_size}` ở dạng %7Bresolution_size%7D) — dùng để dựng task có sẵn ảnh trong mô tả.
   */
  storedInlineMeta(fileName: string, content: Buffer): InlineFileMeta {
    const meta = this.makeInlineMeta(fileName, content);
    const u = new URL(meta.url, this.origin || 'http://localhost');
    u.searchParams.set('long_text_field_id', DESC_FIELD_ID);
    return { ...meta, url: u.href };
  }

  private uploadFile(r: RecordedRequest) {
    if (!r.upload?.fileName) return { status: 200, json: { r: 400, msg: 'missing file' } };
    const name = r.upload.fileName;
    const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
    if (isInlineUpload(r)) {
      if (this.inlineAllowedExts && !this.inlineAllowedExts.has(ext)) return structuredClone(FILE_TYPE_NOT_ALLOWED);
      return this.ok(this.makeInlineMeta(name.replace(/ /g, '-'), r.upload.content ?? Buffer.alloc(0)));
    }
    if (r.upload.fields.field_slug === WALLPAPER_FIELD) {
      // Field desktop_wallpaper: file_type jpg/jpeg/png/webp, max_size 20 MB (CONTRACT 10.1); client phải chặn trước.
      if (!WALLPAPER_EXTS.includes(ext)) {
        this.violations.push(`#${r.seq} upload ảnh nền đuôi .${ext} (client phải chặn trước khi gửi)`);
        return structuredClone(FILE_TYPE_NOT_ALLOWED);
      }
      if (r.upload.fileSize > WALLPAPER_MAX_BYTES || r.upload.fileSize === 0) {
        this.violations.push(`#${r.seq} upload ảnh nền ${r.upload.fileSize} byte (client phải chặn rỗng / > 20 MB)`);
        return { status: 400, json: { r: 16, msg: 'file size exceeds max_size (mock)' } };
      }
      const meta = this.makeFileMeta(name.replace(/ /g, '-'), r.upload.fileSize, r.upload.content);
      const entry = this.fileStore.get(meta.file_id)!;
      entry.mime = MIME_BY_EXT[ext] ?? 'image/png';
      return this.ok({ ...meta, fileType: entry.mime, resolutionSizes: ['original', 'tiny', 'small', 'medium', 'large'] });
    }
    if (this.allowedExts && !this.allowedExts.has(ext)) return structuredClone(FILE_TYPE_NOT_ALLOWED);
    if (r.upload.fileSize > MOCK_MAX_FILE_BYTES) {
      // Mã lỗi thật chưa kiểm chứng; client phải chặn trước khi gọi upload (contract) → ghi violation.
      this.violations.push(`#${r.seq} upload: file ${r.upload.fileSize} byte > 50 MB (client phải chặn)`);
      return { status: 400, json: { r: 16, msg: 'file size exceeds max_size (mock)' } };
    }
    // Server đổi khoảng trắng trong tên file thành "-" (contract mục 4) — app phải dùng fileName server trả.
    return this.ok(this.makeFileMeta(name.replace(/ /g, '-'), r.upload.fileSize, r.upload.content));
  }

  private tick() {
    this.clock += 1000;
    return this.clock;
  }
}

/* ---------------- tiện ích ---------------- */

function sortRows(rows: any[], sorts: any[]) {
  if (!Array.isArray(sorts) || sorts.length === 0) return [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const keys = sorts.flatMap((s) => Object.entries(s ?? {}).map(([field, v]: [string, any]) => ({ field, desc: v?.order === 'desc' })));
  return [...rows].sort((a, b) => {
    for (const k of keys) {
      const va = a[k.field];
      const vb = b[k.field];
      if (va === vb) continue;
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'vi');
      if (c !== 0) return k.desc ? -c : c;
    }
    return String(a.id).localeCompare(String(b.id));
  });
}

/** Đánh giá "(1 OR 2 OR 3) AND 4" với giá trị điều kiện 1-based. */
export function evalLogic(expr: string, vals: boolean[]): boolean {
  const tokens = expr.match(/\(|\)|\d+|AND|OR/gi) ?? [];
  let i = 0;
  const peek = () => tokens[i]?.toUpperCase();
  const parseOr = (): boolean => {
    let v = parseAnd();
    while (peek() === 'OR') {
      i++;
      const rhs = parseAnd();
      v = v || rhs;
    }
    return v;
  };
  const parseAnd = (): boolean => {
    let v = parseAtom();
    while (peek() === 'AND') {
      i++;
      const rhs = parseAtom();
      v = v && rhs;
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
    const idx = Number(t) - 1;
    if (!(idx >= 0 && idx < vals.length)) throw new Error(`logic_sequence tham chiếu điều kiện ${t} không tồn tại`);
    return vals[idx];
  };
  return parseOr();
}

/** Upload ảnh mô tả (`_attachments`): multipart có field_id hoặc object_id. */
export function isInlineUpload(r: RecordedRequest) {
  const f = r.upload?.fields ?? {};
  return f.field_id !== undefined || f.object_id !== undefined;
}

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Tách multipart/form-data tối giản: các field text + tên/dung lượng phần file. */
export function parseMultipart(buf: Buffer | null, contentType: string): UploadInfo {
  const info: UploadInfo = { fields: {}, fileName: null, fileSize: 0, contentType: null };
  const m = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!buf || !m) return info;
  const boundary = Buffer.from(`--${m[1] ?? m[2]}`);
  let pos = buf.indexOf(boundary);
  while (pos >= 0) {
    const start = pos + boundary.length;
    const next = buf.indexOf(boundary, start);
    if (next < 0) break;
    const part = buf.subarray(start, next);
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd >= 0) {
      const head = part.subarray(0, headerEnd).toString('utf8');
      let content = part.subarray(headerEnd + 4);
      if (content.subarray(content.length - 2).toString() === '\r\n') content = content.subarray(0, content.length - 2);
      const name = head.match(/name="([^"]*)"/)?.[1];
      const filename = head.match(/filename="([^"]*)"/)?.[1];
      if (filename !== undefined) {
        info.fileName = filename;
        info.fileSize = content.length;
        info.content = Buffer.from(content);
        info.contentType = head.match(/Content-Type:\s*([^\r\n]+)/i)?.[1] ?? null;
      } else if (name) info.fields[name] = content.toString('utf8');
    }
    pos = next;
  }
  return info;
}
