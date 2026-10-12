import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { chooseOption, descEditor, descHtml, getItem, inItem, item, pickDate, renderApp, setDescLines, taskOnServer, typeInDesc } from './test/app';
import { mockTasks } from '../dev/mock-seed';
import { FIXED_NOW, ME, jsonResponse } from './test/fixtures';

const dialog = () => screen.getByTestId('task-dialog');
const lastUpdate = (backend: { calls: { service?: string; body: any }[] }) => backend.calls.filter(c => c.service === '10201').at(-1)?.body.data;

describe('detail popup (AC11, AC16, AC18, AC19)', () => {
  it('opens on a card click, shows details, and Esc closes it', async () => {
    const { user } = await renderApp();
    await user.click(getItem('TASMOCK0001').querySelector('.desc')!);
    expect(dialog()).toBeInTheDocument();
    expect(window.location.hash).toBe('#/task/TASMOCK0001');
    const view = within(screen.getByTestId('task-view'));
    // no "Chi tiết công việc" heading: the task name is the popup's title
    expect(screen.queryByText('Chi tiết công việc')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Chuẩn bị báo cáo doanh thu quý 3' })).toBe(dialog());
    expect(within(dialog()).getByRole('heading', { name: 'Chuẩn bị báo cáo doanh thu quý 3' })).toHaveClass('v-title');
    // an editable task: the properties are controls that save at once (quick edit)
    expect(view.getByTestId('view-status')).toHaveTextContent('Đang xử lý');
    expect(view.getByTestId('view-reporter')).toHaveTextContent('Nguyễn Thị Lan');
    expect(view.getByTestId('view-assignee')).toHaveTextContent('Trần Minh An');
    expect(view.getByTestId('view-ccs')).toHaveTextContent('Không có'); // no followers
    expect(screen.getByTestId('form-edit')).toHaveFocus();
    // top line: short meta on the left (full times in the titles), Sửa · Xoá · ✕ on the right; no footer
    const meta = screen.getByTestId('task-meta');
    expect(meta).toHaveTextContent('TAS-1001 · Tạo 18:00 29/09 · Cập nhật 18:01 29/09');
    expect(within(meta).getByText('Tạo 18:00 29/09')).toHaveAttribute('title', 'Tạo lúc 18:00, 29 tháng 9, 2026');
    expect(within(meta).getByText('Cập nhật 18:01 29/09')).toHaveAttribute('title', 'Cập nhật lúc 18:01, 29 tháng 9, 2026');
    const actions = Array.from(dialog().querySelectorAll('.sheet-actions button')) as HTMLElement[];
    expect(actions.map(b => b.dataset.testid)).toEqual(['form-edit', 'form-delete', 'dialog-close']);
    expect(actions.map(b => b.getAttribute('aria-label'))).toEqual(['Sửa', 'Xoá công việc', 'Đóng']);
    expect(actions.map(b => b.title)).toEqual(['Sửa', 'Xoá công việc', 'Đóng']);
    expect(dialog().querySelector('.sheet-head')).toContainElement(meta);
    expect(dialog().querySelector('.sheet-foot')).toBeNull();
    expect(screen.queryByTestId('form-cancel')).toBeNull();
    // properties: the form's two-row grid — task row, people row
    const rows = Array.from(screen.getByTestId('task-view').querySelectorAll('.f-props > .v-row')) as HTMLElement[];
    expect(rows.map(r => r.dataset.group)).toEqual(['task', 'people']);
    const labels = (r: Element) => Array.from(r.querySelectorAll('.f-label')).map(l => l.textContent);
    expect(labels(rows[0])).toEqual(['Trạng thái', 'Mức ưu tiên', 'Hạn chót']);
    expect(labels(rows[1])).toEqual(['Người giao', 'Người được giao', 'Người theo dõi']);
    // deadline: date + time controls and the relative chip
    expect(view.getByTestId('view-due-date')).toHaveTextContent('01/10/2026');
    expect(view.getByTestId('view-due-time')).toHaveTextContent('23:30');
    expect(view.getByText('Hôm nay')).toHaveClass('due-chip', 'soon');
    expect(screen.getByTestId('task-view').querySelector('.v-desc')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('task-dialog')).toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('Tab walks through the header icons; Xoá opens the confirmation and ✕ closes the popup', async () => {
    const { user } = await renderApp();
    await user.click(getItem('TASMOCK0001').querySelector('.desc')!);
    expect(screen.getByTestId('form-edit')).toHaveFocus();
    await user.tab();
    expect(screen.getByTestId('form-delete')).toHaveFocus();
    await user.tab();
    expect(screen.getByTestId('dialog-close')).toHaveFocus();
    await user.tab({ shift: true });
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('confirm-delete')).toBeInTheDocument();
    await user.click(screen.getByTestId('confirm-delete-cancel'));
    await waitFor(() => expect(screen.getByTestId('form-delete')).toHaveFocus());
    await user.click(screen.getByTestId('dialog-close'));
    expect(screen.queryByTestId('task-dialog')).toBeNull();
  });

  it('shows several followers as stacked avatars, the first name and +N, everybody in the title', async () => {
    const tasks = mockTasks(FIXED_NOW).map(t =>
      t.id === 'TASMOCK0001' ? { ...t, ccs: ['PERMOCK00003', 'PERMOCK00004', 'PERMOCK00005', 'PERMOCK00006'] } : t,
    );
    const { user } = await renderApp({ tasks });
    await user.click(getItem('TASMOCK0001').querySelector('.desc')!);
    const stack = screen.getByTestId('people-stack');
    expect(stack.querySelectorAll('.pstack-avatars .avatar')).toHaveLength(3);
    expect(stack.querySelector('.pmore')).toHaveTextContent('+3');
    const names = stack.getAttribute('title')!.replace('Người theo dõi: ', '').split(', ');
    expect(names).toHaveLength(4);
    expect(stack.querySelector('.pname')).toHaveTextContent(names[0]);
    expect(stack).toHaveTextContent(`${names[0]}+3, ${names.slice(1).join(', ')}`); // the rest for screen readers
  });

  it('view → Sửa → Lưu updates the server and returns to view; Huỷ/Esc discard edits', async () => {
    const { user, backend } = await renderApp();
    await user.click(getItem('TASMOCK0001').querySelector('.desc')!);
    await user.click(screen.getByTestId('form-edit'));
    expect(screen.getByTestId('task-form')).toBeInTheDocument();
    const title = screen.getByTestId('field-title');
    expect(title).toHaveFocus();
    expect(await descHtml()).toBe('<p>Tổng hợp số liệu từ 3 chi nhánh.</p><p>Gửi trước buổi họp giao ban.</p>');
    expect(screen.getByTestId('field-desc')).toHaveAccessibleName('Mô tả');
    expect(screen.getByTestId('field-desc')).toHaveAttribute('role', 'textbox');
    expect(screen.getByTestId('field-due-date')).toHaveTextContent('01/10/2026');
    expect(screen.getByTestId('field-due-date')).toHaveAttribute('data-value', '2026-10-01');
    expect(screen.getByTestId('field-due-time')).toHaveTextContent('23:30');
    expect(screen.getByTestId('field-priority')).toHaveTextContent('Cao');
    expect(screen.getByTestId('field-status')).toHaveTextContent('Đang xử lý');
    expect(screen.getByTestId('field-reporter')).toHaveAttribute('data-person-id', 'PERMOCK00002');
    expect(screen.getByTestId('field-assignee')).toHaveAttribute('data-person-id', ME);

    // Esc while editing → back to view, nothing saved
    await user.type(title, ' NHÁP');
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('task-view')).toBeInTheDocument();
    expect(screen.getByTestId('form-edit')).toHaveFocus();
    // Huỷ → back to view
    await user.click(screen.getByTestId('form-edit'));
    await user.click(screen.getByTestId('form-cancel'));
    expect(screen.getByTestId('task-view')).toBeInTheDocument();
    expect(lastUpdate(backend)).toBeUndefined();

    await user.click(screen.getByTestId('form-edit'));
    await user.clear(screen.getByTestId('field-title'));
    await user.type(screen.getByTestId('field-title'), 'Báo cáo doanh thu quý 3 (bản cuối)');
    await setDescLines(['Dòng 1', '<b>Dòng 2</b>']);
    chooseOption(screen.getByTestId('field-priority'), 'Khẩn cấp');
    expect(screen.getByTestId('field-priority')).toHaveTextContent('Khẩn cấp');
    chooseOption(screen.getByTestId('field-status'), 'Đang chờ');
    pickDate('field-due-date', '2026-10-03');
    chooseOption(screen.getByTestId('field-due-time'), '08:30');
    await user.click(screen.getByTestId('form-submit'));

    await waitFor(() => expect(screen.getByTestId('task-view')).toBeInTheDocument());
    expect(lastUpdate(backend)).toEqual({
      object_type: 'OTDEMOTASK001',
      workspace_id: 'WSDEMO0000001',
      id: 'TASMOCK0001',
      subject: 'Báo cáo doanh thu quý 3 (bản cuối)',
      description: '<p>Dòng 1</p><p>&lt;b&gt;Dòng 2&lt;/b&gt;</p>',
      due_date: Date.UTC(2026, 9, 3, 1, 30),
      priority: 'urgent',
      status: 'pending',
    });
    expect(taskOnServer(backend, 'TASMOCK0001')).toMatchObject({ subject: 'Báo cáo doanh thu quý 3 (bản cuối)', status: 'pending' });
    expect(within(screen.getByTestId('task-view')).getByText('Báo cáo doanh thu quý 3 (bản cuối)')).toBeInTheDocument();
    expect(screen.getByTestId('toast')).toHaveTextContent('Đã lưu “Báo cáo doanh thu quý 3 (bản cuối)”');
    expect(inItem('TASMOCK0001').getByTestId('task-title')).toHaveTextContent('Báo cáo doanh thu quý 3 (bản cuối)');
  });

  it.each(['mouse', 'keyboard'])('"Sửa" (%s) opens the form and it stays open after the personnel list loads', async how => {
    const { user, backend } = await renderApp();
    await user.click(getItem('TASMOCK0005').querySelector('.main')!);
    const editBtn = screen.getByTestId('form-edit');
    if (how === 'mouse') await user.click(editBtn);
    else {
      editBtn.focus();
      await user.keyboard('{Enter}');
    }
    // Browsers run a button's default action after the click handlers: if React reused this <button>
    // and flipped it to type="submit", the click would submit the form straight back to "view".
    const submit = screen.getByTestId('form-submit');
    expect(submit).not.toBe(editBtn);
    expect(editBtn.isConnected).toBe(false);
    await waitFor(() =>
      expect(backend.calls.some(c => c.body?.object_slug === 'personnel' && c.body.filters[0].field === 'status')).toBe(true),
    );
    await new Promise(r => setTimeout(r, 20));
    expect(screen.getByTestId('task-form')).toBeInTheDocument();
    expect(screen.queryByTestId('task-view')).toBeNull();
    expect(screen.getByTestId('field-title')).toHaveFocus();
    expect(backend.calls.filter(c => c.service === '10201')).toHaveLength(0);
    expect(screen.getByTestId('toast')).not.toBeVisible();
  });

  it('saving without changes sends nothing; a failed save keeps the form open with the error', async () => {
    let fail = false;
    const { user, backend } = await renderApp({}, {
      override: path => (fail && path === '/api/v1/records' ? jsonResponse({ r: 9, msg: 'Bản ghi đang bị khoá' }) : undefined),
    });
    await user.click(getItem('TASMOCK0005').querySelector('.main')!);
    await user.click(screen.getByTestId('form-edit'));
    await user.click(screen.getByTestId('form-submit'));
    expect(screen.getByTestId('task-view')).toBeInTheDocument();
    expect(lastUpdate(backend)).toBeUndefined();

    fail = true;
    await user.click(screen.getByTestId('form-edit'));
    await user.type(screen.getByTestId('field-title'), ' 2');
    await user.click(screen.getByTestId('form-submit'));
    expect(await screen.findByTestId('form-error')).toHaveTextContent('Bản ghi đang bị khoá');
    expect(screen.getByTestId('task-form')).toBeInTheDocument();
    expect(taskOnServer(backend, 'TASMOCK0005').subject).toBe('Phỏng vấn ứng viên vị trí kế toán');
  });

  it('renders the description sanitised and never overwrites a formatted one (AC18)', async () => {
    const { user, backend } = await renderApp();
    await user.click(getItem('TASMOCK0003').querySelector('.desc')!);
    const desc = screen.getByTestId('task-desc');
    expect(desc.innerHTML).not.toMatch(/script|onerror|onclick/i);
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
    expect(within(desc).getByRole('link', { name: 'quy trình hiện hành' })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(desc).getByRole('link', { name: 'quy trình hiện hành' })).toHaveAttribute('target', '_blank');
    expect(within(desc).getByRole('img', { name: 'Sơ đồ kho' })).toBeInTheDocument();
    expect(within(desc).getByText('Đo thời gian hiện tại')).toBeInTheDocument();

    // the formatting is loaded into the editor (scripts and handlers left out); untouched → not sent back
    await user.click(screen.getByTestId('form-edit'));
    expect(screen.queryByTestId('field-desc-locked')).toBeNull();
    const html = await descHtml();
    expect(html).toContain('<p><strong>Mục tiêu:</strong> giảm thời gian nhập kho.</p><ul><li>Đo thời gian hiện tại</li><li>Đề xuất cải tiến</li></ul>');
    expect(html).toContain('<a href="https://example.com/quy-trinh" target="_blank" rel="noopener noreferrer">quy trình hiện hành</a>');
    expect(html).toContain('<img src="/__mock/image.svg" alt="Sơ đồ kho">');
    expect(html).not.toMatch(/script|onerror|onclick|__xss/);
    expect(screen.getByTestId('field-desc').querySelector('img[alt="Sơ đồ kho"]')).toBeInTheDocument();
    await user.type(screen.getByTestId('field-title'), ' (đã xem)');
    await user.click(screen.getByTestId('form-submit'));
    await waitFor(() => expect(lastUpdate(backend)).toBeDefined());
    expect(lastUpdate(backend)).not.toHaveProperty('description');
    expect(lastUpdate(backend).subject).toBe('Rà soát quy trình nhập kho (đã xem)');
    expect(String(taskOnServer(backend, 'TASMOCK0003').description)).toContain('<img src="/__mock/image.svg"');
  });

  it('edits formatted descriptions and saves clean HTML; unsupported ones stay read-only and are never sent', async () => {
    const tasks = mockTasks(FIXED_NOW).map(t =>
      t.id === 'TASMOCK0001'
        ? { ...t, description: '<p>Bảng:</p><table><tr><td>Quý 3</td><td>1,2 tỷ</td></tr></table>' }
        : t.id === 'TASMOCK0005'
          ? { ...t, description: '<ol><li>Gửi <a href="https://x.test/t/1">ticket</a></li></ol><p>⇒ Chờ</p>' }
          : t,
    );
    const { user, backend } = await renderApp({ tasks });
    // unsupported (table): read-only box with the note, description untouched on save
    await user.click(getItem('TASMOCK0001').querySelector('.desc')!);
    await user.click(screen.getByTestId('form-edit'));
    const locked = screen.getByTestId('field-desc');
    expect(locked).toHaveAttribute('aria-readonly', 'true');
    expect(locked).toHaveAttribute('role', 'textbox');
    expect(locked).toHaveAccessibleName('Mô tả');
    expect(locked).not.toHaveAttribute('contenteditable', 'true');
    expect(locked.querySelector('table')).toBeInTheDocument(); // shown as it is
    expect(screen.getByTestId('field-desc-locked')).toHaveTextContent('Mô tả có định dạng chưa hỗ trợ — hãy sửa trên Cogover');
    expect(locked).toHaveAccessibleDescription('Mô tả có định dạng chưa hỗ trợ — hãy sửa trên Cogover');
    expect(screen.queryByTestId('rte-toolbar')).toBeNull();
    await user.type(screen.getByTestId('field-title'), ' (bảng)');
    await user.click(screen.getByTestId('form-submit'));
    await waitFor(() => expect(lastUpdate(backend)).toBeDefined());
    expect(lastUpdate(backend)).not.toHaveProperty('description');
    await user.keyboard('{Escape}');

    // supported: change it → clean semantic HTML is sent
    await user.click(getItem('TASMOCK0005').querySelector('.main')!);
    await user.click(screen.getByTestId('form-edit'));
    expect(await descHtml()).toBe('<ol><li>Gửi <a href="https://x.test/t/1" target="_blank" rel="noopener noreferrer">ticket</a></li></ol><p>⇒ Chờ</p>');
    await typeInDesc(' phản hồi');
    await user.click(screen.getByTestId('form-submit'));
    await waitFor(() => expect(lastUpdate(backend)?.id).toBe('TASMOCK0005'));
    expect(lastUpdate(backend).description).toBe(
      '<ol><li>Gửi <a href="https://x.test/t/1" target="_blank" rel="noopener noreferrer">ticket</a></li></ol><p>⇒ Chờ phản hồi</p>',
    );
  });

  it('is read-only for a follow-only task', async () => {
    const { user } = await renderApp();
    await user.click(getItem('TASMOCK0006').querySelector('.desc')!);
    expect(screen.getByText('Bạn chỉ theo dõi công việc này')).toBeInTheDocument();
    // properties as text, no quick-edit controls
    for (const id of ['view-status', 'view-priority', 'view-due-date', 'view-due-time', 'view-reporter', 'view-assignee', 'view-ccs']) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    expect(screen.getByTestId('view-due')).toHaveAttribute('title', expect.stringMatching(/^Thứ /));
    expect(screen.queryByTestId('form-edit')).toBeNull(); // no Sửa / Xoá icons, only the ✕
    expect(screen.queryByTestId('form-delete')).toBeNull();
    expect(dialog().querySelector('.sheet-actions-sep')).toBeNull();
    expect(screen.getByTestId('dialog-close')).toHaveFocus();
    await user.click(screen.getByTestId('dialog-close'));
    expect(screen.queryByTestId('task-dialog')).toBeNull();
  });

  it('deletes from the popup after confirmation; Esc on the confirmation keeps the popup open', async () => {
    const { user, backend } = await renderApp();
    await user.click(getItem('TASMOCK0005').querySelector('.main')!);
    await user.click(screen.getByTestId('form-delete'));
    expect(screen.getByTestId('confirm-delete')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-delete-cancel')).toHaveFocus();
    await user.keyboard('{Escape}'); // closes the confirmation only
    expect(screen.queryByTestId('confirm-delete')).toBeNull();
    expect(dialog()).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('form-delete')).toHaveFocus());
    await user.click(screen.getByTestId('form-delete'));
    await user.click(screen.getByTestId('confirm-delete-ok'));
    await waitFor(() => expect(screen.queryByTestId('task-dialog')).toBeNull());
    expect(item('TASMOCK0005')).toBeUndefined();
    expect(taskOnServer(backend, 'TASMOCK0005')).toBeUndefined();
    expect(screen.getByTestId('toast')).toHaveTextContent('Đã xoá “Phỏng vấn ứng viên vị trí kế toán”');
    expect(window.location.hash).toBe('');
  });

  it('Esc right after the confirmation appears over the popup closes only the confirmation, every time', async () => {
    const { backend, user } = await renderApp();
    const g = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    for (let i = 0; i < 5; i++) {
      await user.click(getItem('TASMOCK0001').querySelector('.desc')!);
      expect(dialog()).toBeInTheDocument();
      // a real click then Esc with nothing flushed in between (outside act): Radix moves its Esc listener
      // to the newest layer only in a later, lower-priority render — the popup underneath must not take it
      const actEnv = g.IS_REACT_ACT_ENVIRONMENT;
      g.IS_REACT_ACT_ENVIRONMENT = false;
      try {
        screen.getByTestId('form-delete').focus(); // a real click focuses the button
        screen.getByTestId('form-delete').click();
        for (let k = 0; k < 3; k++) await Promise.resolve();
        expect(screen.getByTestId('confirm-delete')).toBeInTheDocument();
        expect(screen.getByTestId('confirm-delete-cancel')).toHaveFocus();
        document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await waitFor(() => expect(screen.queryByTestId('confirm-delete')).toBeNull());
      } finally {
        g.IS_REACT_ACT_ENVIRONMENT = actEnv;
      }
      expect(screen.getByTestId('task-dialog')).toBeInTheDocument();
      expect(window.location.hash).toBe('#/task/TASMOCK0001');
      await waitFor(() => expect(screen.getByTestId('form-delete')).toHaveFocus()); // back on the button that opened it
      await user.keyboard('{Escape}'); // the next Esc closes the popup
      expect(screen.queryByTestId('task-dialog')).toBeNull();
    }
    expect(backend.calls.filter(c => c.path === '/api/v1/records/delete')).toHaveLength(0);
  });

  it('opens with the keyboard: Tab to a card, Enter, focus stays in the popup (AC16)', async () => {
    const { user } = await renderApp();
    getItem('TASMOCK0002').focus();
    await user.keyboard('{Enter}');
    expect(dialog()).toBeInTheDocument();
    expect(dialog()).toContainElement(document.activeElement as HTMLElement);
    await user.tab();
    expect(dialog()).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('task-dialog')).toBeNull();
  });

  it('opens a deep link #/task/<id> after loading, even for a done task not yet loaded (AC19)', async () => {
    window.history.replaceState(null, '', '/#/task/TASMOCKD005');
    await renderApp();
    expect(await screen.findByTestId('task-view')).toHaveTextContent('Đặt lịch bảo trì máy lạnh (đợt 5)');
    await screen.findByTestId('form-edit');
  });

  it('reacts to hash changes and reports unknown ids', async () => {
    await renderApp();
    window.history.replaceState(null, '', '/#/task/TASMOCK0004');
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(await screen.findByTestId('task-view')).toHaveTextContent('Cập nhật hồ sơ năng lực công ty');
    window.history.replaceState(null, '', '/');
    fireEvent(window, new HashChangeEvent('hashchange'));
    await waitFor(() => expect(screen.queryByTestId('task-dialog')).toBeNull());
    window.history.replaceState(null, '', '/#/task/NOPE');
    fireEvent(window, new HashChangeEvent('hashchange'));
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('Không tìm thấy công việc này hoặc bạn không có quyền xem.'));
    expect(window.location.hash).toBe('');
  });

  it('opens an out-of-scope task read-only from a link', async () => {
    window.history.replaceState(null, '', '/#/task/TASMOCK0011');
    await renderApp();
    expect(await screen.findByText('Bạn không được giao công việc này — chỉ xem')).toBeInTheDocument();
    expect(screen.queryByTestId('form-edit')).toBeNull();
    expect(screen.getByTestId('dialog-close')).toHaveFocus();
    expect(item('TASMOCK0011')).toBeUndefined();
  });
});

describe('popup open/close stays cheap (no page-wide style/layout invalidation)', () => {
  it('does not inject a stylesheet or restyle <body> on desktop', async () => {
    const { user } = await renderApp();
    const styles = document.querySelectorAll('style').length;
    await user.click(screen.getByTestId('open-create'));
    expect(dialog()).toBeInTheDocument();
    expect(document.querySelectorAll('style').length).toBe(styles);
    expect(document.body).not.toHaveAttribute('data-scroll-locked');
    expect(document.documentElement).not.toHaveClass('locked');
    expect(dialog().parentElement).toHaveClass('scrim');
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('task-dialog')).toBeNull();
  });

  it('stays open on a press outside it, in view, create and edit; ✕, Esc and Huỷ still close', async () => {
    const { user } = await renderApp();
    const pressOutside = () => {
      const scrim = dialog().parentElement!;
      fireEvent.pointerDown(scrim, { button: 0, pointerType: 'mouse' });
      fireEvent.pointerUp(scrim, { button: 0, pointerType: 'mouse' });
      fireEvent.click(scrim);
      fireEvent.focusIn(document.body);
    };
    // view
    await user.click(getItem('TASMOCK0001').querySelector('.desc')!);
    expect(screen.getByTestId('task-view')).toBeInTheDocument();
    pressOutside();
    expect(screen.getByTestId('task-view')).toBeInTheDocument();
    // edit: typed text survives the press outside
    await user.click(screen.getByTestId('form-edit'));
    await user.type(screen.getByTestId('field-title'), ' (sửa)');
    pressOutside();
    expect(screen.getByTestId('task-form')).toBeInTheDocument();
    expect((screen.getByTestId('field-title') as HTMLInputElement).value).toMatch(/\(sửa\)$/);
    await user.click(screen.getByTestId('form-cancel'));
    expect(screen.getByTestId('task-view')).toBeInTheDocument();
    await user.click(screen.getByTestId('dialog-close'));
    expect(screen.queryByTestId('task-dialog')).toBeNull();
    // create
    await user.click(screen.getByTestId('open-create'));
    await user.type(screen.getByTestId('field-title'), 'Đang nhập dở');
    pressOutside();
    expect(screen.getByTestId('field-title')).toHaveValue('Đang nhập dở');
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('task-dialog')).toBeNull();
  });

  it('locks the page scroll with html.locked on phones only while a popup is open', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (q: string) =>
        ({ matches: q.includes('max-width: 880px'), media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
    );
    const { user } = await renderApp();
    await user.click(screen.getByTestId('open-create'));
    expect(document.documentElement).toHaveClass('locked');
    await user.click(screen.getByTestId('form-cancel'));
    expect(document.documentElement).not.toHaveClass('locked');
  });
});

describe('form layout (compact properties in two rows)', () => {
  it('puts status · priority · deadline on row 1, reporter · assignee · followers on row 2, labels beside the fields', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByTestId('open-create'));
    const form = screen.getByTestId('task-form');
    const props = form.querySelector('.f-props')!;
    // first column: one label per row, aligned; the rest of each row is a line of controls
    const rows = Array.from(props.children);
    expect(rows.map(r => r.className)).toEqual(['f-label', 'f-line', 'f-label', 'f-line f-pair f-trio']);
    expect(rows[3]).toContainElement(screen.getByTestId('field-ccs'));
    expect(screen.getByTestId('field-ccs')).toHaveAccessibleName(/^Người theo dõi/);
    expect(screen.getByTestId('field-ccs')).toHaveTextContent('Mặc định của Workspace');
    expect(rows[0]).toHaveTextContent('Trạng thái');
    expect(rows[2]).toHaveTextContent('Người giao');
    const labels = (row: Element) => Array.from(row.querySelectorAll('.f-label')).map(l => l.textContent);
    expect(labels(rows[1])).toEqual(['Mức ưu tiên', 'Hạn chót']);
    expect(labels(rows[3])).toEqual(['Người được giao', 'Người theo dõi']);
    expect(rows[1]).toContainElement(screen.getByTestId('field-status'));
    expect(rows[1]).toContainElement(screen.getByTestId('field-priority'));
    expect(rows[1]).toContainElement(screen.getByTestId('field-due-time'));
    expect(rows[3]).toContainElement(screen.getByTestId('field-reporter'));
    expect(rows[3]).toContainElement(screen.getByTestId('field-assignee'));
    expect(within(form).getByRole('group', { name: 'Hạn chót' })).toContainElement(screen.getByTestId('field-due-time'));
    expect(screen.getByTestId('field-status')).toHaveAccessibleName('Trạng thái');
    expect(screen.getByTestId('field-reporter')).toHaveAccessibleName(/^Người giao/);
    expect(screen.getByTestId('field-assignee')).toHaveAccessibleName(/^Người được giao/);
    expect(within(form).queryByRole('radiogroup')).toBeNull(); // priority is a select now

    // priority: a select labelled "Mức ưu tiên", options with a coloured flag
    const prio = screen.getByTestId('field-priority');
    expect(prio).toHaveAccessibleName('Mức ưu tiên');
    expect(prio).toHaveAttribute('role', 'combobox');
    expect(prio.querySelector('svg.prio-flag')).toHaveAttribute('data-tone', 'sky');
    fireEvent.click(prio);
    const options = screen.getAllByRole('option');
    expect(options.map(o => o.textContent)).toEqual(['Khẩn cấp', 'Cao', 'Trung bình', 'Thấp']);
    expect(options.map(o => o.querySelector('svg.prio-flag')?.getAttribute('data-tone'))).toEqual(['red', 'orange', 'sky', 'green']);
    expect(screen.getByRole('option', { name: 'Trung bình' })).toHaveAttribute('data-state', 'checked'); // Radix sets aria-selected only on the focused item
    fireEvent.click(screen.getByRole('option', { name: 'Thấp' }));
    expect(prio).toHaveTextContent('Thấp');
    expect(prio.querySelector('svg.prio-flag')).toHaveAttribute('data-tone', 'green');

    // keyboard order follows the rows, left to right
    await screen.findByTestId('field-desc'); // the editor mounts right after the popup's first paint
    const order = ['field-title', 'field-status', 'field-priority', 'field-due-date', 'field-due-time', 'field-reporter', 'field-assignee', 'field-desc'];
    const all = Array.from(form.querySelectorAll<HTMLElement>('[data-testid]')).map(e => e.dataset.testid).filter(t => order.includes(t!));
    expect(all).toEqual(order);
  });

  it('shows "Chưa chọn" when the task has no priority and keeps it empty unless one is picked', async () => {
    const tasks = mockTasks(FIXED_NOW).map(t => (t.id === 'TASMOCK0001' ? { ...t, priority: '' } : t));
    const { user, backend } = await renderApp({ tasks });
    await user.click(getItem('TASMOCK0001').querySelector('.desc')!);
    await user.click(screen.getByTestId('form-edit'));
    const prio = screen.getByTestId('field-priority');
    expect(prio).toHaveTextContent('Chưa chọn');
    expect(prio.querySelector('svg.prio-flag')).toBeNull();
    await user.clear(screen.getByTestId('field-title'));
    await user.type(screen.getByTestId('field-title'), 'Báo cáo quý 3');
    await user.click(screen.getByTestId('form-submit'));
    await waitFor(() => expect(screen.getByTestId('task-view')).toBeInTheDocument());
    expect(lastUpdate(backend)).not.toHaveProperty('priority');
  });

  it('shows validation errors right under their field', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByTestId('open-create'));
    await user.type(screen.getByTestId('field-title'), 'Việc thử');
    await user.click(screen.getByTestId('field-reporter'));
    await user.click((await screen.findAllByTestId('person-option')).find(o => o.dataset.personId === 'PERMOCK00002')!);
    await user.click(screen.getByTestId('field-assignee'));
    await user.click((await screen.findAllByTestId('person-option')).find(o => o.dataset.personId === 'PERMOCK00003')!);
    await user.click(screen.getByTestId('form-submit'));
    const err = screen.getByTestId('field-people-error');
    expect(err.parentElement).toContainElement(screen.getByTestId('field-assignee'));
    expect(err.closest('.f-pair')).not.toBeNull();
  });
});

describe('create (AC10)', () => {
  it('validates title and people, then creates with every required field', async () => {
    const { user, backend } = await renderApp();
    await user.click(screen.getByTestId('open-create'));
    expect(within(dialog()).getByRole('heading', { name: 'Tạo công việc' })).toBeInTheDocument();
    expect(screen.getByTestId('field-title')).toHaveFocus();
    expect(screen.getByTestId('field-due-date')).toHaveTextContent('01/10/2026'); // before 17:00 → today
    expect(screen.getByTestId('field-due-time')).toHaveTextContent('17:00');
    expect(screen.getByTestId('field-priority')).toHaveTextContent('Trung bình');
    expect(screen.getByTestId('field-status')).toHaveTextContent('Mới');
    expect(screen.getByTestId('field-reporter')).toHaveAttribute('data-person-id', ME);
    expect(screen.getByTestId('field-assignee')).toHaveAttribute('data-person-id', ME);

    await user.click(screen.getByTestId('form-submit'));
    expect(screen.getByTestId('field-title-error')).toHaveTextContent('Nhập tên công việc để lưu.');
    expect(screen.getByTestId('field-title')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('field-title')).toHaveFocus();

    await user.type(screen.getByTestId('field-title'), '[[E2E] Lập kế hoạch tuần'); // [[ types a literal [
    expect(screen.queryByTestId('field-title-error')).toBeNull();

    // nobody is me → error
    await user.click(screen.getByTestId('field-reporter'));
    await user.click((await screen.findAllByTestId('person-option')).find(o => o.dataset.personId === 'PERMOCK00002')!);
    await user.click(screen.getByTestId('field-assignee'));
    await user.click((await screen.findAllByTestId('person-option')).find(o => o.dataset.personId === 'PERMOCK00003')!);
    await user.click(screen.getByTestId('form-submit'));
    expect(screen.getByTestId('field-people-error')).toHaveTextContent('Bạn cần là người giao hoặc người được giao');

    // keyboard: open the picker, search without accents, Enter picks
    screen.getByTestId('field-assignee').focus();
    await user.keyboard('{Enter}');
    await user.keyboard('tran minh an');
    expect(screen.getAllByTestId('person-option')).toHaveLength(1);
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('field-assignee')).toHaveAttribute('data-person-id', ME);
    expect(screen.queryByTestId('field-people-error')).toBeNull();

    await typeInDesc('Chuẩn bị cho tuần sau');
    chooseOption(screen.getByTestId('field-priority'), 'Cao');
    await user.click(screen.getByTestId('form-submit'));

    await waitFor(() => expect(screen.queryByTestId('task-dialog')).toBeNull());
    const created = backend.calls.find(c => c.service === '10200')!.body;
    expect(created).toEqual({
      workspace_id: 'WSDEMO0000001',
      object_type: 'OTDEMOTASK001',
      client_time_zone: 'Asia/Saigon',
      data: {
        object_type: 'OTDEMOTASK001',
        workspace_id: 'WSDEMO0000001',
        subject: '[E2E] Lập kế hoạch tuần',
        description: '<p>Chuẩn bị cho tuần sau</p>',
        due_date: Date.UTC(2026, 9, 1, 10, 0),
        priority: 'high',
        status: 'new',
        reporter: 'PERMOCK00002',
        assignee: ME,
      },
    });
    const newId = backend.state.tasks.at(-1)!.id;
    expect(getItem(newId)).toBeDefined();
    expect(inItem(newId).getByTestId('task-title')).toHaveTextContent('[E2E] Lập kế hoạch tuần');
    expect(screen.getByTestId('toast')).toHaveTextContent('Đã tạo “[E2E] Lập kế hoạch tuần”');
    expect(screen.getByTestId('count-open')).toHaveTextContent('11');
    // read back for name/created/lookups
    await user.click(getItem(newId).querySelector('.main')!);
    expect(screen.getByTestId('task-meta')).toHaveTextContent(/^TAS-\d+ · Tạo \d\d:\d\d \d\d\/\d\d · Cập nhật /);
    expect(within(screen.getByTestId('task-view')).getByText('Hoàng Bảo Ngọc')).toBeInTheDocument(); // default follower
  });

  it('creates a task with the followers picked in the form (sent as `ccs`, instead of the Workspace default)', async () => {
    const { user, backend } = await renderApp();
    await user.click(screen.getByTestId('open-create'));
    await user.type(screen.getByTestId('field-title'), '[E2E] Có người theo dõi');
    await user.click(screen.getByTestId('field-ccs'));
    const options = await screen.findAllByTestId('person-option');
    await user.click(options.find(o => o.dataset.personId === 'PERMOCK00003')!);
    await user.click(screen.getAllByTestId('person-option').find(o => o.dataset.personId === 'PERMOCK00004')!);
    await user.keyboard('{Escape}'); // the list closes: the picked people go to the form
    expect(screen.getByTestId('field-ccs')).toHaveAttribute('data-count', '2');
    await user.click(screen.getByTestId('form-submit'));
    await waitFor(() => expect(screen.queryByTestId('task-dialog')).toBeNull());
    const created = backend.calls.find(c => c.service === '10200')!.body;
    expect(created.data.ccs).toEqual(['PERMOCK00003', 'PERMOCK00004']);
    expect(backend.state.tasks.at(-1)!.ccs).toEqual(['PERMOCK00003', 'PERMOCK00004']); // no default follower added
  });

  it('validates the deadline and opens the filters up so the new task is visible', async () => {
    const { user, backend } = await renderApp();
    await user.click(screen.getByTestId('due-filter-tomorrow'));
    await user.type(screen.getByTestId('search'), 'xyz');
    await user.click(screen.getByTestId('quick-done'));
    await user.click(screen.getByTestId('open-create'));
    await user.type(screen.getByTestId('field-title'), 'Việc cần hiện ra');
    // the deadline is picked in the calendar (Vietnamese, week starting on Monday)
    fireEvent.click(screen.getByTestId('field-due-date'));
    const calendar = screen.getByTestId('calendar');
    expect(Array.from(calendar.querySelectorAll('.rdp-weekday')).map(h => h.textContent)).toEqual(['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']);
    expect(within(calendar).getByText('Tháng 10, 2026')).toBeInTheDocument();
    expect(within(calendar).getByRole('button', { name: /^Hôm nay, Thứ Năm, ngày 1 tháng 10 năm 2026, đã chọn$/ })).toHaveFocus();
    fireEvent.click(within(calendar).getByRole('button', { name: /ngày 1 tháng 10 năm 2026/ }));
    await waitFor(() => expect(screen.getByTestId('field-due-date')).toHaveFocus());
    await user.click(screen.getByTestId('form-submit'));
    await waitFor(() => expect(screen.queryByTestId('task-dialog')).toBeNull());
    expect(screen.getByTestId('quick-open')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('due-filter-all')).toBeChecked();
    expect(screen.getByTestId('search')).toHaveValue('');
    expect(getItem(backend.state.tasks.at(-1)!.id)).toBeDefined();
  });

  it('shows the API error inside the form when creating fails', async () => {
    const { user } = await renderApp({}, {
      override: (path, _b, h) => (path === '/api/v1/records' && h['x-req-service'] === '10200' ? jsonResponse({ r: 3, msg: 'Thiếu quyền tạo' }) : undefined),
    });
    await user.click(screen.getByTestId('open-create'));
    await user.type(screen.getByTestId('field-title'), 'Không tạo được');
    await user.click(screen.getByTestId('form-submit'));
    expect(await screen.findByTestId('form-error')).toHaveTextContent('Thiếu quyền tạo');
    expect(screen.getByTestId('form-submit')).toHaveTextContent('Tạo công việc');
  });

  it('falls back to the typed values when the new record cannot be read back', async () => {
    let created = false;
    const { user, backend } = await renderApp({}, {
      override: (path, body, h) => {
        if (path === '/api/v1/records' && h['x-req-service'] === '10200') {
          created = true; // let the backend create it, then fail the read-back
          return undefined;
        }
        if (created && path === '/api/v1/records/list' && body.filters[0].field === 'id') return jsonResponse({ r: 1, msg: 'lỗi đọc' });
        return undefined;
      },
    });
    await user.click(screen.getByTestId('open-create'));
    await user.type(screen.getByTestId('field-title'), 'Việc đọc lại lỗi');
    chooseOption(screen.getByTestId('field-status'), 'Đã xử lý');
    await user.click(screen.getByTestId('form-submit'));
    await waitFor(() => expect(screen.queryByTestId('task-dialog')).toBeNull());
    // the new task is done → the view switches to "Đã xong"
    expect(screen.getByTestId('quick-done')).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText('Việc đọc lại lỗi')).toBeInTheDocument();
    expect(getItem(backend.state.tasks.at(-1)!.id).dataset.status).toBe('resolved');
    expect(screen.getByTestId('count-done')).toHaveTextContent('131');
    expect(Date.now()).toBe(FIXED_NOW);
  });

  it('retries loading the personnel list after an error', async () => {
    let failPeople = true;
    const { user } = await renderApp({}, {
      override: (path, body) =>
        failPeople && path === '/api/v1/records/list' && body.object_slug === 'personnel' && body.filters[0].field === 'status'
          ? jsonResponse({ r: 5, msg: 'down' })
          : undefined,
    });
    await user.click(screen.getByTestId('open-create'));
    await user.click(screen.getByTestId('field-reporter'));
    expect(await screen.findByText(/Không tải được danh sách nhân sự/)).toBeInTheDocument();
    failPeople = false;
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(screen.getAllByTestId('person-option').length).toBe(11));
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}{End}{Home}');
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('task-form')).toBeInTheDocument();
  });
});

describe('file attachments (attachment_files)', () => {
  const pickFiles = (files: File[]) => fireEvent.change(screen.getByTestId('attach-input'), { target: { files } });
  const chips = () => screen.queryAllByTestId('attach-chip');

  it('shows a "Đính kèm" row of download links under the people, only when the task has files', async () => {
    const { user } = await renderApp();
    await user.click(getItem('TASMOCK0003').querySelector('.desc')!);
    const rows = Array.from(screen.getByTestId('task-view').querySelectorAll('.f-props > .v-row')) as HTMLElement[];
    expect(rows.map(r => r.dataset.group)).toEqual(['task', 'people', 'files']);
    expect(rows[2].querySelector('.f-label')).toHaveTextContent('Đính kèm');
    const links = within(rows[2]).getAllByTestId('attachment-link');
    expect(links.map(a => a.getAttribute('href'))).toEqual([
      '/files/FILSEED0001/original/quy-trinh-nhap-kho-hien-hanh.pdf?redirect=true',
      '/files/FILSEED0002/original/so-lieu-thang-9.xlsx?redirect=true',
    ]);
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer');
    expect(links[0]).toHaveAttribute('download', 'quy-trinh-nhap-kho-hien-hanh.pdf');
    await user.keyboard('{Escape}');
    await user.click(getItem('TASMOCK0001').querySelector('.desc')!);
    expect(screen.getByTestId('task-view').querySelector('[data-group="files"]')).toBeNull();
  });

  it('uploads picked files at once and creates the task with them', async () => {
    const { user, backend } = await renderApp();
    await user.click(screen.getByTestId('open-create'));
    await user.type(screen.getByTestId('field-title'), 'Có file đính kèm');
    expect(screen.getByTestId('attach-button')).toHaveTextContent('Đính kèm');
    // the button sits in the footer, left of Huỷ / Tạo công việc
    const foot = dialog().querySelector('.sheet-foot')!;
    expect(Array.from(foot.querySelectorAll('[data-testid]')).map(e => (e as HTMLElement).dataset.testid)).toEqual([
      'attach-button',
      'attach-input',
      'form-cancel',
      'form-submit',
    ]);
    pickFiles([new File(['nội dung'], 'Biên bản.docx', { type: 'application/msword' })]);
    await waitFor(() => expect(chips().map(c => c.dataset.state)).toEqual(['done']));
    expect(foot.querySelector('.foot-files')).toContainElement(chips()[0]);
    await user.click(screen.getByTestId('form-submit'));
    await waitFor(() => expect(screen.queryByTestId('task-dialog')).toBeNull());
    const created = backend.calls.find(c => c.service === '10200')!.body.data;
    expect(created.attachment_files).toEqual([expect.objectContaining({ file_id: 'FILMOCK0001', fileName: 'Biên bản.docx', acl: 'private' })]);
    const upload = backend.calls.find(c => c.path === '/api/v1/file/upload/v2/client_upload')!;
    expect(upload.service).toBeUndefined();
    expect(upload.headers['x-req-type']).toBeUndefined();
  });

  it('keeps Lưu disabled ("Đang tải file…") while a file is still uploading', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>(r => (release = r));
    const { user } = await renderApp({}, { override: async path => (path.endsWith('/client_upload') ? (await gate, undefined) : undefined) });
    await user.click(getItem('TASMOCK0005').querySelector('.main')!);
    await user.click(screen.getByTestId('form-edit'));
    pickFiles([new File(['x'], 'cham.pdf')]);
    expect(chips()[0]).toHaveAttribute('data-state', 'uploading');
    expect(screen.getByTestId('form-submit')).toBeDisabled();
    expect(screen.getByTestId('form-submit')).toHaveTextContent('Đang tải file…');
    release();
    await waitFor(() => expect(screen.getByTestId('form-submit')).toBeEnabled());
    expect(screen.getByTestId('form-submit')).toHaveTextContent('Lưu');
  });

  it('sends the whole list when files change, null when all are removed, nothing when untouched', async () => {
    const { user, backend } = await renderApp();
    const open = async () => {
      await user.click(getItem('TASMOCK0003').querySelector('.desc')!);
      await user.click(screen.getByTestId('form-edit'));
    };
    // untouched
    await open();
    expect(chips().map(c => c.dataset.state)).toEqual(['done', 'done']);
    await user.type(screen.getByTestId('field-title'), '!');
    await user.click(screen.getByTestId('form-submit'));
    await waitFor(() => expect(lastUpdate(backend)).toBeDefined());
    expect(lastUpdate(backend)).not.toHaveProperty('attachment_files');
    // remove the PDF, add a picture → the whole new list
    await user.click(screen.getByTestId('form-edit'));
    await user.click(screen.getByRole('button', { name: 'Bỏ “quy-trinh-nhap-kho-hien-hanh.pdf”' }));
    pickFiles([new File(['png'], 'so-do.png', { type: 'image/png' })]);
    await waitFor(() => expect(chips().map(c => c.dataset.state)).toEqual(['done', 'done']));
    await user.click(screen.getByTestId('form-submit'));
    await waitFor(() => expect(screen.getByTestId('task-view')).toBeInTheDocument());
    expect(lastUpdate(backend).attachment_files).toEqual([
      expect.objectContaining({ file_id: 'FILSEED0002', fileName: 'so-lieu-thang-9.xlsx' }),
      expect.objectContaining({ file_id: 'FILMOCK0001', fileName: 'so-do.png' }),
    ]);
    expect(screen.getAllByTestId('attachment-link').map(a => a.textContent)).toEqual(['so-lieu-thang-9.xlsx1,5 MB', 'so-do.png3 B']);
    // remove everything → null
    await user.click(screen.getByTestId('form-edit'));
    for (const name of ['so-lieu-thang-9.xlsx', 'so-do.png']) await user.click(screen.getByRole('button', { name: `Bỏ “${name}”` }));
    await user.click(screen.getByTestId('form-submit'));
    await waitFor(() => expect(screen.getByTestId('task-view')).toBeInTheDocument());
    expect(lastUpdate(backend).attachment_files).toBeNull();
    expect(taskOnServer(backend, 'TASMOCK0003').attachment_files).toBeNull();
    expect(screen.getByTestId('task-view').querySelector('[data-group="files"]')).toBeNull();
  });

  it('spells out why a file was refused and will not save while it is still listed', async () => {
    const { user, backend } = await renderApp();
    await user.click(screen.getByTestId('open-create'));
    await user.type(screen.getByTestId('field-title'), 'File không hợp lệ');
    pickFiles([new File(['x'], 'cai-dat.exe'), new File(['ok'], 'Biên bản.pdf', { type: 'application/pdf' })]);
    await waitFor(() => expect(chips().map(c => c.dataset.state)).toEqual(['error', 'done']));
    expect(screen.getByTestId('attach-error')).toHaveTextContent('cai-dat.exe: Không nhận loại file .exe');
    await user.click(screen.getByTestId('form-submit'));
    expect(screen.getByTestId('form-error')).toHaveTextContent('Còn 1 file chưa tải lên được. Bỏ file lỗi (bấm ×) rồi lưu lại.');
    expect(screen.getByRole('button', { name: 'Bỏ “cai-dat.exe”' })).toHaveFocus();
    expect(backend.calls.some(c => c.service === '10200')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Bỏ “cai-dat.exe”' }));
    expect(screen.queryByTestId('form-error')).toBeNull();
    expect(screen.queryByTestId('attach-errors')).toBeNull();
    await user.click(screen.getByTestId('form-submit'));
    await waitFor(() => expect(screen.queryByTestId('task-dialog')).toBeNull());
    const created = backend.calls.find(c => c.service === '10200')!.body.data;
    expect(created.attachment_files).toEqual([expect.objectContaining({ fileName: 'Biên bản.pdf' })]);
  });

  it('attaches files dropped anywhere on the popup', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByTestId('open-create'));
    const files = [new File(['a'], 'keo-tha.pdf', { type: 'application/pdf' })];
    const transfer = { types: ['Files'], files, dropEffect: 'none' };
    fireEvent.dragOver(screen.getByTestId('field-title'), { dataTransfer: transfer });
    expect(dialog()).toHaveClass('drop-target');
    fireEvent.drop(screen.getByTestId('field-title'), { dataTransfer: transfer });
    expect(dialog()).not.toHaveClass('drop-target');
    await waitFor(() => expect(chips().map(c => c.textContent)).toEqual(['keo-tha.pdf1 B']));
    // dragging text (not files) is left alone
    fireEvent.dragOver(screen.getByTestId('field-title'), { dataTransfer: { types: ['text/plain'], files: [] } });
    expect(dialog()).not.toHaveClass('drop-target');
  });
});

describe('pictures pasted into the description → `_attachments` (like Cogover’s editor)', () => {
  const PNG = `data:image/png;base64,${btoa('\x89PNG\r\n\x1a\nfake')}`;
  const paste = async (html: string) => {
    const editor = await descEditor();
    const transfer = { types: ['text/html'], getData: (t: string) => (t === 'text/html' ? html : ''), files: [], items: [] } as unknown as DataTransfer;
    act(() => {
      editor.tf.select(editor.api.end([]));
      editor.tf.insertData(transfer);
    });
  };
  const uploads = (backend: { calls: { path: string; body: any }[] }) => backend.calls.filter(c => c.path === '/api/v1/file/upload/v2/client_upload');

  it('creates the task with the uploaded picture in the description and its FILE_METADATA in `_attachments`', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>(r => (release = r));
    const { user, backend } = await renderApp({}, { override: async path => (path.endsWith('/client_upload') ? (await gate, undefined) : undefined) });
    await user.click(screen.getByTestId('open-create'));
    await user.type(screen.getByTestId('field-title'), 'Có ảnh trong mô tả');
    await paste(`<p>Sơ đồ: <img src="${PNG}"></p>`);
    // saving waits for the picture
    await waitFor(() => expect(screen.getByTestId('form-submit')).toBeDisabled());
    expect(screen.getByTestId('form-submit')).toHaveTextContent('Đang tải ảnh…');
    expect(screen.getByTestId('desc-images-status')).toHaveTextContent('Đang tải 1 ảnh lên…');
    release();
    await waitFor(() => expect(screen.getByTestId('form-submit')).toBeEnabled());
    expect(screen.queryByTestId('desc-images-status')).toBeNull();
    const up = uploads(backend).at(-1)!;
    expect(up.body).toMatchObject({ field_id: 'OFDEMOTASKIMG', object_id: 'OTDEMOTASK001' });
    await user.click(screen.getByTestId('form-submit'));
    await waitFor(() => expect(screen.queryByTestId('task-dialog')).toBeNull());
    const created = backend.calls.find(c => c.service === '10200')!.body.data;
    const fileId = created._attachments[0].file_id;
    expect(created._attachments).toEqual([
      expect.objectContaining({ file_id: fileId, acl: 'public', url: `${window.location.origin}/files/0/${fileId}/%7Bresolution_size%7D/anh-mo-ta.png?redirect=true&long_text_field_id=OFDEMOTASKDSC` }),
    ]);
    expect(created.description).toBe(
      `<p>Sơ đồ: <img src="${window.location.origin}/files/0/${fileId}/original/anh-mo-ta.png?redirect=true&amp;long_text_field_id=OFDEMOTASKDSC"></p>`,
    );
  });

  it('sends no `_attachments` without new pictures, and on edit adds the new picture to the task’s own list', async () => {
    const { user, backend } = await renderApp();
    // a task that already has a picture in `_attachments`
    const old = { file_id: 'OLDIMG', fileName: 'cu.png', url: 'https://w.test/files/0/OLDIMG/%7Bresolution_size%7D/cu.png?redirect=true&long_text_field_id=OFDEMOTASKDSC' };
    taskOnServer(backend, 'TASMOCK0001')._attachments = [JSON.stringify(old)];
    await user.click(screen.getByTestId('open-create'));
    await user.type(screen.getByTestId('field-title'), 'Không ảnh');
    await user.click(screen.getByTestId('form-submit'));
    await waitFor(() => expect(screen.queryByTestId('task-dialog')).toBeNull());
    expect(backend.calls.find(c => c.service === '10200')!.body.data).not.toHaveProperty('_attachments');

    await user.click(getItem('TASMOCK0001').querySelector('.desc')!);
    await user.click(screen.getByTestId('form-edit'));
    await paste(`<p><img src="${PNG}"></p>`);
    await waitFor(() => expect(uploads(backend)).toHaveLength(1));
    await waitFor(() => expect(screen.getByTestId('form-submit')).toBeEnabled());
    await user.click(screen.getByTestId('form-submit'));
    await waitFor(() => expect(lastUpdate(backend)).toBeDefined());
    const sent = lastUpdate(backend);
    expect(sent._attachments.map((m: { file_id: string }) => m.file_id)).toEqual(['OLDIMG', expect.stringMatching(/^FILIMG/)]);
    expect(sent.description).toContain('/files/0/FILIMG');
  });

  it('a picture removed before saving is not sent; a failed upload is explained under the editor', async () => {
    const { user, backend } = await renderApp({}, {
      override: (path, body) => (path.endsWith('/client_upload') && body.file?.name === 'anh-mo-ta.gif' ? jsonResponse({ r: 15, msg: 'file type not allowed' }, 400) : undefined),
    });
    await user.click(screen.getByTestId('open-create'));
    await user.type(screen.getByTestId('field-title'), 'Ảnh bị từ chối');
    await paste(`<p>X<img src="data:image/gif;base64,${btoa('GIF89a')}"></p>`);
    await waitFor(() => expect(screen.getByTestId('desc-images-error')).toHaveTextContent('Không tải được ảnh dán vào: Không nhận loại file .gif'));
    expect(await descHtml()).toBe('<p>X</p>');
    // upload one, then delete it from the text before saving
    await paste(`<p><img src="${PNG}"></p>`);
    await waitFor(() => expect(screen.getByTestId('form-submit')).toBeEnabled());
    await waitFor(async () => expect(await descHtml()).toContain('/files/0/'));
    await setDescLines(['Không còn ảnh']);
    await user.click(screen.getByTestId('form-submit'));
    await waitFor(() => expect(screen.queryByTestId('task-dialog')).toBeNull());
    expect(backend.calls.find(c => c.service === '10200')!.body.data).not.toHaveProperty('_attachments');
  });
});
