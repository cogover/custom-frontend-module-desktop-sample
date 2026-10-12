// All calendar maths happen in Asia/Ho_Chi_Minh (UTC+7, no DST), whatever the browser's own time zone is.
export const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const VN_OFFSET_MS = 7 * 3600 * 1000;
const DAY_MS = 864e5;

const pad = (n: number) => String(n).padStart(2, '0');

interface VnParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
}

export function vnParts(ms: number): VnParts {
  const d = new Date(ms + VN_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

/** Day number (days since epoch) of the Vietnamese calendar day containing `ms`. */
export const vnDayIndex = (ms: number) => Math.floor((ms + VN_OFFSET_MS) / DAY_MS);

/** Whole calendar days from today to `ms` in UTC+7 (0 = today, 1 = tomorrow, -1 = yesterday). */
export const daysFromToday = (ms: number, now: number) => vnDayIndex(ms) - vnDayIndex(now);

/** "YYYY-MM-DD" of `ms` in UTC+7. */
export function vnIsoDate(ms: number): string {
  const p = vnParts(ms);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** "HH:mm" of `ms` in UTC+7. */
export function vnTime(ms: number): string {
  const p = vnParts(ms);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HH_MM = /^(\d{1,2}):(\d{2})$/;

/** ms epoch of a Vietnamese wall-clock date + time; null when either part is invalid. */
export function vnDateTimeToMs(date: string, time: string): number | null {
  const dm = ISO_DATE.exec(date);
  const tm = HH_MM.exec(time);
  if (!dm || !tm) return null;
  const [y, mo, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])];
  const [h, mi] = [Number(tm[1]), Number(tm[2])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const utc = Date.UTC(y, mo - 1, d, h, mi);
  // reject dates such as 2026-02-31 that Date.UTC would roll over
  const back = new Date(utc);
  if (back.getUTCDate() !== d || back.getUTCMonth() !== mo - 1) return null;
  return utc - VN_OFFSET_MS;
}

export const DEFAULT_DUE_TIME = '17:00';

/** Form defaults: 17:00 today while it is still before 17:00 in Vietnam, otherwise 17:00 tomorrow. */
export function defaultDue(now: number): { date: string; time: string } {
  const p = vnParts(now);
  const beforeCutoff = p.hour < 17;
  return { date: vnIsoDate(beforeCutoff ? now : now + DAY_MS), time: DEFAULT_DUE_TIME };
}

const LONG_DATE = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: VN_TIME_ZONE,
});

/** "Thứ Năm, 2 tháng 10, 2026" */
export function longDate(ms: number): string {
  return LONG_DATE.format(new Date(ms)).replace(/^./, c => c.toUpperCase());
}

/** "D thg M" (+ ", YYYY" when not the current year), as on the task cards. */
export function shortDate(ms: number, now: number): string {
  const p = vnParts(ms);
  const sameYear = p.year === vnParts(now).year;
  return `${p.day} thg ${p.month}${sameYear ? '' : `, ${p.year}`}`;
}

const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** "CN, 04/10/2026 14:00" — compact deadline in the detail popup (weekday T2…T7, CN; UTC+7). */
export function shortDateTime(ms: number): string {
  const p = vnParts(ms);
  const weekday = WEEKDAY_SHORT[new Date(ms + VN_OFFSET_MS).getUTCDay()];
  return `${weekday}, ${pad(p.day)}/${pad(p.month)}/${p.year} ${pad(p.hour)}:${pad(p.minute)}`;
}

/** "09:12 30/09" — compact time stamp for the popup meta line; the year is added ("30/09/2025") when it is not this year (UTC+7). */
export function shortStamp(ms: number, now: number): string {
  const p = vnParts(ms);
  const year = p.year === vnParts(now).year ? '' : `/${p.year}`;
  return `${pad(p.hour)}:${pad(p.minute)} ${pad(p.day)}/${pad(p.month)}${year}`;
}

/** "HH:mm, D tháng M, YYYY" */
export function dateTimeText(ms: number): string {
  const p = vnParts(ms);
  return `${pad(p.hour)}:${pad(p.minute)}, ${p.day} tháng ${p.month}, ${p.year}`;
}

/** Same calendar month (UTC+7) as now. */
export function inCurrentMonth(ms: number, now: number): boolean {
  const a = vnParts(ms);
  const b = vnParts(now);
  return a.year === b.year && a.month === b.month;
}

/** Accepts ms numbers, numeric strings and ISO strings coming back from the API. */
export function toMs(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim()) {
    const s = value.trim();
    if (/^-?\d+$/.test(s)) return Number(s);
    const parsed = Date.parse(s);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}
