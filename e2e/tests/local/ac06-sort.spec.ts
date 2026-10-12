import { test, expect } from '../../support/local/fixtures';
import { ASSIGNEE_OPEN, defaultTasks, OPEN_IDS, T } from '../../support/local/dataset';
import { priorityRank, SORT_LABEL, statusRank, type SortField } from '../../support/model';
import { ALL_ROLES, expectSelected, selectedOptionLabel } from '../../support/ui';

const byId = new Map(defaultTasks().map((t) => [t.id, t]));
const collator = new Intl.Collator('vi');

/** Nhãn nút đổi chiều như thiết kế mẫu. */
const DIR_LABEL: Record<SortField, { asc: string; desc: string }> = {
  priority: { desc: 'Cao → thấp', asc: 'Thấp → cao' },
  due: { asc: 'Gần → xa', desc: 'Xa → gần' },
  created: { desc: 'Mới → cũ', asc: 'Cũ → mới' },
  status: { asc: 'Theo quy trình', desc: 'Ngược lại' },
  title: { asc: 'A → Z', desc: 'Z → A' },
};

const monotonic = (vals: number[], dir: 'asc' | 'desc') =>
  vals.every((v, i) => i === 0 || (dir === 'asc' ? vals[i - 1] <= v : vals[i - 1] >= v));

const dueAsc = [T.T7, T.T3, T.T8, T.T1, T.T4, T.T2, T.T5, T.T6];
const createdAsc = [T.T1, T.T2, T.T3, T.T4, T.T5, T.T6, T.T7, T.T8];
const titleAsc = [...OPEN_IDS].sort((a, b) => collator.compare(byId.get(a)!.subject, byId.get(b)!.subject));

test.describe('AC6 sắp xếp', () => {
  test('AC6 mặc định Ưu tiên Cao → thấp', async ({ app }) => {
    await app.openReady();
    expect(await selectedOptionLabel(app.tid('sort-by'))).toMatch(SORT_LABEL.priority);
    await expectSelected(app.tid('sort-dir-desc'));
    await expect(app.tid('sort-dir-desc')).toContainText(DIR_LABEL.priority.desc);
    const ids = await app.visibleIds();
    expect(ids.sort()).toEqual([...ASSIGNEE_OPEN].sort());
    const ranks = (await app.visibleIds()).map((id) => priorityRank(byId.get(id)!.priority));
    expect(monotonic(ranks, 'desc'), `thứ tự ưu tiên ${ranks.join(',')}`).toBe(true);
  });

  for (const dir of ['asc', 'desc'] as const) {
    test(`AC6 Ưu tiên ${dir} (trống coi như Trung bình)`, async ({ app }) => {
      await app.openReady();
      await app.setRoles(ALL_ROLES);
      await app.sort('priority', dir);
      await expect(app.tid(`sort-dir-${dir}`)).toContainText(DIR_LABEL.priority[dir]);
      await expect
        .poll(async () => monotonic((await app.visibleIds()).map((id) => priorityRank(byId.get(id)!.priority)), dir))
        .toBe(true);
      await expect(app.items()).toHaveCount(8);
    });

    test(`AC6 Hạn chót ${dir}`, async ({ app }) => {
      await app.openReady();
      await app.setRoles(ALL_ROLES);
      await app.sort('due', dir);
      await expect(app.tid(`sort-dir-${dir}`)).toContainText(DIR_LABEL.due[dir]);
      await app.expectIds(dir === 'asc' ? dueAsc : [...dueAsc].reverse(), { ordered: true });
    });

    test(`AC6 Ngày tạo ${dir}`, async ({ app }) => {
      await app.openReady();
      await app.setRoles(ALL_ROLES);
      await app.sort('created', dir);
      await expect(app.tid(`sort-dir-${dir}`)).toContainText(DIR_LABEL.created[dir]);
      await app.expectIds(dir === 'asc' ? createdAsc : [...createdAsc].reverse(), { ordered: true });
    });

    test(`AC6 Trạng thái ${dir} (theo thứ tự 7 trạng thái)`, async ({ app }) => {
      await app.openReady();
      await app.setRoles(ALL_ROLES);
      await app.sort('status', dir);
      await expect(app.tid(`sort-dir-${dir}`)).toContainText(DIR_LABEL.status[dir]);
      await expect
        .poll(async () => monotonic((await app.visibleIds()).map((id) => statusRank(byId.get(id)!.status)), dir))
        .toBe(true);
      await expect(app.items()).toHaveCount(8);
    });

    test(`AC6 Tiêu đề ${dir}`, async ({ app }) => {
      await app.openReady();
      await app.setRoles(ALL_ROLES);
      await app.sort('title', dir);
      await expect(app.tid(`sort-dir-${dir}`)).toContainText(DIR_LABEL.title[dir]);
      await app.expectIds(dir === 'asc' ? titleAsc : [...titleAsc].reverse(), { ordered: true });
    });
  }
});
