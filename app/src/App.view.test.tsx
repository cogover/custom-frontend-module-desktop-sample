import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { chooseOption, getItem, inItem, pickDate, renderApp, taskOnServer } from './test/app';
import { editorFor } from './rte/RichTextEditor';
import { jsonResponse } from './test/fixtures';

const lastUpdate = (backend: { calls: { service?: string; body: any }[] }) => backend.calls.filter(c => c.service === '10201').at(-1)?.body.data;
const updates = (backend: { calls: { service?: string }[] }) => backend.calls.filter(c => c.service === '10201').length;
const toast = () => screen.getByTestId('toast');

async function openView(user: { click: (el: Element) => Promise<void> }, id: string) {
  await user.click(getItem(id).querySelector('.desc, .main')!);
  return within(screen.getByTestId('task-view'));
}

describe('quick edit in the detail view (CONTRACT §5.3d)', () => {
  it('saves priority, deadline, reporter and assignee at once, one field per request, and updates the card', async () => {
    const { user, backend } = await renderApp();
    const view = await openView(user, 'TASMOCK0001');
    chooseOption(view.getByTestId('view-priority'), 'Khẩn cấp');
    await waitFor(() => expect(lastUpdate(backend)).toMatchObject({ id: 'TASMOCK0001', priority: 'urgent' }));
    expect(Object.keys(lastUpdate(backend)).filter(k => !['id', 'object_type', 'workspace_id'].includes(k))).toEqual(['priority']);
    expect(toast()).toHaveTextContent('Đã lưu');
    expect(inItem('TASMOCK0001').getByTestId('task-priority')).toHaveTextContent('Khẩn cấp');

    chooseOption(view.getByTestId('view-due-time'), '09:30');
    await waitFor(() => expect(lastUpdate(backend)).toHaveProperty('due_date'));
    expect(screen.getByTestId('view-due-time')).toHaveTextContent('09:30');
    pickDate('view-due-date', '2026-10-15');
    await waitFor(() => expect(screen.getByTestId('view-due-date')).toHaveTextContent('15/10/2026'));
    expect(taskOnServer(backend, 'TASMOCK0001').due_date).toBe(Date.UTC(2026, 9, 15, 2, 30)); // 09:30 in Vietnam

    await user.click(view.getByTestId('view-reporter'));
    await user.click((await screen.findAllByTestId('person-option')).find(o => o.dataset.personId === 'PERMOCK00003')!);
    await waitFor(() => expect(lastUpdate(backend)).toMatchObject({ reporter: 'PERMOCK00003' }));
    expect(screen.getByTestId('view-reporter')).toHaveAttribute('data-person-id', 'PERMOCK00003');
  });

  it('changes the status through the card’s flow, and keeps me as reporter or assignee', async () => {
    const { user, backend } = await renderApp();
    const view = await openView(user, 'TASMOCK0001'); // reporter: Lan, assignee: me
    chooseOption(view.getByTestId('view-status'), 'Đang chờ');
    await waitFor(() => expect(lastUpdate(backend)).toMatchObject({ status: 'pending' }));
    expect(inItem('TASMOCK0001').getByTestId('task-status')).toHaveTextContent('Đang chờ');
    expect(toast()).toHaveTextContent('Đã lưu'); // open → open: no Hoàn tác flow, but the quick-edit confirmation
  });

  it('refuses giving away the reporter role of a task assigned to someone else (I would be neither)', async () => {
    const { user, backend } = await renderApp();
    const view = await openView(user, 'TASMOCK0002'); // reporter: me, assignee: PERMOCK00003
    await user.click(view.getByTestId('view-reporter'));
    await user.click((await screen.findAllByTestId('person-option')).find(o => o.dataset.personId === 'PERMOCK00004')!);
    expect(toast()).toHaveTextContent('Bạn cần là người giao hoặc người được giao');
    expect(updates(backend)).toBe(0);
    expect(screen.queryByTestId('confirm-follow')).toBeNull();
    expect(screen.getByTestId('view-reporter')).toHaveAttribute('data-person-id', 'PERMOCKME0001');
  });

  it('edits followers in one save when the list closes; none left → null', async () => {
    const { user, backend } = await renderApp();
    const view = await openView(user, 'TASMOCK0001');
    const picker = view.getByTestId('view-ccs');
    expect(picker).toHaveTextContent('Không có');
    await user.click(picker);
    const opts = await screen.findAllByTestId('person-option');
    await user.click(opts.find(o => o.dataset.personId === 'PERMOCK00002')!);
    await user.click(opts.find(o => o.dataset.personId === 'PERMOCK00003')!);
    expect(opts.find(o => o.dataset.personId === 'PERMOCK00002')).toHaveAttribute('data-checked', 'true');
    expect(updates(backend)).toBe(0); // nothing saved while the list is open
    await user.keyboard('{Escape}');
    await waitFor(() => expect(lastUpdate(backend)).toMatchObject({ ccs: ['PERMOCK00002', 'PERMOCK00003'] }));
    expect(screen.getByTestId('task-dialog')).toBeInTheDocument(); // Esc closed only the list
    expect(screen.getByTestId('view-ccs')).toHaveAttribute('data-count', '2');
    // untick both
    await user.click(screen.getByTestId('view-ccs'));
    for (const id of ['PERMOCK00002', 'PERMOCK00003']) await user.click((await screen.findAllByTestId('person-option')).find(o => o.dataset.personId === id)!);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(lastUpdate(backend)).toMatchObject({ ccs: null }));
    // reopening and closing without changes sends nothing
    const n = updates(backend);
    await user.click(screen.getByTestId('view-ccs'));
    await user.keyboard('{Escape}');
    expect(updates(backend)).toBe(n);
  });

  it('puts the old value back when the save fails', async () => {
    const { user } = await renderApp({}, { override: (path, body) => (path === '/api/v1/records' && body.data?.priority ? jsonResponse({ r: 2, msg: 'Lỗi lưu' }) : undefined) });
    const view = await openView(user, 'TASMOCK0001');
    chooseOption(view.getByTestId('view-priority'), 'Thấp');
    await waitFor(() => expect(toast()).toHaveTextContent('Không lưu được “Chuẩn bị báo cáo doanh thu quý 3”: Lỗi lưu'));
    expect(screen.getByTestId('view-priority')).toHaveTextContent('Cao');
  });
});

describe('activities under the description (CONTRACT §5.3c)', () => {
  it('shows the task’s timeline: author, kind, subject, time, safe content with pictures, files', async () => {
    const { user } = await renderApp();
    await openView(user, 'TASMOCK0001');
    const panel = within(await screen.findByTestId('activities'));
    await waitFor(() => expect(panel.getAllByTestId('activity-item')).toHaveLength(3));
    expect(panel.getByRole('heading', { name: 'Hoạt động · 3' })).toBeInTheDocument();
    const [first, second, third] = panel.getAllByTestId('activity-item');
    expect(first).toHaveAttribute('data-type', 'note');
    expect(first.querySelector('.act-head')).toHaveTextContent(/^Nguyễn Thị LanGhi chúBáo cáo tiến độ/);
    expect(first.querySelector('.act-content img')).toHaveAttribute('src', '/__mock/image.svg?size=original');
    expect(second.querySelector('.act-subject')).toBeNull(); // no subject
    expect(second.querySelector('.act-content')!.innerHTML).not.toContain('script');
    expect(third).toHaveAttribute('data-type', 'task');
    expect(third.querySelector('.act-type')).toHaveTextContent('Công việc');
    expect(within(third).getByTestId('attachment-link')).toHaveTextContent('tai-lieu.pdf');
    expect(first.querySelector('time')).toHaveAttribute('title', expect.stringMatching(/tháng/));
  });

  it('loads 15 at a time with "Xem thêm", says when there is nothing, and retries after an error', async () => {
    let fail = true;
    const { user } = await renderApp({}, {
      override: (path, body) => (path === '/api/v1/records/list' && body.object_slug === 'activity' && body.filters[0].params === 'TASMOCK0005' && fail ? jsonResponse({ r: 500, msg: 'Hỏng' }) : undefined),
    });
    await openView(user, 'TASMOCK0003');
    await waitFor(() => expect(screen.getAllByTestId('activity-item')).toHaveLength(15));
    await user.click(screen.getByTestId('activities-more'));
    await waitFor(() => expect(screen.getAllByTestId('activity-item')).toHaveLength(18));
    expect(screen.queryByTestId('activities-more')).toBeNull();
    await user.click(screen.getByTestId('dialog-close'));
    await openView(user, 'TASMOCK0002');
    expect(await screen.findByTestId('activities-empty')).toHaveTextContent('Chưa có hoạt động nào');
    await user.click(screen.getByTestId('dialog-close'));
    await openView(user, 'TASMOCK0005');
    expect(await screen.findByTestId('activities-error')).toHaveTextContent('Không tải được hoạt động: Hỏng');
    fail = false;
    await user.click(screen.getByTestId('activities-retry'));
    expect(await screen.findByTestId('activities-empty')).toBeInTheDocument();
  });

  it('adds a note (content only, focused at once, required; pasted picture → the note’s `_attachments`) at the top', async () => {
    const { user, backend } = await renderApp();
    await openView(user, 'TASMOCK0002');
    await screen.findByTestId('activities-empty');
    await user.click(screen.getByTestId('activity-add'));
    const box = await screen.findByTestId('activity-content-editor');
    // no subject field; the caret is already in the content
    expect(screen.queryByTestId('activity-subject')).toBeNull();
    expect(screen.getByTestId('activity-composer').querySelectorAll('input')).toHaveLength(0);
    await waitFor(() => expect(box).toHaveFocus());
    await user.click(screen.getByTestId('activity-submit'));
    expect(screen.getByTestId('activity-error')).toHaveTextContent('Nhập nội dung ghi chú');
    expect(backend.calls.some(c => c.service === '10200')).toBe(false);
    const editor = editorFor(box)!;
    const png = `data:image/png;base64,${btoa('\x89PNG\r\n\x1a\nfake')}`;
    const transfer = { types: ['text/html'], getData: (t: string) => (t === 'text/html' ? `<p>Đã chốt <strong>giá</strong></p><p><img src="${png}"></p>` : ''), files: [], items: [] } as unknown as DataTransfer;
    act(() => {
      editor.tf.select(editor.api.end([]));
      editor.tf.insertData(transfer);
    });
    await waitFor(() => expect(backend.calls.some(c => c.path === '/api/v1/file/upload/v2/client_upload')).toBe(true));
    const up = backend.calls.find(c => c.path === '/api/v1/file/upload/v2/client_upload')!;
    expect(up.body).toMatchObject({ field_id: 'OFDEMOACTIMG1', object_id: 'OTDEMOACTIV01' });
    await waitFor(() => expect(screen.getByTestId('activity-submit')).toHaveTextContent('Lưu ghi chú'));
    await user.click(screen.getByTestId('activity-submit'));
    await waitFor(() => expect(screen.queryByTestId('activity-composer')).toBeNull());
    const sent = backend.calls.find(c => c.service === '10200')!.body;
    expect(sent.object_type).toBe('OTDEMOACTIV01');
    expect(sent.data).toMatchObject({ activity_type: 'note', name: '', Task: 'TASMOCK0002', manual_log: 1 });
    expect(sent.data.content).toMatch(/^<p>Đã chốt <strong>giá<\/strong><\/p><p><img src="[^"]+\/files\/0\/FILIMG\d+\/original\/anh-mo-ta\.png\?redirect=true&amp;long_text_field_id=OFDEMOACTCONT"><\/p>$/);
    expect(sent.data._attachments).toEqual([expect.objectContaining({ url: expect.stringContaining('long_text_field_id=OFDEMOACTCONT') })]);
    const first = screen.getAllByTestId('activity-item')[0];
    expect(first.querySelector('.act-head')).toHaveTextContent(/^Trần Minh AnGhi chú\d{2}:\d{2}/);
    expect(first.querySelector('.act-subject')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Hoạt động · 1' })).toBeInTheDocument();
    expect(screen.getByTestId('toast')).toHaveTextContent('Đã thêm ghi chú');
  });

  it('keeps the composer with the server message when saving fails; a follow-only task can take notes too', async () => {
    const { user } = await renderApp({}, { override: (path, body) => (path === '/api/v1/records' && body.object_type === 'OTDEMOACTIV01' ? jsonResponse({ r: 3, msg: 'Không có quyền' }) : undefined) });
    await openView(user, 'TASMOCK0006'); // follow-only
    await user.click(await screen.findByTestId('activity-add'));
    const editor = editorFor(await screen.findByTestId('activity-content-editor'))!;
    act(() => {
      editor.tf.select(editor.api.end([]));
      editor.tf.insertText('Ghi chú của người theo dõi');
    });
    await user.click(screen.getByTestId('activity-submit'));
    expect(await screen.findByTestId('activity-error')).toHaveTextContent('Không có quyền');
    expect(screen.getByTestId('activity-composer')).toBeInTheDocument();
    await user.click(screen.getByTestId('activity-cancel'));
    expect(screen.queryByTestId('activity-composer')).toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
  });
});

describe('editing and deleting my notes (CONTRACT §5.3c)', () => {
  const item = (id: string) => screen.getAllByTestId('activity-item').find(li => li.dataset.activityId === id)!;

  it('offers Sửa / Xoá on my own notes only; editing saves the content with 10201 and shows it', async () => {
    const { user, backend } = await renderApp();
    await openView(user, 'TASMOCK0003');
    await waitFor(() => expect(screen.getAllByTestId('activity-item')).toHaveLength(15));
    expect(within(item('ACTPAGE0002')).queryByTestId('activity-edit')).toBeNull(); // Lan's
    expect(within(item('ACTPAGE0002')).queryByTestId('activity-delete')).toBeNull();
    // unchanged: closes without a request
    await user.click(within(item('ACTPAGE0001')).getByTestId('activity-edit'));
    await user.click(await screen.findByTestId('activity-edit-submit'));
    expect(screen.queryByTestId('activity-edit-composer')).toBeNull();
    expect(updates(backend)).toBe(0);

    await user.click(within(item('ACTPAGE0001')).getByTestId('activity-edit'));
    const box = await screen.findByTestId('activity-edit-content-editor');
    expect(box).toHaveTextContent('Ghi chú số 1');
    expect(screen.queryByTestId('activity-composer')).toBeNull(); // the "Thêm ghi chú" box stays closed
    const editor = editorFor(box)!;
    act(() => {
      editor.tf.select(editor.api.end([]));
      editor.tf.insertText(' (đã sửa)');
    });
    await user.click(screen.getByTestId('activity-edit-submit'));
    await waitFor(() => expect(screen.queryByTestId('activity-edit-composer')).toBeNull());
    const sent = backend.calls.filter(c => c.service === '10201').at(-1)!.body;
    expect(sent.object_type).toBe('OTDEMOACTIV01');
    expect(sent.data).toEqual({ object_type: 'OTDEMOACTIV01', workspace_id: expect.any(String), id: 'ACTPAGE0001', content: '<p>Ghi chú số 1 (đã sửa)</p>' });
    expect(within(item('ACTPAGE0001')).getByTestId('activity-content')).toHaveTextContent('Ghi chú số 1 (đã sửa)');
    expect(toast()).toHaveTextContent('Đã sửa ghi chú');
  });

  it('deletes my note after "Xoá ghi chú?" (218 on activity); "Huỷ" keeps it; a refusal is told', async () => {
    let refuse = false;
    const { user, backend } = await renderApp({}, {
      override: (path, body) => (path === '/api/v1/records/delete' && refuse ? jsonResponse({ r: 0, data: { deleted: [], not_deleted: body.ids } }) : undefined),
    });
    await openView(user, 'TASMOCK0003');
    await waitFor(() => expect(screen.getAllByTestId('activity-item')).toHaveLength(15));
    await user.click(within(item('ACTPAGE0003')).getByTestId('activity-delete'));
    expect(await screen.findByTestId('confirm-note-delete')).toHaveTextContent('Xoá ghi chú?');
    await user.click(screen.getByTestId('confirm-note-delete-cancel'));
    expect(screen.queryByTestId('confirm-note-delete')).toBeNull();
    expect(backend.calls.some(c => c.service === '218')).toBe(false);
    expect(screen.getByTestId('task-dialog')).toBeInTheDocument();

    await user.click(within(item('ACTPAGE0003')).getByTestId('activity-delete'));
    await user.click(await screen.findByTestId('confirm-note-delete-ok'));
    await waitFor(() => expect(screen.getAllByTestId('activity-item').some(li => li.dataset.activityId === 'ACTPAGE0003')).toBe(false));
    expect(backend.calls.find(c => c.service === '218')!.body).toMatchObject({ object_type: 'OTDEMOACTIV01', ids: ['ACTPAGE0003'] });
    expect(screen.getByRole('heading', { name: 'Hoạt động · 17' })).toBeInTheDocument();
    expect(toast()).toHaveTextContent('Đã xoá ghi chú');

    refuse = true;
    await user.click(within(item('ACTPAGE0005')).getByTestId('activity-delete'));
    await user.click(await screen.findByTestId('confirm-note-delete-ok'));
    await waitFor(() => expect(toast()).toHaveTextContent('Không xoá được ghi chú'));
    expect(item('ACTPAGE0005')).toBeInTheDocument();
  });
});

describe('handing a task over (CONTRACT §5.3g)', () => {
  const pickAssignee = async (user: { click: (el: Element) => Promise<void> }, id: string) => {
    await user.click(screen.getByTestId('view-assignee'));
    await user.click((await screen.findAllByTestId('person-option')).find(o => o.dataset.personId === id)!);
  };

  it('asks whether I keep following a task I hand over; Esc keeps it mine, "Thêm vào theo dõi" saves me in ccs', async () => {
    const { user, backend } = await renderApp();
    await openView(user, 'TASMOCK0001'); // reporter: Lan, assignee: me
    await pickAssignee(user, 'PERMOCK00004');
    const box = await screen.findByTestId('confirm-follow');
    expect(box).toHaveTextContent('Thêm vào người theo dõi?');
    expect(box).toHaveTextContent('Bạn giao “Chuẩn bị báo cáo doanh thu quý 3” cho');
    expect(box).toHaveTextContent('Nếu không, công việc sẽ không còn trong danh sách của bạn.');
    await waitFor(() => expect(screen.getByTestId('confirm-follow-yes')).toHaveFocus());
    expect(updates(backend)).toBe(0); // nothing saved while asking

    await user.keyboard('{Escape}'); // keeps the old assignee
    expect(screen.queryByTestId('confirm-follow')).toBeNull();
    expect(screen.getByTestId('task-dialog')).toBeInTheDocument(); // Esc closed only the question
    expect(updates(backend)).toBe(0);
    expect(screen.getByTestId('view-assignee')).toHaveAttribute('data-person-id', 'PERMOCKME0001');

    await pickAssignee(user, 'PERMOCK00004');
    await user.click(await screen.findByTestId('confirm-follow-yes'));
    await waitFor(() => expect(lastUpdate(backend)).toMatchObject({ assignee: 'PERMOCK00004', ccs: ['PERMOCKME0001'] }));
    expect(updates(backend)).toBe(1); // one request with both fields
    expect(toast()).toHaveTextContent('Đã lưu');
    expect(getItem('TASMOCK0001')).toBeInTheDocument(); // still in my list: I follow it
    expect(screen.queryByTestId('view-assignee')).toBeNull(); // a follower only reads it
  });

  it('"Không" hands it over only: the task leaves my list, the popup shows it read-only', async () => {
    const { user, backend } = await renderApp();
    await openView(user, 'TASMOCK0001');
    await pickAssignee(user, 'PERMOCK00004');
    await user.click(await screen.findByTestId('confirm-follow-no'));
    await waitFor(() => expect(lastUpdate(backend)).toMatchObject({ assignee: 'PERMOCK00004' }));
    expect(lastUpdate(backend)).not.toHaveProperty('ccs');
    expect(toast()).toHaveTextContent('Đã giao “Chuẩn bị báo cáo doanh thu quý 3”. Việc này không còn trong danh sách của bạn.');
    await waitFor(() => expect(screen.queryAllByTestId('task-item').map(el => el.dataset.taskId)).not.toContain('TASMOCK0001'));
    expect(screen.queryByTestId('view-assignee')).toBeNull(); // no quick edit any more
  });

  it('as the reporter, asks whether the replaced assignee keeps following', async () => {
    const { user, backend } = await renderApp();
    await openView(user, 'TASMOCK0002'); // reporter: me, assignee: PERMOCK00003
    await pickAssignee(user, 'PERMOCK00004');
    const box = await screen.findByTestId('confirm-follow');
    expect(box).toHaveTextContent('được giao lại cho');
    expect(box).toHaveTextContent('(người được giao trước) vào người theo dõi?');
    expect(box).not.toHaveTextContent('không còn trong danh sách');
    await user.click(screen.getByTestId('confirm-follow-yes'));
    await waitFor(() => expect(lastUpdate(backend)).toMatchObject({ assignee: 'PERMOCK00004', ccs: ['PERMOCK00003'] }));
  });

  it('does not ask when the replaced assignee stays the reporter', async () => {
    const { user, backend } = await renderApp();
    await openView(user, 'TASMOCK0005'); // reporter and assignee: me
    await pickAssignee(user, 'PERMOCK00004');
    await waitFor(() => expect(lastUpdate(backend)).toMatchObject({ assignee: 'PERMOCK00004' }));
    expect(screen.queryByTestId('confirm-follow')).toBeNull();
    expect(lastUpdate(backend)).not.toHaveProperty('ccs');
    expect(toast()).toHaveTextContent('Đã lưu');
  });

  it('asks from the edit form too: "Huỷ" stays in the form, "Thêm vào theo dõi" saves ccs with the rest', async () => {
    const { user, backend } = await renderApp();
    await openView(user, 'TASMOCK0001');
    await user.click(screen.getByTestId('form-edit'));
    const form = within(await screen.findByTestId('task-form'));
    await user.click(form.getByTestId('field-assignee'));
    await user.click((await screen.findAllByTestId('person-option')).find(o => o.dataset.personId === 'PERMOCK00004')!);
    await user.click(screen.getByTestId('form-submit'));
    expect(screen.queryByTestId('field-people-error')).toBeNull(); // handing over my task is allowed
    await user.click(await screen.findByTestId('confirm-follow-cancel'));
    expect(screen.getByTestId('task-form')).toBeInTheDocument();
    expect(updates(backend)).toBe(0);
    await waitFor(() => expect(screen.getByTestId('form-submit')).toHaveFocus()); // "Lưu" was disabled while asking
    await user.click(screen.getByTestId('form-submit'));
    await user.click(await screen.findByTestId('confirm-follow-yes'));
    await waitFor(() => expect(lastUpdate(backend)).toMatchObject({ assignee: 'PERMOCK00004', ccs: ['PERMOCKME0001'] }));
    await waitFor(() => expect(screen.queryByTestId('task-form')).toBeNull());
  });
});
