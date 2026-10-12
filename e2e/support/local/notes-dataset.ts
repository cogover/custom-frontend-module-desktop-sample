import { NOTES_OBJECTS, vn } from '../model';
import { P } from './dataset';
import type { GenericRow, MockCogover } from './mock-api';

/**
 * Dữ liệu mẫu app Ghi chú cho mock local (CONTRACT mục 9): lookup lưu ID như server, `content` là chuỗi JSON
 * `{"text_type": 1|2|3, "value": …}`. Mặc định mock không có bản ghi nào — test Ghi chú gọi `seedNotes(mock)`.
 *
 * Cây của tôi:
 *   Công việc (F_WORK)
 *     └ Họp (F_MEET)             ← N_MEET "Biên bản họp tuần" (Markdown)
 *     ← N_PLAN "Kế hoạch quý 4" (rich text, có h1/h2/h3)
 *   Cá nhân (F_HOME)
 *   ← gốc: N_ROOT "Ghi chú gốc" (thuần), N_SHARED "Tài liệu chia sẻ" (shared cho Lan), N_PUBLIC "Thông báo công khai" (public)
 * Được chia sẻ cho tôi: N_LAN "Quy trình onboarding" của Lan (shared, viewers = tôi).
 */
export const F = { WORK: 'FOLMOCKWORK001', MEET: 'FOLMOCKMEET001', HOME: 'FOLMOCKHOME001' } as const;
export const N = {
  PLAN: 'NOTMOCKPLAN001',
  MEET: 'NOTMOCKMEET001',
  ROOT: 'NOTMOCKROOT001',
  SHARED: 'NOTMOCKSHAR001',
  PUBLIC: 'NOTMOCKPUBL001',
  LAN: 'NOTMOCKLAN0001',
} as const;
export const TAG = { PROJECT: 'TAGMOCKPROJ001' } as const;
export const DEP = { PRODUCT: 'DEPMOCKPROD001' } as const;

export const FOLDER_NAME = { [F.WORK]: 'Công việc', [F.MEET]: 'Họp', [F.HOME]: 'Cá nhân' } as Record<string, string>;
export const NOTE_TITLE = {
  [N.PLAN]: 'Kế hoạch quý 4',
  [N.MEET]: 'Biên bản họp tuần',
  [N.ROOT]: 'Ghi chú gốc',
  [N.SHARED]: 'Tài liệu chia sẻ',
  [N.PUBLIC]: 'Thông báo công khai',
  [N.LAN]: 'Quy trình onboarding',
} as Record<string, string>;

/** Nội dung rich text có đủ h1 / h2 / h3 / đoạn / danh sách (AC39 đo cỡ chữ, mục lục cần ≥ 2 tiêu đề). */
export const PLAN_HTML =
  '<h1>Mục tiêu</h1><p>Tăng tỉ lệ giữ chân người dùng.</p><h2>Việc chính</h2><ul><li>Ra mắt onboarding mới</li><li>Đo phễu</li></ul><h3>Rủi ro</h3><p>Thiếu người làm thiết kế.</p>';

const t0 = vn(2026, 9, 20, 9, 0);
const content = (text_type: 1 | 2 | 3, value: string) => JSON.stringify({ text_type, value });
const folder = (id: string, parent: string | null, i: number): GenericRow => ({
  id,
  name: FOLDER_NAME[id],
  parent_folder: parent,
  owner: P.ME,
  created: t0 + i * 60_000,
  updated: t0 + i * 60_000,
  created_by: P.ME,
  updated_by: P.ME,
});
const note = (o: Partial<GenericRow> & { id: string }, i: number): GenericRow => ({
  name: NOTE_TITLE[o.id],
  folder: null,
  owner: P.ME,
  content: content(1, ''),
  visibility: 'private',
  viewers: null,
  editors: null,
  viewer_departments: null,
  editor_departments: null,
  tags: null,
  created: t0 + i * 3600_000,
  updated: t0 + i * 3600_000,
  created_by: o.owner ?? P.ME,
  updated_by: o.owner ?? P.ME,
  ...o,
});

export function notesRecords(): Record<string, GenericRow[]> {
  return {
    [NOTES_OBJECTS.folder.slug]: [folder(F.WORK, null, 1), folder(F.MEET, F.WORK, 2), folder(F.HOME, null, 3)],
    [NOTES_OBJECTS.note.slug]: [
      note({ id: N.PLAN, folder: F.WORK, content: content(2, PLAN_HTML), tags: [TAG.PROJECT] }, 6),
      note({ id: N.MEET, folder: F.MEET, content: content(3, '## Thứ Hai\n\n- Chốt phạm vi\n- Phân việc') }, 5),
      note({ id: N.ROOT, content: content(1, 'Dòng một\nDòng hai') }, 4),
      note({ id: N.SHARED, content: content(1, 'Chia sẻ cho Lan xem.'), visibility: 'shared', viewers: [P.LAN] }, 3),
      note({ id: N.PUBLIC, content: content(1, 'Ai có link cũng đọc được.'), visibility: 'public' }, 2),
      note({ id: N.LAN, owner: P.LAN, content: content(1, 'Các bước đón nhân viên mới.'), visibility: 'shared', viewers: [P.ME] }, 1),
    ],
    [NOTES_OBJECTS.tag.slug]: [{ id: TAG.PROJECT, name: 'dự-án', created_by: P.ME, updated: t0 }],
    [NOTES_OBJECTS.pin.slug]: [],
    department_personnel: [{ id: 'DPPMOCKME00001', personnel: P.ME, department: DEP.PRODUCT, updated: t0 }],
    department: [{ id: DEP.PRODUCT, name: 'Phòng Sản phẩm', is_active: true, deleted: 0, updated: t0 }],
  };
}

/** Nạp dữ liệu Ghi chú vào mock (gọi trước khi mở cửa sổ Ghi chú). */
export function seedNotes(mock: MockCogover) {
  for (const [slug, rows] of Object.entries(notesRecords())) mock.setRecords(slug, rows);
}
