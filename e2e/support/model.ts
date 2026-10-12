/**
 * Hằng số nghiệp vụ lấy từ CONTRACT.md (mục 2, 4, 5). Không đọc source app.
 */

export const WORKSPACE_ID = 'WSDEMO0000001';
export const OBJECT_TYPE = 'OTDEMOTASK001';

export const SERVICE = { list: '217', create: '10200', update: '10201', delete: '218' } as const;

/* ---------- Activities (CONTRACT mục 4 "Activities", mục 5 điểm 3c) ---------- */

/** Object `activity` (timeline của task, liên kết qua lookup `Task`). */
export const ACTIVITY_OBJECT_TYPE = 'OTDEMOACTIV01';
/** Field hệ thống `_attachments` của activity (nơi ảnh dán vào ghi chú được upload). */
export const ACTIVITY_INLINE_FIELD_ID = 'OFDEMOACTIMG1';
/** Field `content` (long text) của activity — tham số `long_text_field_id` trên link ảnh trong ghi chú. */
export const ACTIVITY_CONTENT_FIELD_ID = 'OFDEMOACTCONT';
/** Field đọc timeline theo contract. */
export const ACTIVITY_FIELDS = ['id', 'name', 'activity_type', 'content', 'created', 'created_by', 'activity_time', 'files'];
/** style cố định của span mention theo trình soạn Cogover (CONTRACT 3f). */
export const MENTION_SPAN_STYLE =
  'background-color: var(--gray-10, rgb(245, 245, 245)); padding: 2px 6px; border-radius: 999999px; color: var(--typography-primary, rgb(26, 26, 26));';
/** Span mention gốc Cogover cho task `taskId` (CONTRACT 3f) — không có data-mentioned (backend tự thêm). */
export const mentionSpanHtml = (personId: string, displayName: string, taskId: string) =>
  `<span contenteditable="false" data-autocomplete-type="mention" data-id="${personId}" data-parent-object-id="OTDEMOTASK001" ` +
  `data-parent-record-id="${taskId}" data-redirect="/o/task/${taskId}?layoutId=LODEMOLAYOUT1&amp;activityId={record_id}" ` +
  `data-type="autocomplete" style="${MENTION_SPAN_STYLE}">@${displayName}</span>`;
/** Số mục mỗi lần tải ("Xem thêm"). */
export const ACTIVITY_PAGE_SIZE = 15;
/** Nhãn loại hoạt động (`activity_type`). */
export const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  note: 'Ghi chú',
  task: 'Công việc',
  call: 'Gọi điện',
  meeting: 'Họp',
  email: 'Email',
  sms: 'SMS',
  chat: 'Chat',
  facebook_comment: 'Facebook',
  chat_zalo_fb: 'Live-chat',
};

export type StatusSlug = 'new' | 'in_progress' | 'pending' | 'on_hold' | 'resolved' | 'closed' | 'cancelled';
export type PrioritySlug = 'urgent' | 'high' | 'medium' | 'low';

/** Thứ tự hiển thị = thứ tự bảng mục 5. */
export const STATUSES: { slug: StatusSlug; label: string; group: 'open' | 'done' }[] = [
  { slug: 'new', label: 'Mới', group: 'open' },
  { slug: 'in_progress', label: 'Đang xử lý', group: 'open' },
  { slug: 'pending', label: 'Đang chờ', group: 'open' },
  { slug: 'on_hold', label: 'Tạm dừng', group: 'open' },
  { slug: 'resolved', label: 'Đã xử lý', group: 'done' },
  { slug: 'closed', label: 'Đã đóng', group: 'done' },
  { slug: 'cancelled', label: 'Đã huỷ', group: 'done' },
];
export const OPEN_STATUSES = STATUSES.filter((s) => s.group === 'open').map((s) => s.slug);
export const DONE_STATUSES = STATUSES.filter((s) => s.group === 'done').map((s) => s.slug);
export const statusLabel = (slug: string) => STATUSES.find((s) => s.slug === slug)?.label ?? slug;
export const statusRank = (slug: string) => STATUSES.findIndex((s) => s.slug === slug);
export const isDoneStatus = (slug: string) => (DONE_STATUSES as string[]).includes(slug);
/** Lý do bước trạng thái bị quy trình chặn (CONTRACT mục 4 "Quy trình trạng thái"). */
export const statusRefused = (from: string, to: string) => `Quy trình không cho chuyển từ “${statusLabel(from)}” sang “${statusLabel(to)}”`;

export const PRIORITIES: { slug: PrioritySlug; label: string; rank: number }[] = [
  { slug: 'urgent', label: 'Khẩn cấp', rank: 4 },
  { slug: 'high', label: 'Cao', rank: 3 },
  { slug: 'medium', label: 'Trung bình', rank: 2 },
  { slug: 'low', label: 'Thấp', rank: 1 },
];
/** Giá trị trống → coi như medium khi sắp xếp. */
export const priorityRank = (slug: string | null | undefined) => PRIORITIES.find((p) => p.slug === slug)?.rank ?? 2;
export const priorityLabel = (slug: string) => PRIORITIES.find((p) => p.slug === slug)?.label ?? slug;

/** Nhãn lựa chọn "Sắp xếp theo" (mẫu dùng "Tên công việc", contract gọi là "Tiêu đề"). */
export const SORT_LABEL = {
  priority: /ưu tiên/i,
  due: /hạn chót/i,
  created: /ngày tạo/i,
  status: /trạng thái/i,
  title: /tên công việc|tiêu đề/i,
} as const;
export type SortField = keyof typeof SORT_LABEL;

/** Bộ lọc nhanh: "Tất cả chưa xong" đổi thành "Chưa xong" (contract AC1, 2026-10-01). */
export const QUICK_TITLE = { open: 'Chưa xong', all: 'Tất cả', done: 'Đã xong' } as const;

/** Nhãn vai trò trên thẻ (task-role). */
export const ROLE_LABEL = { assignee: 'Được giao', reporter: 'Tôi giao', cc: 'Theo dõi' } as const;
/** Nhãn checkbox bộ lọc Vai trò (thứ tự: Tôi giao / Giao cho tôi / Tôi theo dõi). */
export const ROLE_FILTER_LABEL = { reporter: 'Tôi giao', assignee: 'Giao cho tôi', cc: 'Tôi theo dõi' } as const;

export const MSG = {
  peopleError: 'Bạn cần là người giao hoặc người được giao',
  readonlyNote: 'Bạn chỉ theo dõi công việc này',
  /** Ghi chú khi mô tả chứa phần tử editor không hỗ trợ (bảng, iframe, video…) — contract mục 5 #3 (Plate.js). */
  richDescNote: 'Mô tả có định dạng chưa hỗ trợ — hãy sửa trên Cogover',
  noRoleTitle: 'Chưa chọn vai trò nào',
  noRoleSub: 'Tick ít nhất một mục trong Vai trò để xem công việc.',
  /* Activities (3c) */
  activitiesEmpty: 'Chưa có hoạt động nào',
  activityContentRequired: 'Nhập nội dung ghi chú',
  noteAdded: 'Đã thêm ghi chú',
  activitySubmit: 'Lưu ghi chú',
  activitySaving: 'Đang lưu…',
  activityUploading: 'Đang tải ảnh…',
  /* Sửa nhanh trong popup xem (3d) */
  saved: 'Đã lưu',
  noCcs: 'Không có',
} as const;

/* ---------- Thời gian theo Asia/Ho_Chi_Minh (UTC+7, không có DST) ---------- */

const VN_OFFSET_MS = 7 * 3600_000;

/** Mốc ms epoch của giờ địa phương VN (tháng 1–12). */
export const vn = (y: number, m: number, d: number, hh = 0, mm = 0) => Date.UTC(y, m - 1, d, hh - 7, mm);

/** Ngày (YYYY-MM-DD) theo VN của một mốc ms. */
export const vnDate = (ms: number) => new Date(ms + VN_OFFSET_MS).toISOString().slice(0, 10);

/** Giờ HH:mm theo VN của một mốc ms. */
export const vnTime = (ms: number) => new Date(ms + VN_OFFSET_MS).toISOString().slice(11, 16);

/** Mốc ms của ngày VN hôm nay + offset ngày, lúc hh:mm (theo đồng hồ thật). */
export const vnRelative = (offsetDays: number, hh: number, mm = 0, nowMs = Date.now()) => {
  const t = new Date(nowMs + VN_OFFSET_MS);
  return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + offsetDays, hh - 7, mm);
};

/** Bỏ dấu tiếng Việt + lowercase (giống tìm kiếm không dấu). */
export const fold = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

/** Chuẩn hoá HTML để so sánh: bỏ khoảng trắng giữa các thẻ. */
export const normalizeHtml = (html: string) => html.replace(/>\s+</g, '><').trim();

/* ---------- Ghi chú (CONTRACT mục 9.2) và Cài đặt (mục 10.1) ---------- */

/** Bốn object của app Ghi chú. */
export const NOTES_OBJECTS = {
  folder: { slug: 'notes_cat', id: 'OTDEMONOTECAT' },
  note: { slug: 'notes_content', id: 'OTDEMONOTECON' },
  tag: { slug: 'notes_tag', id: 'OTDEMONOTETAG' },
  pin: { slug: 'notes_pin', id: 'OTDEMONOTEPIN' },
} as const;

/** Object thiết lập cá nhân: một bản ghi mỗi người (của ai = `created_by`). */
export const SETTINGS_OBJECT = { slug: 'user_settings', id: 'OTDEMOSETTING' } as const;
/** Field file một giá trị "Ảnh nền Desktop" (jpg/jpeg/png/webp, ≤ 20 MB). */
export const WALLPAPER_FIELD = 'desktop_wallpaper';
export const WALLPAPER_EXTS = ['jpg', 'jpeg', 'png', 'webp'];
export const WALLPAPER_MAX_BYTES = 20 * 1024 * 1024;

/** Cỡ chữ chung và cỡ h1/h2 (CONTRACT mục 5 "Cỡ chữ", AC39). */
export const FONT_PX = 13.5;
export const HEADING_PX = 20;
