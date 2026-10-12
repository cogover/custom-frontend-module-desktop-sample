import { test, expect, LOCAL_URL } from '../../support/local/fixtures';
import { ASSIGNEE_DONE, ASSIGNEE_OPEN, bulkTasks, OPEN_IDS, T, P } from '../../support/local/dataset';
import { MockCogover } from '../../support/local/mock-api';
import { DONE_STATUSES, OPEN_STATUSES, QUICK_TITLE } from '../../support/model';
import { ALL_ROLES, chooseOption, expectSelected } from '../../support/ui';

test.describe('AC1 mở app khi đã đăng nhập', () => {
  test('AC1 hiện "Chưa xong" với đúng các task mở trong phạm vi', async ({ app }) => {
    await app.openReady();
    await expect(app.tid('list-title')).toHaveText(QUICK_TITLE.open);
    // Đổi tên 2026-10-01: nút sidebar + tiêu đề là "Chưa xong" (không còn "Tất cả chưa xong").
    await expect(app.tid('quick-open')).toContainText(QUICK_TITLE.open);
    await expect(app.tid('quick-open')).not.toContainText('Tất cả chưa xong');
    await expectSelected(app.tid('quick-open'));
    // Mặc định chỉ "Giao cho tôi".
    await app.expectIds(ASSIGNEE_OPEN);
    await expect(app.tid('list-count')).toContainText(String(ASSIGNEE_OPEN.length));
    // Tick đủ 3 vai trò → toàn bộ phạm vi (assignee OR reporter OR ccs), không có task ngoài phạm vi / đã xong.
    await app.setRoles(ALL_ROLES);
    await app.expectIds(OPEN_IDS);
    await expect(app.item(T.X1), 'task ngoài phạm vi không được hiện').toHaveCount(0);
    for (const id of [T.D1, T.D2, T.D3]) await expect(app.item(id)).toHaveCount(0);
    await expect(app.tid('list-count')).toContainText('8');
  });

  test('AC1 asset tải tương đối từ ./assets/ (→ /_cm_5/assets/ khi deploy), không source map', async ({ app, guard, page }) => {
    await app.openReady();
    const html = await (await page.request.get(LOCAL_URL + '/')).text();
    const refs = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((m) => m[1]);
    expect(refs.length, 'index.html phải tham chiếu asset JS/CSS').toBeGreaterThan(0);
    for (const r of refs) expect(r, `asset "${r}" phải là đường dẫn tương đối ./assets/ (base "./")`).toMatch(/^\.?\/?assets\//);
    for (const r of refs) expect(r, `asset "${r}" không được tuyệt đối từ gốc`).not.toMatch(/^\//);
    expect(html, 'không gọi Google Fonts/CDN ngoài').not.toMatch(/fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr|unpkg\.com/);

    const assetReqs = guard.requests.filter((r) => ['script', 'stylesheet', 'font'].includes(r.resourceType));
    expect(assetReqs.length).toBeGreaterThan(0);
    for (const r of assetReqs) expect(r.url, 'asset phải nằm dưới /assets/').toContain(`${LOCAL_URL}/assets/`);
    expect(guard.requests.some((r) => r.url.endsWith('.map')), 'không tải file .map').toBe(false);

    for (const r of assetReqs.filter((x) => x.resourceType === 'script')) {
      const js = await (await page.request.get(r.url)).text();
      expect(js, `${r.url} không được có sourceMappingURL`).not.toMatch(/sourceMappingURL=/);
      expect(js, `${r.url} không được đóng gói mock dev (__mock, mock-csrf-token)`).not.toMatch(/__mock|mock-csrf-token/);
    }
  });

  test('AC1 gọi API đúng contract khi tải (phạm vi, đếm đã xong size 1, người dùng hiện tại)', async ({ app, mock }) => {
    await app.openReady();
    expect(mock.violations, 'request lệch contract').toEqual([]);

    const me = mock.byKind('list').filter((r) => r.body?.object_slug === 'personnel');
    expect(
      me.some((r) => r.body.filters?.some((f: any) => f.field === 'id' && f.params === '$currentUser')),
      'phải đọc người dùng hiện tại bằng $currentUser',
    ).toBe(true);

    const open = mock.taskLists('open');
    expect(open.length, 'phải tải task mở').toBeGreaterThan(0);
    const first = open[0].body;
    expect(first.fields, 'fields phải có "id"').toContain('id');
    expect(first.type, 'phải có type').toBeDefined();
    const f = first.filters as any[];
    expect(f).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'assignee', params: '$currentUser' }),
        expect.objectContaining({ field: 'reporter', params: '$currentUser' }),
        expect.objectContaining({ field: 'ccs', op: 'in', params: ['$currentUser'] }),
      ]),
    );
    const st = f.find((x) => x.field === 'status');
    expect([...st.params].sort()).toEqual([...OPEN_STATUSES].sort());

    const done = mock.taskLists('done');
    expect(done.length, 'phải đếm task đã xong').toBeGreaterThan(0);
    for (const d of done) expect(d.body.size, 'khi đang ở "chưa xong" chỉ đếm đã xong (size 1)').toBe(1);
    const dst = (done[0].body.filters as any[]).find((x) => x.field === 'status');
    expect([...dst.params].sort()).toEqual([...DONE_STATUSES].sort());
    // Đếm đã xong theo vai trò đang tick (mặc định chỉ assignee) — contract mục 4 bước 1.
    expect(MockCogover.roleFields(done[0]), 'đếm đã xong chỉ với vai trò đang tick').toEqual(['assignee']);
    await app.expectCounts({ done: ASSIGNEE_DONE.length });
  });

  test('AC1 tải toàn bộ task mở qua nhiều trang (>100, gửi lại search_after nguyên văn)', async ({ app, mock }) => {
    mock.setTasks(bulkTasks(150, { prefix: 'O', status: 'new' }));
    await app.openReady();
    await app.expectCounts({ open: 150 });
    await expect(app.items()).toHaveCount(150, { timeout: 10_000 });
    const pages = mock.taskLists('open');
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(pages[1].body.search_after, 'trang 2 gửi lại search_after của trang 1').toEqual(pages[0].response.data.search_after);
    expect(mock.violations).toEqual([]);
  });

  test('AC1 không hiển thị/ghi log PII của lookup nhân sự (email, điện thoại)', async ({ app, page }) => {
    const logs: string[] = [];
    page.on('console', (m) => logs.push(m.text()));
    await app.openReady();
    await app.openTask(T.T7);
    await expect(app.view()).toContainText('Đối soát công nợ quý 3');
    const text = await page.locator('body').innerText();
    expect(text).not.toContain('@pii.invalid');
    expect(text).not.toContain('+84 900 111 222');
    expect(logs.join('\n')).not.toContain('@pii.invalid');
    expect(logs.join('\n')).not.toContain('+84 900 111 222');
  });

  test('AC1 mọi request API đúng contract trong luồng đầy đủ (header, method, field ghi)', async ({ app, mock }) => {
    await app.openReady();
    // Đọc quy trình trạng thái đúng 1 lần khi tải (GET, cookie + CSRF, không x-req-* — mock ghi violation nếu lệch).
    await expect.poll(() => mock.ruleReads().length).toBe(1);
    // tick hợp lệ theo quy trình (Đang xử lý → Đã xử lý); không có bước ngược → không Hoàn tác
    await app.inItem(T.T1, 'task-checkbox').click();
    await expect(app.toast()).toBeVisible({ timeout: 3000 });
    // đổi trạng thái trên thẻ (Mới → Đang xử lý)
    await chooseOption(app.page, app.inItem(T.T8, 'task-status'), 'Đang xử lý');
    await expect.poll(() => mock.task(T.T8)?.status).toBe('in_progress');
    // tạo
    await app.openCreate();
    await app.tid('field-title').fill('Việc kiểm tra contract');
    await app.tid('form-submit').click();
    await expect(app.dialog()).toBeHidden();
    // sửa qua popup
    await app.openTask(T.T3);
    await app.tid('form-edit').click();
    await app.tid('field-title').fill('Nghiên cứu ứng dụng đối thủ (sửa)');
    await app.tid('form-submit').click();
    await expect(app.view()).toBeVisible();
    await app.page.keyboard.press('Escape');
    await expect(app.dialog()).toBeHidden();
    // xoá (thẻ không còn nút xoá — xoá từ popup xem)
    await app.openDeleteConfirm(T.T6);
    await app.tid('confirm-delete-ok').click();
    await expect.poll(() => mock.deletes().length, { timeout: 3000 }).toBe(1);

    expect(mock.creates()).toHaveLength(1);
    expect(mock.updates().length).toBeGreaterThanOrEqual(3);
    expect(mock.violations, 'request lệch contract').toEqual([]);
    // Không bao giờ ghi ccs/project
    for (const w of mock.writes()) {
      expect(Object.keys(w.body?.data ?? {})).not.toContain('ccs');
      expect(Object.keys(w.body?.data ?? {})).not.toContain('project');
    }
    expect(mock.task(mock.creates()[0].response.data.id)?.reporter).toBe(P.ME);
    expect(mock.ruleReads(), 'quy trình chỉ đọc một lần').toHaveLength(1);
  });
});
