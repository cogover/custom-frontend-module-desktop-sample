// Fictitious data for the dev/preview mock API (no real people). DEV/TEST ONLY — never bundled.
import type { MockActivity, MockPerson, MockTask } from './mock-backend.ts';

const VN = 7 * 3600e3;
const DAY = 864e5;

/** ms of hh:mm Vietnam time, `days` days after today (Vietnam calendar). */
export function vnAt(now: number, days: number, hh = 17, mm = 0): number {
  const startOfToday = Math.floor((now + VN) / DAY) * DAY - VN;
  return startOfToday + days * DAY + (hh * 60 + mm) * 60e3;
}

const avatar = (id: string) =>
  JSON.stringify({ url: `/__mock/avatar/{resolution_size}/${id}.svg`, name: `${id}.svg`, size: 1024 });

export const MOCK_ME = 'PERMOCKME0001';

/** FILE_METADATA as the upload API returns it (fictitious). */
export function seedFile(fileId: string, fileName: string, fileSize: number, fileType: string) {
  return {
    fileName,
    fileSize,
    file_id: fileId,
    acl: 'private',
    fileExt: fileName.split('.').pop(),
    fileType,
    resolutionSizes: [],
    fileServerUrlTemplate: `/files/{file_id}/{resolution_size}/${fileName}`,
    url: `https://acme.cogover.example/files/0/{file_id}/{resolution_size}/${fileName}`,
  };
}

export function mockPeople(): MockPerson[] {
  return [
    { id: MOCK_ME, first_name: 'An', last_name: 'Trần Minh', avatar: avatar('me'), email: 'an.tran@example.test', phone: '0900000001', account_email: 'an.tran@example.test' },
    { id: 'PERMOCK00002', first_name: 'Lan', last_name: 'Nguyễn Thị', avatar: avatar('lan'), email: 'lan@example.test', account_email: 'lan.nguyen@example.test' },
    { id: 'PERMOCK00003', first_name: 'Minh', last_name: 'Trần Quang', avatar: null, email: 'minh@example.test', account_email: 'minh.tq@example.test' },
    { id: 'PERMOCK00004', first_name: 'Hà', last_name: 'Lê Thu', avatar: '{not json', email: 'ha@example.test', account_email: 'ha.le@example.test' },
    // files-host template without file_id → the UI must fall back to the letter avatar (no request)
    { id: 'PERMOCK00005', first_name: 'Tuấn', last_name: 'Phạm Anh', avatar: JSON.stringify({ url: 'https://files.cogover.example/0/{file_id}/{resolution_size}/t.png' }) },
    { id: 'PERMOCK00006', first_name: 'Nam', last_name: 'Võ Hoàng', avatar: avatar('nam'), account_email: 'nam.vo@example.test' },
    { id: 'PERMOCK00007', first_name: 'Linh', last_name: 'Đỗ Mai', avatar: null },
    { id: 'PERMOCK00008', first_name: 'Huy', last_name: 'Bùi Gia', avatar: null, account_email: 'huy.bui@example.test' },
    { id: 'PERMOCK00009', first_name: 'Ngọc', last_name: 'Hoàng Bảo', avatar: null },
    { id: 'PERMOCK00010', first_name: 'Tùng', last_name: 'Phan Thanh', avatar: null, account_email: 'tung.phan@example.test', deleted: 1 },
    { id: 'PERMOCK00011', first_name: 'Vy', last_name: 'Ngô Khánh', avatar: null, account_email: 'vy.ngo@example.test' },
    { id: 'PERMOCK00012', first_name: 'Đức', last_name: 'Lý Minh', avatar: null, status: 'INACTIVE' },
    // no Workspace account (Tuấn, Linh, Ngọc, Đức) → never in the "@" list; Tùng is deleted
  ];
}

const DONE_TITLES = [
  'Gửi biên bản họp giao ban',
  'Cập nhật bảng giá đại lý',
  'Kiểm kê văn phòng phẩm',
  'Hoàn thiện hợp đồng thuê kho',
  'Đặt lịch bảo trì máy lạnh',
  'Tổng hợp phản hồi khách hàng',
  'Chốt danh sách tham dự hội thảo',
  'Gia hạn tên miền công ty',
];

export function mockTasks(now: number): MockTask[] {
  const P = (n: number) => `PERMOCK${String(n).padStart(5, '0')}`;
  const base = (i: number) => now - (40 - i) * 3600e3;
  const open: Omit<MockTask, 'created' | 'updated' | 'name'>[] = [
    {
      id: 'TASMOCK0001',
      subject: 'Chuẩn bị báo cáo doanh thu quý 3',
      description: '<p>Tổng hợp số liệu từ 3 chi nhánh.</p><p>Gửi trước buổi họp giao ban.</p>',
      due_date: vnAt(now, 0, 23, 30),
      priority: 'high',
      status: 'in_progress',
      reporter: P(2),
      assignee: MOCK_ME,
      ccs: [],
    },
    {
      id: 'TASMOCK0002',
      subject: 'Gọi lại khách hàng Hưng Thịnh về hợp đồng',
      description: 'Khách muốn đổi điều khoản thanh toán.',
      due_date: vnAt(now, -1, 10, 0),
      priority: 'urgent',
      status: 'new',
      reporter: MOCK_ME,
      assignee: P(3),
      ccs: [],
    },
    {
      id: 'TASMOCK0003',
      subject: 'Rà soát quy trình nhập kho',
      description:
        '<p><b>Mục tiêu:</b> giảm thời gian nhập kho.</p><ul><li>Đo thời gian hiện tại</li><li>Đề xuất cải tiến</li></ul>' +
        '<p>Hiện tại mỗi lô hàng mất trung bình 45 phút từ lúc xe đến cổng tới khi hàng được xếp lên kệ, trong đó phần lớn thời gian là chờ đối chiếu phiếu giao hàng với đơn mua và kiểm đếm thủ công. Cần khảo sát lại toàn bộ các bước, xác định điểm nghẽn, đề xuất dùng máy quét mã vạch và cập nhật tồn kho ngay trên Cogover để giảm xuống dưới 20 phút mỗi lô.</p>' +
        '<p>Tài liệu: <a href="https://example.com/quy-trinh">quy trình hiện hành</a></p>' +
        '<p><img src="/__mock/image.svg" alt="Sơ đồ kho"></p>' +
        '<img src="data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%271%27%20height%3D%271%27%2F%3E" onerror="window.__xss=1">' +
        '<script>window.__xss=1</script><p onclick="window.__xss=1">Bấm vào đây</p>',
      due_date: vnAt(now, 1, 9, 30),
      priority: 'medium',
      status: 'pending',
      reporter: P(4),
      assignee: MOCK_ME,
      ccs: [P(5)],
      // the Workspace returns attachment items as JSON strings (sometimes objects)
      attachment_files: [
        JSON.stringify(seedFile('FILSEED0001', 'quy-trinh-nhap-kho-hien-hanh.pdf', 248_000, 'application/pdf')),
        seedFile('FILSEED0002', 'so-lieu-thang-9.xlsx', 1_530_000, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
      ],
    },
    {
      id: 'TASMOCK0004',
      subject: 'Cập nhật hồ sơ năng lực công ty',
      description: '<p>Bổ sung 5 dự án mới nhất.</p>',
      due_date: vnAt(now, 10),
      priority: 'low',
      status: 'on_hold',
      reporter: P(2),
      assignee: MOCK_ME,
      ccs: [],
    },
    {
      id: 'TASMOCK0005',
      subject: 'Phỏng vấn ứng viên vị trí kế toán',
      description: '',
      due_date: vnAt(now, 3, 14, 0),
      priority: 'high',
      status: 'new',
      reporter: MOCK_ME,
      assignee: MOCK_ME,
      ccs: [],
    },
    {
      id: 'TASMOCK0006',
      subject: 'Duyệt ngân sách marketing tháng tới',
      description: '<p>Chờ phòng tài chính gửi số liệu.</p>',
      due_date: vnAt(now, 2),
      priority: 'high',
      status: 'in_progress',
      reporter: P(6),
      assignee: P(7),
      ccs: [MOCK_ME],
    },
    {
      id: 'TASMOCK0007',
      subject: 'Kiểm tra hệ thống camera kho Bình Dương',
      description: '<p>Hai camera ở cửa sau mất tín hiệu.</p>',
      due_date: vnAt(now, -3),
      priority: 'medium',
      status: 'new',
      reporter: P(8),
      assignee: P(9),
      ccs: [MOCK_ME, P(10)],
    },
    {
      id: 'TASMOCK0008',
      subject: 'Soạn thông báo nghỉ lễ',
      description: '',
      due_date: vnAt(now, 35),
      priority: '',
      status: 'new',
      reporter: MOCK_ME,
      assignee: P(2),
      ccs: [],
    },
    {
      id: 'TASMOCK0009',
      subject: 'Đối soát công nợ nhà cung cấp',
      description: '<p>Đối chiếu với sổ phụ ngân hàng<br>và hoá đơn đầu vào.</p>',
      due_date: vnAt(now, 0, 0, 30),
      priority: 'medium',
      status: 'in_progress',
      reporter: P(3),
      assignee: MOCK_ME,
      ccs: [MOCK_ME],
    },
    {
      id: 'TASMOCK0010',
      subject:
        'Lên kế hoạch đào tạo nội bộ cho nhân viên mới gồm quy trình bán hàng, chăm sóc khách hàng và sử dụng phần mềm Cogover',
      description: '<p>Chia thành 4 buổi, mỗi buổi 2 tiếng.</p>',
      due_date: vnAt(now, 6),
      priority: 'low',
      status: 'new',
      reporter: P(11),
      assignee: MOCK_ME,
      ccs: [],
    },
    {
      id: 'TASMOCK0011',
      subject: 'Việc của phòng khác (không thuộc phạm vi)',
      description: '',
      due_date: vnAt(now, 1),
      priority: 'high',
      status: 'new',
      reporter: P(2),
      assignee: P(3),
      ccs: [],
    },
  ];

  const tasks: MockTask[] = open.map((t, i) => ({ ...t, name: `TAS-${1001 + i}`, created: base(i), updated: base(i) + 60e3 }));

  const doneStatuses = ['resolved', 'closed', 'cancelled'];
  for (let i = 0; i < 130; i++) {
    const n = i + 1;
    tasks.push({
      id: `TASMOCKD${String(n).padStart(3, '0')}`,
      name: `TAS-${1100 + n}`,
      subject: `${DONE_TITLES[i % DONE_TITLES.length]} (đợt ${n})`,
      description: i % 3 === 0 ? `<p>Đã hoàn tất đợt ${n}.</p>` : '',
      due_date: vnAt(now, -(i % 20) - 1),
      priority: ['urgent', 'high', 'medium', 'low'][i % 4],
      status: doneStatuses[i % 3],
      reporter: i % 2 ? MOCK_ME : P(2 + (i % 9)),
      assignee: i % 2 ? P(2 + (i % 9)) : MOCK_ME,
      ccs: i % 7 === 0 ? [MOCK_ME] : [],
      created: now - (200 + i) * 3600e3,
      updated: now - (i + 1) * 1800e3,
    });
  }
  return tasks;
}

/**
 * Timelines: TASMOCK0001 has a few activities of different kinds (a CKEditor note with a mention and a
 * picture still holding `{resolution_size}`, a note without subject, a "task" activity with a file);
 * TASMOCK0003 has 18 notes (two pages of 15). Others have none.
 */
export function mockActivities(now: number): MockActivity[] {
  const base = { note_type: 'normal', source_object: 'task', manual_log: 1, files: null, _attachments: null };
  const out: MockActivity[] = [
    {
      ...base,
      id: 'ACTSEED0001',
      name: 'Báo cáo tiến độ',
      activity_type: 'note',
      content:
        '<div><span contenteditable="false" data-autocomplete-type="mention" data-id="PERMOCK00002" style="background-color: rgb(245,245,245)">@Nguyễn Thị Lan</span>&nbsp;em xem giúp nhé</div>' +
        '<div><img height="60" src="/__mock/image.svg?size={resolution_size}" width="120" /></div>',
      Task: 'TASMOCK0001',
      created: now - 2 * 3600e3,
      created_by: 'PERMOCK00002',
      activity_time: now - 2 * 3600e3,
      source_record: 'TASMOCK0001',
    },
    {
      ...base,
      id: 'ACTSEED0002',
      name: '',
      activity_type: 'note',
      content: '<p>Đã gọi khách, hẹn gặp <strong>thứ Hai</strong>.</p><script>alert(1)</script>',
      Task: 'TASMOCK0001',
      created: now - 26 * 3600e3,
      created_by: MOCK_ME,
      activity_time: now - 26 * 3600e3,
      source_record: 'TASMOCK0001',
    },
    {
      ...base,
      id: 'ACTSEED0003',
      name: 'Chuẩn bị tài liệu',
      activity_type: 'task',
      content: '',
      Task: 'TASMOCK0001',
      created: now - 50 * 3600e3,
      created_by: 'PERMOCK00003',
      activity_time: now - 50 * 3600e3,
      files: [JSON.stringify(seedFile('FILSEEDA001', 'tai-lieu.pdf', 2048, 'application/pdf'))],
      source_record: 'TASMOCK0001',
    },
  ];
  for (let i = 1; i <= 18; i++) {
    out.push({
      ...base,
      id: `ACTPAGE${String(i).padStart(4, '0')}`,
      name: `Cập nhật ${i}`,
      activity_type: 'note',
      content: `<p>Ghi chú số ${i}</p>`,
      Task: 'TASMOCK0003',
      created: now - i * 3600e3,
      created_by: i % 2 ? MOCK_ME : 'PERMOCK00002',
      activity_time: now - i * 3600e3,
      source_record: 'TASMOCK0003',
    });
  }
  return out;
}

/** The "Status" transition rule of the Workspace (TRDEMOSTATUS1, 2026-10-03) — the dev server uses it. */
export function mockStatusRule() {
  const flow = (originValue: string, targetValue: string, name: string) => ({ originValue, targetValue, name, allowUndo: originValue !== '_initial' });
  return {
    id: 'TRMOCKSTATUS',
    name: 'Status',
    status: 1,
    objectTypeId: 'OTDEMOTASK001',
    objectFieldId: 'OFDEMOTASKSTA',
    shouldFilterRecord: false,
    flows: [
      flow('_initial', 'new', 'Mới tạo'),
      flow('new', 'in_progress', 'Đang xử lý'),
      flow('new', 'cancelled', 'Huỷ'),
      flow('in_progress', 'on_hold', 'Tạm dừng'),
      flow('in_progress', 'pending', 'Chờ'),
      flow('in_progress', 'resolved', 'Đã xử lý'),
      flow('pending', 'in_progress', 'Tiếp tục'),
      flow('pending', 'resolved', 'Đã xử lý'),
      flow('pending', 'cancelled', 'Huỷ'),
      flow('on_hold', 'in_progress', 'Tiếp tục'),
      flow('on_hold', 'cancelled', 'Huỷ'),
      flow('resolved', 'closed', 'Đóng'),
    ],
  };
}

const LAN = 'PERMOCK00002';
const MINH = 'PERMOCK00003';
const HA = 'PERMOCK00004';
const content = (text_type: 1 | 2 | 3, value: string) => JSON.stringify({ text_type, value });

const PUBLISH_MD = `Các bước đưa một Custom Frontend Module lên Workspace.

## Chuẩn bị

- Code đã commit và push
- Unit test và E2E local đều qua

## Build

\`\`\`
npm run build
\`\`\`

## Publish và kích hoạt

| Bước | Lệnh |
|---|---|
| Publish | \`cogover-dev publish\` |
| Kích hoạt | \`cogover-dev activate <ID>\` |

### Kiểm tra

So tên file \`assets/index-*.js\` trên trang thật với \`dist/index.html\`.`;

/**
 * "Ghi chú" (CONTRACT §9): my folders (three levels) and notes in the three formats, notes others shared with me
 * (personally, as an editor, through my department), and notes I must not see in the lists (public, private).
 */
export function mockNotesRecords(now: number): Record<string, Record<string, unknown>[]> {
  const ago = (h: number) => now - h * 3600e3;
  const folder = (id: string, name: string, parent: string | null, owner = MOCK_ME) => ({ id, name, parent_folder: parent, owner, updated: ago(48) });
  const note = (id: string, name: string, extra: Record<string, unknown>) => ({
    id, name, folder: null, owner: MOCK_ME, visibility: 'private', viewers: null, editors: null,
    viewer_departments: null, editor_departments: null, tags: null, created: ago(200), updated: ago(5), updated_by: MOCK_ME, ...extra,
  });
  return {
    department: [
      { id: 'DEPMOCK01', name: 'Phòng Sản phẩm', is_active: true },
      { id: 'DEPMOCK02', name: 'Phòng Kinh doanh', is_active: true },
      { id: 'DEPMOCK03', name: 'Ban Giám đốc', is_active: true },
      { id: 'DEPMOCK09', name: 'Phòng đã giải thể', is_active: false },
    ],
    department_personnel: [
      { id: 'DPMOCK01', personnel: MOCK_ME, department: 'DEPMOCK01' },
      { id: 'DPMOCK02', personnel: LAN, department: 'DEPMOCK01' },
      { id: 'DPMOCK03', personnel: MINH, department: 'DEPMOCK02' },
      { id: 'DPMOCK04', personnel: HA, department: 'DEPMOCK03' },
    ],
    notes_tag: [
      { id: 'TAGMOCK01', name: 'quy-trình' },
      { id: 'TAGMOCK02', name: 'dev-cli' },
      { id: 'TAGMOCK03', name: 'họp' },
      { id: 'TAGMOCK04', name: 'ý-tưởng' },
    ],
    notes_cat: [
      folder('FOLMOCK01', 'Sản phẩm', null),
      folder('FOLMOCK02', 'Custom Module', 'FOLMOCK01'),
      folder('FOLMOCK03', 'Frontend', 'FOLMOCK02'),
      folder('FOLMOCK04', 'Vận hành', null),
      folder('FOLMOCK05', 'Họp', 'FOLMOCK04'),
      folder('FOLMOCK06', 'Cá nhân', null),
      folder('FOLMOCK90', 'Kinh doanh (của Minh)', null, MINH),
    ],
    notes_content: [
      note('NOTMOCK01', 'Publish Custom Frontend Module', {
        folder: 'FOLMOCK03', content: content(3, PUBLISH_MD), tags: ['TAGMOCK01', 'TAGMOCK02'], updated: ago(2),
        visibility: 'shared', editors: [LAN], viewer_departments: ['DEPMOCK02'],
      }),
      note('NOTMOCK02', 'Mention trong ghi chú', {
        folder: 'FOLMOCK03', content: content(2, '<p>Mention là một thẻ <code>span</code> trong nội dung.</p><ul><li>Không gửi <strong>data-mentioned</strong></li><li>Backend tự báo</li></ul>'),
      }),
      note('NOTMOCK03', 'Giao ban tuần 40', {
        folder: 'FOLMOCK05', tags: ['TAGMOCK03'], updated: ago(30),
        content: content(2, '<h2>Đã xong</h2><p>Mention, lọc mức ưu tiên.</p><h2>Việc tuần tới</h2><table><tbody><tr><th>Việc</th><th>Phụ trách</th></tr><tr><td>Trang Ghi chú</td><td>An</td></tr></tbody></table>'),
      }),
      note('NOTMOCK04', 'Ý tưởng dock ứng dụng', { content: content(1, 'Gom các module thành ứng dụng trên một desktop chung.\n\nMỗi app một cửa sổ.'), tags: ['TAGMOCK04'], updated: ago(70) }),
      note('NOTMOCK05', 'Quy trình rollback', { folder: 'FOLMOCK04', content: content(3, '1. Tìm phiên bản ổn định\n2. Kích hoạt lại\n3. Kiểm tra trang thật'), updated: ago(100) }),
      // shared with me
      note('NOTMOCK20', 'Bảng giá đại lý Q4', { owner: LAN, visibility: 'shared', viewers: [MOCK_ME], content: content(2, '<p>Giá mới áp dụng từ 01/10.</p>'), updated: ago(8), updated_by: LAN }),
      note('NOTMOCK21', 'Kế hoạch kinh doanh tháng 10', { owner: MINH, visibility: 'shared', viewer_departments: ['DEPMOCK01'], content: content(3, '## Mục tiêu\n\n- 30 khách hàng mới'), updated: ago(20), updated_by: MINH }),
      note('NOTMOCK22', 'Checklist onboarding', { owner: LAN, visibility: 'shared', editors: [MOCK_ME], content: content(1, 'Cấp tài khoản\nGửi tài liệu'), updated: ago(40), updated_by: LAN }),
      // never in my lists: public (open by link only), private (even with me in a list)
      note('NOTMOCK30', 'Thông báo nghỉ lễ', { owner: HA, visibility: 'public', content: content(2, '<p>Công ty nghỉ lễ 2/9.</p>'), updated_by: HA }),
      note('NOTMOCK31', 'Ghi chú riêng của Minh', { owner: MINH, content: content(1, 'Riêng tư') }),
      note('NOTMOCK32', 'Nháp của Minh', { owner: MINH, visibility: 'private', viewers: [MOCK_ME], content: content(1, 'Chưa chia sẻ') }),
    ],
    notes_pin: [
      { id: 'PINMOCK01', person: MOCK_ME, note: 'NOTMOCK01', order: 1 },
      { id: 'PINMOCK02', person: MOCK_ME, note: 'NOTMOCK20', order: 2 },
      { id: 'PINMOCK03', person: LAN, note: 'NOTMOCK20', order: 1 },
    ],
  };
}

export function mockSeed(now: number) {
  return {
    meId: MOCK_ME,
    people: mockPeople(),
    tasks: mockTasks(now),
    defaultCcs: ['PERMOCK00009'],
    activities: mockActivities(now),
    records: mockNotesRecords(now),
  };
}

/** Small square avatar served by the mock for `/__mock/avatar/...`. */
export function mockAvatarSvg(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="hsl(${hue} 60% 55%)"/><circle cx="24" cy="19" r="9" fill="hsl(${hue} 60% 85%)"/><rect x="10" y="31" width="28" height="17" rx="9" fill="hsl(${hue} 60% 85%)"/></svg>`;
}

export const MOCK_IMAGE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120" viewBox="0 0 320 120"><rect width="320" height="120" rx="6" fill="#E2EEFE"/><text x="160" y="66" font-family="sans-serif" font-size="16" text-anchor="middle" fill="#1570EF">Sơ đồ kho (ảnh minh hoạ)</text></svg>';
