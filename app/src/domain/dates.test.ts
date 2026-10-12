import { describe, expect, it } from 'vitest';
import {
  dateTimeText,
  daysFromToday,
  defaultDue,
  inCurrentMonth,
  longDate,
  shortDate,
  shortDateTime,
  shortStamp,
  toMs,
  vnDateTimeToMs,
  vnIsoDate,
  vnParts,
  vnTime,
} from './dates';

// 2026-10-01 10:00 in Vietnam = 03:00 UTC
const NOW = Date.UTC(2026, 9, 1, 3, 0);
const vn = (y: number, m: number, d: number, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h - 7, mi);

describe('UTC+7 calendar maths', () => {
  it('reads wall-clock parts in Vietnam whatever the runtime zone', () => {
    expect(vnParts(NOW)).toEqual({ year: 2026, month: 10, day: 1, hour: 10, minute: 0 });
    expect(vnIsoDate(vn(2026, 12, 31, 23, 59))).toBe('2026-12-31');
    expect(vnTime(vn(2026, 1, 2, 7, 5))).toBe('07:05');
  });

  it('counts days across the Vietnamese midnight, not the UTC one', () => {
    // 23:59 today and 00:00 tomorrow in Vietnam
    expect(daysFromToday(vn(2026, 10, 1, 23, 59), NOW)).toBe(0);
    expect(daysFromToday(vn(2026, 10, 2, 0, 0), NOW)).toBe(1);
    expect(daysFromToday(vn(2026, 9, 30, 23, 59), NOW)).toBe(-1);
    // 16:59 UTC = 23:59 in Vietnam (same day); 17:00 UTC = 00:00 next day in Vietnam
    expect(daysFromToday(Date.UTC(2026, 9, 1, 16, 59), NOW)).toBe(0);
    expect(daysFromToday(Date.UTC(2026, 9, 1, 17, 0), NOW)).toBe(1);
  });

  it('builds ms from a Vietnamese date and time and rejects invalid input', () => {
    expect(vnDateTimeToMs('2026-10-01', '17:00')).toBe(vn(2026, 10, 1, 17));
    expect(vnDateTimeToMs('2026-10-02', '0:05')).toBe(vn(2026, 10, 2, 0, 5));
    expect(vnDateTimeToMs('', '17:00')).toBeNull();
    expect(vnDateTimeToMs('2026-10-01', '')).toBeNull();
    expect(vnDateTimeToMs('2026-02-31', '10:00')).toBeNull();
    expect(vnDateTimeToMs('2026-13-01', '10:00')).toBeNull();
    expect(vnDateTimeToMs('2026-10-01', '24:00')).toBeNull();
  });

  it('defaults the deadline to 17:00 today before 17:00, else tomorrow', () => {
    expect(defaultDue(vn(2026, 10, 1, 16, 59))).toEqual({ date: '2026-10-01', time: '17:00' });
    expect(defaultDue(vn(2026, 10, 1, 17, 0))).toEqual({ date: '2026-10-02', time: '17:00' });
    expect(defaultDue(vn(2026, 12, 31, 20, 0))).toEqual({ date: '2027-01-01', time: '17:00' });
  });

  it('formats short, long and date-time texts', () => {
    expect(shortDate(vn(2026, 10, 5), NOW)).toBe('5 thg 10');
    expect(shortDate(vn(2027, 1, 3), NOW)).toBe('3 thg 1, 2027');
    expect(longDate(vn(2026, 10, 2, 9))).toMatch(/^Thứ Sáu, 2 tháng 10, 2026$/);
    expect(dateTimeText(vn(2026, 10, 1, 8, 4))).toBe('08:04, 1 tháng 10, 2026');
  });

  it('formats the compact popup stamps: weekday T2…T7/CN, year only when it is not this year (UTC+7)', () => {
    expect(shortDateTime(vn(2026, 10, 4, 14, 0))).toBe('CN, 04/10/2026 14:00');
    expect(shortDateTime(vn(2026, 10, 5, 9, 5))).toBe('T2, 05/10/2026 09:05');
    expect(shortDateTime(vn(2026, 10, 3, 23, 59))).toBe('T7, 03/10/2026 23:59');
    // 00:30 in Vietnam is still the previous day in UTC: weekday and date follow Vietnam
    expect(shortDateTime(vn(2026, 10, 1, 0, 30))).toBe('T5, 01/10/2026 00:30');
    expect(shortStamp(vn(2026, 9, 30, 9, 12), NOW)).toBe('09:12 30/09');
    expect(shortStamp(vn(2025, 9, 30, 9, 12), NOW)).toBe('09:12 30/09/2025');
    // year boundary: compared in UTC+7, not in UTC
    const newYear = vn(2027, 1, 1, 0, 30); // 31/12/2026 17:30 UTC
    expect(shortStamp(vn(2026, 12, 31, 23, 59), newYear)).toBe('23:59 31/12/2026');
    expect(shortStamp(newYear, newYear)).toBe('00:30 01/01');
    expect(shortStamp(vn(2026, 12, 31, 23, 59), vn(2026, 12, 31, 23, 59))).toBe('23:59 31/12');
  });

  it('knows the current month in Vietnam', () => {
    expect(inCurrentMonth(vn(2026, 10, 31, 23), NOW)).toBe(true);
    expect(inCurrentMonth(vn(2026, 11, 1, 0), NOW)).toBe(false);
    expect(inCurrentMonth(vn(2025, 10, 15), NOW)).toBe(false);
  });

  it('parses API timestamps', () => {
    expect(toMs(1700000000000)).toBe(1700000000000);
    expect(toMs('1700000000000')).toBe(1700000000000);
    expect(toMs('2026-10-01T03:00:00Z')).toBe(NOW);
    expect(toMs('')).toBeNull();
    expect(toMs('not a date')).toBeNull();
    expect(toMs(null)).toBeNull();
    expect(toMs(Number.NaN)).toBeNull();
  });
});
