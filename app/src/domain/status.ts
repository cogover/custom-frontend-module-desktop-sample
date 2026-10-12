import type { PrioritySlug, StatusSlug, Tone } from './types';

interface StatusMeta {
  label: string;
  tone: Tone;
  group: 'open' | 'done';
}

/** The 7 real options of task.status, in display (workflow) order. */
export const STATUS: Record<StatusSlug, StatusMeta> = {
  new: { label: 'Mới', tone: 'grey', group: 'open' },
  in_progress: { label: 'Đang xử lý', tone: 'orange', group: 'open' },
  pending: { label: 'Đang chờ', tone: 'violet', group: 'open' },
  on_hold: { label: 'Tạm dừng', tone: 'sky', group: 'open' },
  resolved: { label: 'Đã xử lý', tone: 'green', group: 'done' },
  closed: { label: 'Đã đóng', tone: 'teal', group: 'done' },
  cancelled: { label: 'Đã huỷ', tone: 'red', group: 'done' },
};

export const STATUS_ORDER = Object.keys(STATUS) as StatusSlug[];
export const OPEN_STATUSES = STATUS_ORDER.filter(s => STATUS[s].group === 'open');
export const DONE_STATUSES = STATUS_ORDER.filter(s => STATUS[s].group === 'done');
/** Status set when the checkbox is ticked. */
export const TICK_STATUS: StatusSlug = 'resolved';
/** Status used to reopen a task when nothing better is remembered. */
export const REOPEN_STATUS: StatusSlug = 'new';
export const DEFAULT_STATUS: StatusSlug = 'new';

export const isKnownStatus = (s: string): s is StatusSlug => Object.prototype.hasOwnProperty.call(STATUS, s);

export function statusMeta(slug: string): StatusMeta {
  return isKnownStatus(slug) ? STATUS[slug] : { label: slug || '—', tone: 'grey', group: 'open' };
}

export const isDoneStatus = (slug: string) => isKnownStatus(slug) && STATUS[slug].group === 'done';
export const isOpenStatus = (slug: string) => !isDoneStatus(slug);

/** Explicit rank for the "Trạng thái" sort (workflow order). Unknown slugs go first. */
export function statusRank(slug: string): number {
  return isKnownStatus(slug) ? STATUS_ORDER.indexOf(slug) : -1;
}

interface PriorityMeta {
  label: string;
  tone: Tone;
  rank: number;
}

export const PRIORITY: Record<PrioritySlug, PriorityMeta> = {
  urgent: { label: 'Khẩn cấp', tone: 'red', rank: 4 },
  high: { label: 'Cao', tone: 'orange', rank: 3 },
  medium: { label: 'Trung bình', tone: 'sky', rank: 2 },
  low: { label: 'Thấp', tone: 'green', rank: 1 },
};

export const PRIORITY_ORDER = Object.keys(PRIORITY) as PrioritySlug[];
export const DEFAULT_PRIORITY: PrioritySlug = 'medium';

export const isKnownPriority = (p: string): p is PrioritySlug => Object.prototype.hasOwnProperty.call(PRIORITY, p);

/** An empty priority sorts like "medium" (CONTRACT §5). */
export function priorityRank(slug: string): number {
  return isKnownPriority(slug) ? PRIORITY[slug].rank : PRIORITY[DEFAULT_PRIORITY].rank;
}

export function priorityMeta(slug: string): { label: string; tone: Tone } {
  return isKnownPriority(slug) ? PRIORITY[slug] : { label: '—', tone: 'grey' };
}
