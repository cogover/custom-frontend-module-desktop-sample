import { vn } from '../model';
import type { Dataset, MockActivity, MockPerson, MockTask } from './mock-api';

/** "Bây giờ" mặc định của bộ local: thứ Năm 01/10/2026 10:00 (UTC+7). */
export const FIXED_NOW = vn(2026, 10, 1, 10, 0);

export const P = {
  ME: 'PERMOCKME00001',
  LAN: 'PERMOCKLAN0001',
  MINH: 'PERMOCKMINH001',
  HA: 'PERMOCKHA00001',
  TUAN: 'PERMOCKTUAN001',
  HOA: 'PERMOCKHOA0001',
  OLD: 'PERMOCKOLD0001',
  /** Đã xoá (mềm), có tài khoản — không được hiện trong danh sách @mention. */
  DEL: 'PERMOCKDEL0001',
} as const;

export const NAME = {
  [P.ME]: 'D. Alex',
  [P.LAN]: 'Nguyễn Thị Lan',
  [P.MINH]: 'Trần Quang Minh',
  [P.HA]: 'Lê Thu Hà',
  [P.TUAN]: 'Phạm Anh Tuấn',
  [P.HOA]: 'Nguyễn Thị Hoa',
  [P.OLD]: 'Nhân Viên Cũ',
  [P.DEL]: 'Nguyễn Văn Xoá',
} as Record<string, string>;

/** Email tài khoản (CONTRACT 3f: danh sách @mention hiện email tài khoản). Tuấn không có tài khoản. */
export const ACCOUNT_EMAIL: Record<string, string | null> = {
  [P.ME]: 'alex.d@cty.test',
  [P.LAN]: 'lan.nguyen@cty.test',
  [P.MINH]: 'minh.tran@cty.test',
  [P.HA]: 'ha.le@cty.test',
  [P.TUAN]: null,
  [P.HOA]: 'hoa.nguyen@cty.test',
  [P.OLD]: 'cu.nv@cty.test',
  [P.DEL]: 'xoa.nguyen@cty.test',
};

const avatarJson = (fileId: string, name: string) =>
  JSON.stringify({ url: `https://acme.cogover.example/files/0/${fileId}/{resolution_size}/${name}`, name });

export const PEOPLE: MockPerson[] = [
  { id: P.ME, first_name: 'Alex', last_name: 'D.', avatar: '', status: 'ACTIVE', work_status: 'working' },
  { id: P.LAN, first_name: 'Lan', last_name: 'Nguyễn Thị', avatar: avatarJson('FILELAN01', 'lan.png'), status: 'ACTIVE', work_status: 'working' },
  { id: P.MINH, first_name: 'Minh', last_name: 'Trần Quang', avatar: '', status: 'ACTIVE', work_status: 'working' },
  { id: P.HA, first_name: 'Hà', last_name: 'Lê Thu', avatar: 'not-json{', status: 'ACTIVE', work_status: 'working' },
  { id: P.TUAN, first_name: 'Tuấn', last_name: 'Phạm Anh', avatar: '', status: 'ACTIVE', work_status: 'working' },
  { id: P.HOA, first_name: 'Hoa', last_name: 'Nguyễn Thị', avatar: '', status: 'ACTIVE', work_status: 'working' },
  { id: P.OLD, first_name: 'Cũ', last_name: 'Nhân Viên', avatar: '', status: 'INACTIVE', work_status: 'quit' },
  { id: P.DEL, first_name: 'Xoá', last_name: 'Nguyễn Văn', avatar: '', status: 'INACTIVE', work_status: 'quit', deleted: 1 },
].map((p) => ({ ...p, account_email: ACCOUNT_EMAIL[p.id] ?? null })) as MockPerson[];

const base = (o: Partial<MockTask> & Pick<MockTask, 'id' | 'subject'>): MockTask => ({
  name: `TAS-${o.id.slice(-4)}`,
  description: '',
  due_date: vn(2026, 10, 10, 17, 0),
  priority: 'medium',
  status: 'new',
  reporter: P.ME,
  assignee: P.ME,
  ccs: [],
  created: vn(2026, 9, 1, 9, 0),
  updated: vn(2026, 9, 1, 9, 0),
  ...o,
});

/** ID task trong bộ dữ liệu mặc định. */
export const T = {
  T1: 'TASMOCK0000001',
  T2: 'TASMOCK0000002',
  T3: 'TASMOCK0000003',
  T4: 'TASMOCK0000004',
  T5: 'TASMOCK0000005',
  T6: 'TASMOCK0000006',
  T7: 'TASMOCK0000007',
  T8: 'TASMOCK0000008',
  D1: 'TASMOCKD000001',
  D2: 'TASMOCKD000002',
  D3: 'TASMOCKD000003',
  X1: 'TASMOCKX000001',
} as const;

/**
 * 8 việc mở trong phạm vi (T1–T8), 3 việc đã xong (D1–D3), 1 việc ngoài phạm vi (X1).
 * - T5: chỉ theo dõi (ccs) → chỉ xem.
 * - T6: ưu tiên trống, mô tả có <strong>, hạn năm sau.
 * - T7: được giao + theo dõi.
 * - T8: quá hạn vài giờ (hôm nay 08:00).
 */
export function defaultTasks(): MockTask[] {
  return [
    base({
      id: T.T1,
      name: 'TAS-1001',
      subject: 'Viết nội dung cho 4 màn hình onboarding',
      description: '<p>Lời chào, giới thiệu tính năng và xin quyền gửi thông báo.</p>',
      priority: 'high',
      status: 'in_progress',
      due_date: vn(2026, 10, 1, 23, 30),
      reporter: P.LAN,
      assignee: P.ME,
      ccs: [P.HOA],
      created: vn(2026, 9, 20, 9, 0),
      updated: vn(2026, 9, 30, 9, 0),
    }),
    base({
      id: T.T2,
      name: 'TAS-1002',
      subject: 'Triển khai giao diện màn hình Trang chủ',
      description: '',
      priority: 'urgent',
      status: 'new',
      due_date: vn(2026, 10, 6, 9, 0),
      reporter: P.ME,
      assignee: P.MINH,
      ccs: [P.HOA],
      created: vn(2026, 9, 21, 9, 0),
      updated: vn(2026, 9, 21, 9, 0),
    }),
    base({
      id: T.T3,
      name: 'TAS-1003',
      subject: 'Nghiên cứu ứng dụng đối thủ',
      description: '<p>So sánh luồng bài thiền của Calm, Headspace và Balance.</p>',
      priority: 'medium',
      status: 'pending',
      due_date: vn(2026, 9, 30, 17, 0),
      reporter: P.LAN,
      assignee: P.ME,
      ccs: [],
      created: vn(2026, 9, 22, 9, 0),
      updated: vn(2026, 9, 22, 9, 0),
    }),
    base({
      id: T.T4,
      name: 'TAS-1004',
      subject: 'Kiến trúc thông tin cho mục Thư viện',
      description: '<p>Sắp lại nhóm nội dung: bài thiền, âm thanh ngủ, khoá học.</p>',
      priority: 'high',
      status: 'on_hold',
      due_date: vn(2026, 10, 2, 0, 30),
      reporter: P.MINH,
      assignee: P.ME,
      created: vn(2026, 9, 23, 9, 0),
      updated: vn(2026, 9, 23, 9, 0),
    }),
    base({
      id: T.T5,
      name: 'TAS-1005',
      subject: 'Kiểm thử khả dụng với 5 người dùng',
      description: '<p>Chuẩn bị kịch bản, ghi lại 3 vấn đề lớn nhất.</p>',
      priority: 'low',
      status: 'new',
      due_date: vn(2026, 10, 25, 17, 0),
      reporter: P.HA,
      assignee: P.TUAN,
      ccs: [P.ME],
      created: vn(2026, 9, 24, 9, 0),
      updated: vn(2026, 9, 24, 9, 0),
    }),
    base({
      id: T.T6,
      name: 'TAS-1006',
      subject: 'Cập nhật tài liệu bàn giao cho đội dev',
      description: '<p>Bổ sung <strong>spacing</strong> và trạng thái lỗi.</p>',
      priority: null,
      status: 'new',
      due_date: vn(2027, 1, 12, 17, 0),
      reporter: P.ME,
      assignee: P.ME,
      created: vn(2026, 9, 25, 9, 0),
      updated: vn(2026, 9, 25, 9, 0),
    }),
    base({
      id: T.T7,
      name: 'TAS-1007',
      subject: 'Đối soát công nợ quý 3',
      description: '<p>Đối chiếu số dư với kế toán.</p>',
      priority: 'urgent',
      status: 'in_progress',
      due_date: vn(2026, 9, 28, 10, 0),
      reporter: P.TUAN,
      assignee: P.ME,
      ccs: [P.ME, P.HOA],
      created: vn(2026, 9, 26, 9, 0),
      updated: vn(2026, 9, 26, 9, 0),
    }),
    base({
      id: T.T8,
      name: 'TAS-1008',
      subject: 'Gọi lại khách hàng Phú Thành',
      description: '<p>Hỏi lại lịch demo tuần sau.</p>',
      priority: 'medium',
      status: 'new',
      due_date: vn(2026, 10, 1, 8, 0),
      reporter: P.ME,
      assignee: P.ME,
      created: vn(2026, 9, 27, 9, 0),
      updated: vn(2026, 9, 27, 9, 0),
    }),
    base({
      id: T.D1,
      name: 'TAS-0901',
      subject: 'Chuẩn hoá bảng màu và typography',
      description: '<p>Gom về 6 màu chính.</p>',
      priority: 'high',
      status: 'resolved',
      due_date: vn(2026, 9, 30, 12, 0),
      reporter: P.HA,
      assignee: P.ME,
      created: vn(2026, 9, 10, 9, 0),
      updated: vn(2026, 9, 30, 15, 0),
    }),
    base({
      id: T.D2,
      name: 'TAS-0902',
      subject: 'Wireframe luồng nâng cấp gói Pro',
      priority: 'medium',
      status: 'closed',
      due_date: vn(2026, 9, 29, 12, 0),
      reporter: P.ME,
      assignee: P.MINH,
      created: vn(2026, 9, 11, 9, 0),
      updated: vn(2026, 9, 29, 15, 0),
    }),
    base({
      id: T.D3,
      name: 'TAS-0903',
      subject: 'Huỷ buổi họp tuần',
      priority: 'low',
      status: 'cancelled',
      due_date: vn(2026, 9, 28, 12, 0),
      reporter: P.ME,
      assignee: P.ME,
      created: vn(2026, 9, 12, 9, 0),
      updated: vn(2026, 9, 28, 15, 0),
    }),
    base({
      id: T.X1,
      name: 'TAS-1999',
      subject: 'Việc của phòng khác không liên quan',
      priority: 'urgent',
      status: 'new',
      due_date: vn(2026, 10, 2, 9, 0),
      reporter: P.LAN,
      assignee: P.MINH,
      ccs: [P.HOA],
    }),
  ];
}

export const OPEN_IDS = [T.T1, T.T2, T.T3, T.T4, T.T5, T.T6, T.T7, T.T8];
export const DONE_IDS = [T.D1, T.D2, T.D3];
/** Mặc định chỉ tick "Giao cho tôi" (assignee = tôi). */
export const ASSIGNEE_OPEN = [T.T1, T.T3, T.T4, T.T6, T.T7, T.T8];
export const ASSIGNEE_DONE = [T.D1, T.D3];
/** Tôi giao (reporter = tôi). */
export const REPORTER_OPEN = [T.T2, T.T6, T.T8];
export const REPORTER_DONE = [T.D2, T.D3];
/** Tôi theo dõi (tôi ∈ ccs). */
export const CC_OPEN = [T.T5, T.T7];

export function defaultDataset(): Dataset {
  return { meId: P.ME, people: PEOPLE.map((p) => ({ ...p })), tasks: defaultTasks() };
}

/** Sinh n task (mở hoặc đã xong) của tôi, hạn/tạo/cập nhật giảm dần theo index. */
export function bulkTasks(n: number, opts: { prefix: string; status: string; startIdx?: number }): MockTask[] {
  const out: MockTask[] = [];
  for (let i = 0; i < n; i++) {
    const k = (opts.startIdx ?? 0) + i;
    out.push(
      base({
        id: `TASBULK${opts.prefix}${String(k).padStart(5, '0')}`,
        name: `TAS-${7000 + k}`,
        subject: `${opts.prefix === 'D' ? 'Việc đã xong' : 'Việc mở'} số ${k + 1}`,
        description: `<p>Mô tả ${k + 1}</p>`,
        status: opts.status,
        priority: ['urgent', 'high', 'medium', 'low'][k % 4],
        due_date: vn(2026, 10, 1, 12, 0) + (k % 40) * 86_400_000,
        created: vn(2026, 9, 1, 0, 0) + k * 60_000,
        updated: vn(2026, 9, 30, 23, 0) - k * 60_000,
        reporter: P.ME,
        assignee: P.ME,
      }),
    );
  }
  return out;
}

/* ---------------- Activities (CONTRACT mục 4 "Activities", 3c) ---------------- */

/** ID activity mẫu. */
export const A = {
  /** T1 — ghi chú có chủ đề, ảnh `{resolution_size}`, mention, mã độc cần sanitize. */
  NOTE_FULL: 'ACTMOCK0000001',
  /** T1 — ghi chú không chủ đề, không có activity_time (hiển thị theo created). */
  NOTE_PLAIN: 'ACTMOCK0000002',
  /** T1 — loại "task" có file đính kèm (`files`). */
  TASK_FILES: 'ACTMOCK0000003',
  /** T1 — loại "call", năm trước, name = null. */
  CALL_OLD: 'ACTMOCK0000004',
} as const;

/** Task có timeline nhiều loại (T1), có 18 ghi chú (T4), không có hoạt động (T8). */
export const ACT_TASK = { MIXED: T.T1, MANY: T.T4, NONE: T.T8 } as const;
export const MANY_NOTES = 18;

/** Ảnh trong ghi chú NOTE_FULL (kích thước riêng để kiểm ảnh tải được đúng file). */
export const NOTE_IMAGE = { fileName: 'bang-phac-thao.png', width: 20, height: 12 };
/** File của TASK_FILES. */
export const ACT_FILES = {
  pdf: { fileName: 'tai-lieu-tham-khao.pdf', content: 'Tài liệu tham khảo của hoạt động (E2E)' },
  txt: { fileName: 'ghi-chu-cuoc-goi.txt', content: 'Ghi chú cuộc gọi (E2E)' },
};

/** Văn bản người mention trong NOTE_FULL. */
export const MENTION_TEXT = '@Trần Quang Minh';

interface ActivitySeeder {
  origin: string;
  makeInlineMeta(fileName: string, content: Buffer): { file_id: string; fileName: string };
  makeFileMeta(fileName: string, fileSize: number, content?: Buffer): import('./mock-api').FileMeta;
}

/**
 * Timeline mẫu. Cần origin của app (ảnh trong nội dung dùng link tuyệt đối cùng origin như CKEditor lưu)
 * và kho file của mock (ảnh/ file tải về được) → gọi sau `mock.install`.
 */
export function defaultActivities(m: ActivitySeeder, png: Buffer): MockActivity[] {
  const img = m.makeInlineMeta(NOTE_IMAGE.fileName, png);
  const imgSrc = `${m.origin}/files/0/${img.file_id}/{resolution_size}/${encodeURIComponent(img.fileName)}?redirect=true&amp;long_text_field_id=OFDEMOACTCONT`;
  const pdf = m.makeFileMeta(ACT_FILES.pdf.fileName, Buffer.byteLength(ACT_FILES.pdf.content), Buffer.from(ACT_FILES.pdf.content));
  const txt = m.makeFileMeta(ACT_FILES.txt.fileName, Buffer.byteLength(ACT_FILES.txt.content), Buffer.from(ACT_FILES.txt.content));
  const out: MockActivity[] = [
    {
      id: A.NOTE_FULL,
      Task: ACT_TASK.MIXED,
      activity_type: 'note',
      note_type: 'normal',
      name: 'Chốt nội dung màn 2',
      content:
        '<div><p>Đã trao đổi với <span data-autocomplete-type="mention" data-id="PERMOCKMINH001" class="mention">@Trần Quang Minh</span> về lời chào.</p>' +
        `<p><img src="${imgSrc}" alt="phác thảo"></p>` +
        '<p onclick="window.__actxss1=1" onmouseover="window.__actxss1=1">bấm thử</p>' +
        '<script>window.__actxss2=1</script><iframe src="javascript:window.__actxss3=1"></iframe></div>',
      created_by: P.LAN,
      created: vn(2026, 9, 30, 14, 5),
      activity_time: vn(2026, 9, 30, 14, 5),
      files: null,
    },
    {
      id: A.NOTE_PLAIN,
      Task: ACT_TASK.MIXED,
      activity_type: 'note',
      note_type: 'normal',
      name: '',
      content: '<p>Ghi chú không có chủ đề.</p>',
      created_by: P.ME,
      created: vn(2026, 9, 30, 9, 15),
      activity_time: null,
      files: null,
    },
    {
      id: A.TASK_FILES,
      Task: ACT_TASK.MIXED,
      activity_type: 'task',
      name: 'Gửi tài liệu tham khảo',
      content: '<p>Đính kèm tài liệu cho màn onboarding.</p>',
      created_by: P.MINH,
      created: vn(2026, 9, 29, 16, 40),
      activity_time: vn(2026, 9, 29, 16, 30),
      files: [pdf, JSON.stringify(txt)],
    },
    {
      id: A.CALL_OLD,
      Task: ACT_TASK.MIXED,
      activity_type: 'call',
      name: null,
      content: '<p>Gọi điện xác nhận yêu cầu.</p>',
      created_by: P.HOA,
      created: vn(2025, 12, 31, 8, 0),
      activity_time: vn(2025, 12, 31, 8, 0),
      files: null,
    },
  ];
  for (let i = 0; i < MANY_NOTES; i++)
    out.push({
      id: `ACTMOCKMANY${String(i + 1).padStart(3, '0')}`,
      Task: ACT_TASK.MANY,
      activity_type: 'note',
      note_type: 'normal',
      name: `Ghi chú số ${i + 1}`,
      content: `<p>Nội dung ghi chú số ${i + 1}</p>`,
      created_by: P.ME,
      created: vn(2026, 9, 20, 8, 0) + i * 3_600_000,
      activity_time: vn(2026, 9, 20, 8, 0) + i * 3_600_000,
      files: null,
    });
  return out;
}

/** ID ghi chú thứ n (1-based) của task MANY. */
export const manyNoteId = (n: number) => `ACTMOCKMANY${String(n).padStart(3, '0')}`;
