import { test, expect } from '../../support/local/fixtures';
import { OPEN_IDS, T } from '../../support/local/dataset';
import { ALL_ROLES } from '../../support/ui';

test.describe('AC7 tìm kiếm không dấu', () => {
  test('AC7 theo tiêu đề, không dấu và không phân biệt hoa thường (gồm đ → d)', async ({ app }) => {
    await app.openReady();
    await app.setRoles(ALL_ROLES);
    await app.search('nghien cuu');
    await app.expectIds([T.T3]);
    await app.search('DOI SOAT');
    await app.expectIds([T.T7]);
    await app.search('Đối soát');
    await app.expectIds([T.T7]);
    await app.search('');
    await app.expectIds(OPEN_IDS);
  });

  test('AC7 theo mô tả dạng văn bản (không khớp tên thẻ HTML)', async ({ app }) => {
    await app.openReady();
    await app.setRoles(ALL_ROLES);
    await app.search('headspace');
    await app.expectIds([T.T3]);
    await app.search('spacing');
    await app.expectIds([T.T6]);
    await app.search('strong');
    await expect(app.tid('empty-state')).toBeVisible();
    await app.expectIds([]);
  });

  test('AC7 theo tên người giao', async ({ app }) => {
    await app.openReady();
    await app.setRoles(ALL_ROLES);
    await app.search('tran quang minh');
    await expect.poll(() => app.visibleIds()).toContain(T.T4);
    const ids = await app.visibleIds();
    for (const id of ids) expect([T.T4, T.T2], `${id} không liên quan Trần Quang Minh`).toContain(id);

    await app.search('nguyen thi lan');
    await expect.poll(async () => (await app.visibleIds()).sort()).toEqual(expect.arrayContaining([T.T1, T.T3].sort()));
    for (const id of await app.visibleIds()) expect([T.T1, T.T3]).toContain(id);
  });
});
