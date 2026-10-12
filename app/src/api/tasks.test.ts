import { describe, expect, it } from 'vitest';
import { FIXED_NOW, ME, installBackend, jsonResponse } from '../test/fixtures';
import { SessionExpiredError } from './client';
import { taskApi } from './tasks';

const listCalls = (fetchMock: ReturnType<typeof installBackend>['fetchMock']) =>
  fetchMock.mock.calls.filter(c => String(c[0]).endsWith('/records/list')).map(c => JSON.parse(String(c[1]?.body)));

describe('taskApi (against the in-memory Records API)', () => {
  it('reads the current user, keeping only allowed fields', async () => {
    installBackend();
    const me = await taskApi.getMe();
    expect(me).toEqual({ id: ME, firstName: 'An', lastName: 'Trần Minh', avatarUrl: '/__mock/avatar/small/me.svg' });
  });

  it('fails clearly when the current user cannot be read', async () => {
    installBackend({ people: [] });
    await expect(taskApi.getMe()).rejects.toThrow('Không xác định được người dùng đang đăng nhập.');
  });

  it('loads every open task in scope, following search_after verbatim', async () => {
    const extra = Array.from({ length: 150 }, (_, i) => ({
      id: `TASX${String(i).padStart(3, '0')}`,
      name: `TAS-X${i}`,
      subject: `Việc thêm ${i}`,
      description: '',
      due_date: FIXED_NOW + i * 60e3,
      priority: 'medium',
      status: 'new',
      reporter: ME,
      assignee: ME,
      ccs: [],
      created: FIXED_NOW,
      updated: FIXED_NOW,
    }));
    const { fetchMock, backend, responses } = installBackend({ maxPage: 100 });
    backend.state.tasks.push(...extra);
    const open = await taskApi.listOpenTasks();
    // 10 seeded open tasks in scope + 150 extra
    expect(open).toHaveLength(160);
    expect(open.some(t => t.id === 'TASMOCK0011')).toBe(false); // not mine
    const calls = listCalls(fetchMock);
    expect(calls).toHaveLength(2);
    expect(calls[0].search_after).toEqual([]);
    expect(calls[1].search_after).toEqual(responses[0].body.data.search_after);
    expect(calls[1].search_after).toHaveLength(2);
  });

  it('stops paging on a short page even if total says more', async () => {
    let n = 0;
    installBackend({}, {
      override: (path, body) => {
        if (path !== '/api/v1/records/list' || body.object_slug !== 'task') return undefined;
        n++;
        return jsonResponse({ r: 0, data: { total: 999, rows: [{ id: `T${n}`, subject: 's', status: 'new' }], search_after: [n] } });
      },
    });
    const open = await taskApi.listOpenTasks();
    expect(open.map(t => t.id)).toEqual(['T1']);
    expect(n).toBe(1);
  });

  it('counts done tasks for the ticked roles with a single-row request', async () => {
    const { fetchMock } = installBackend();
    const ALL = ['reporter', 'assignee', 'cc'] as const;
    await expect(taskApi.countDoneTasks([...ALL])).resolves.toBe(130);
    expect(listCalls(fetchMock)[0]).toMatchObject({ size: 1, type: 3 });
    // seed: done tasks alternate "I assigned" / "assigned to me"; some odd ones also follow me
    await expect(taskApi.countDoneTasks(['assignee'])).resolves.toBe(65);
    expect(listCalls(fetchMock)[1]).toMatchObject({ size: 1, type: 1 });
    await expect(taskApi.countDoneTasks(['reporter'])).resolves.toBe(65);
    await expect(taskApi.countDoneTasks(['cc'])).resolves.toBe(19);
    await expect(taskApi.countDoneTasks(['assignee', 'cc'])).resolves.toBe(74);
    expect(listCalls(fetchMock)).toHaveLength(5);
  });

  it('does not query when no role is ticked', async () => {
    const { fetchMock } = installBackend();
    await expect(taskApi.countDoneTasks([])).resolves.toBe(0);
    await expect(taskApi.listDoneTasks([], [])).resolves.toEqual({ rows: [], total: 0, searchAfter: [], last: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('pages done tasks by last update', async () => {
    installBackend();
    const roles = ['reporter', 'assignee', 'cc'] as const;
    const p1 = await taskApi.listDoneTasks([...roles], []);
    expect(p1.rows).toHaveLength(100);
    expect(p1.total).toBe(130);
    expect(p1.last).toBe(false);
    const p2 = await taskApi.listDoneTasks([...roles], p1.searchAfter);
    expect(p2.rows).toHaveLength(30);
    expect(p2.last).toBe(true);
    expect(new Set([...p1.rows, ...p2.rows].map(t => t.id)).size).toBe(130);
    expect(p1.rows[0].updated! >= p1.rows[1].updated!).toBe(true);
  });

  it('reads one task by id, or null', async () => {
    installBackend();
    await expect(taskApi.getTask('TASMOCK0003')).resolves.toMatchObject({ code: 'TAS-1003', status: 'pending' });
    await expect(taskApi.getTask('NOPE')).resolves.toBeNull();
  });

  it('creates, updates and deletes with the right services', async () => {
    const { fetchMock, backend } = installBackend();
    const id = await taskApi.createTask({ subject: 'Mới', description: '', due_date: FIXED_NOW, priority: 'low', status: 'new', reporter: ME, assignee: ME });
    expect(backend.state.tasks.find(t => t.id === id)).toMatchObject({ subject: 'Mới', priority: 'low' });
    await taskApi.updateTask(id, { status: 'resolved' });
    expect(backend.state.tasks.find(t => t.id === id)?.status).toBe('resolved');
    await expect(taskApi.deleteTasks([id, 'GONE'])).resolves.toEqual({ deleted: [id], notDeleted: ['GONE'] });
    const services = backend.calls.map(c => c.service);
    expect(services).toEqual(['10200', '10201', '218']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('rejects a create response without an id', async () => {
    installBackend({}, { override: path => (path === '/api/v1/records' ? jsonResponse({ r: 0, data: {} }) : undefined) });
    await expect(taskApi.createTask({ subject: 'x' })).rejects.toThrow('Máy chủ không trả về mã công việc vừa tạo.');
    installBackend({}, { override: path => (path === '/api/v1/records' ? jsonResponse({ r: 0, data: { id: 123 } }) : undefined) });
    await expect(taskApi.createTask({ subject: 'x' })).resolves.toBe('123');
  });

  it('accepts deleted / not_deleted given as objects', async () => {
    installBackend({}, {
      override: path => (path === '/api/v1/records/delete' ? jsonResponse({ r: 0, data: { deleted: [{ id: 'A' }], not_deleted: null } }) : undefined),
    });
    await expect(taskApi.deleteTasks(['A'])).resolves.toEqual({ deleted: ['A'], notDeleted: [] });
  });

  it('lists active personnel only', async () => {
    installBackend();
    const people = await taskApi.listPeople();
    expect(people).toHaveLength(11);
    expect(people.some(p => p.id === 'PERMOCK00012')).toBe(false);
  });

  it('surfaces an expired session', async () => {
    installBackend({}, { scenario: 'expired' });
    await expect(taskApi.listOpenTasks()).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('tolerates a list response without rows', async () => {
    installBackend({}, { override: () => jsonResponse({ r: 0, data: null }) });
    await expect(taskApi.listOpenTasks()).resolves.toEqual([]);
    await expect(taskApi.countDoneTasks(['assignee'])).resolves.toBe(0);
  });
});

describe('taskApi activities', () => {
  it('lists a task’s timeline page by page (newest first) with authors expanded', async () => {
    const { fetchMock } = installBackend();
    const first = await taskApi.listActivities('TASMOCK0003');
    expect(first.rows).toHaveLength(15);
    expect(first.total).toBe(18);
    expect(first.last).toBe(false);
    expect(first.rows[0]).toMatchObject({ id: 'ACTPAGE0001', type: 'note', subject: 'Cập nhật 1' });
    expect(first.rows[0].author?.firstName).toBeTruthy();
    const body = JSON.parse(String(fetchMock.mock.calls.at(-1)![1]!.body));
    expect(body.filters).toEqual([{ field: 'Task', op: '=', params: 'TASMOCK0003', fieldType: 'lookup_normal' }]);
    const second = await taskApi.listActivities('TASMOCK0003', first.searchAfter);
    expect(second.rows.map(r => r.id)).toEqual(['ACTPAGE0016', 'ACTPAGE0017', 'ACTPAGE0018']);
    expect(second.last).toBe(true);
  });

  it('creates a note on the activity object and reads it back', async () => {
    const { backend } = installBackend();
    const a = await taskApi.createNote({ taskId: 'TASMOCK0005', html: '<p>Xong</p>', images: [] });
    const call = backend.calls.find(c => c.service === '10200')!;
    expect(call.body.object_type).toBe('OTDEMOACTIV01');
    expect(call.body.data).toMatchObject({ activity_type: 'note', name: '', Task: 'TASMOCK0005', source_record: 'TASMOCK0005' });
    expect(a).toMatchObject({ type: 'note', subject: '', content: '<p>Xong</p>' });
    expect(a.author?.id).toBe('PERMOCKME0001');
  });

  it('falls back to what was typed when the note cannot be read back; reports a create without id', async () => {
    installBackend({}, { override: (path, body) => (path === '/api/v1/records/list' && body.object_slug === 'activity' ? jsonResponse({ r: 500, msg: 'x' }) : undefined) });
    const a = await taskApi.createNote({ taskId: 'TASMOCK0005', html: '<p>Y</p>', images: [] });
    expect(a).toMatchObject({ type: 'note', subject: '', content: '<p>Y</p>', author: null, files: [] });
    installBackend({}, { override: path => (path === '/api/v1/records' ? jsonResponse({ r: 0, data: {} }) : undefined) });
    await expect(taskApi.createNote({ taskId: 'T', html: '<p>Y</p>', images: [] })).rejects.toThrow('Máy chủ không trả về mã ghi chú vừa tạo.');
  });

  it('uploads a picture of a note to the activity’s `_attachments`, linked to its `content` field', async () => {
    const { fetchMock } = installBackend();
    const img = await taskApi.uploadNoteImage(new File(['png'], 'a.png', { type: 'image/png' }));
    const form = fetchMock.mock.calls.at(-1)![1]!.body as FormData;
    expect(form.get('field_id')).toBe('OFDEMOACTIMG1');
    expect(form.get('object_id')).toBe('OTDEMOACTIV01');
    expect(img.src).toContain('long_text_field_id=OFDEMOACTCONT');
    installBackend();
    await expect(taskApi.uploadNoteImage(new File(['x'], 'a.exe'))).rejects.toThrow('file type not allowed');
  });
});

describe('taskApi.uploadInlineImage', () => {
  it('uploads a description picture to `_attachments` by field id + object id (CSRF only) and builds its src', async () => {
    document.cookie = 'XSRF-TOKEN=tok-9';
    const { fetchMock } = installBackend();
    const img = await taskApi.uploadInlineImage(new File(['png'], 'anh chụp.png', { type: 'image/png' }));
    const [path, init] = fetchMock.mock.calls.at(-1)!;
    expect(path).toBe('/api/v1/file/upload/v2/client_upload');
    expect(init?.headers).toEqual({ 'x-csrf-token': 'tok-9', 'x-xsrf-token': 'tok-9' });
    const form = init?.body as FormData;
    expect(form.get('field_id')).toBe('OFDEMOTASKIMG');
    expect(form.get('object_id')).toBe('OTDEMOTASK001');
    expect(form.get('field_slug')).toBeNull();
    expect((form.get('file') as File).name).toBe('anh chụp.png');
    expect(img.src).toBe(`${window.location.origin}/files/0/${img.fileId}/original/anh-ch%E1%BB%A5p.png?redirect=true&long_text_field_id=OFDEMOTASKDSC`);
    expect(img.meta).toMatchObject({ file_id: img.fileId, acl: 'public', url: expect.stringContaining('long_text_field_id=OFDEMOTASKDSC') });
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('reports a refused type with the server message, and a reply without a file id', async () => {
    installBackend();
    await expect(taskApi.uploadInlineImage(new File(['x'], 'a.webp', { type: 'image/webp' }))).rejects.toThrow('file type not allowed');
    installBackend({}, { override: () => jsonResponse({ r: 0, data: { fileName: 'a.png' } }) });
    await expect(taskApi.uploadInlineImage(new File(['x'], 'a.png'))).rejects.toThrow('Máy chủ không trả về thông tin ảnh vừa tải lên.');
  });
});

describe('taskApi.uploadFile', () => {
  it('posts multipart (field_slug, object_slug, file) with CSRF only, and returns the FILE_METADATA', async () => {
    document.cookie = 'XSRF-TOKEN=tok-123';
    const { fetchMock, backend } = installBackend();
    const file = new File(['xin chào'], 'Biên bản họp.docx', { type: 'application/msword' });
    const a = await taskApi.uploadFile(file);
    const [path, init] = fetchMock.mock.calls.at(-1)!;
    expect(path).toBe('/api/v1/file/upload/v2/client_upload');
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers).toEqual({ 'x-csrf-token': 'tok-123', 'x-xsrf-token': 'tok-123' }); // no x-req-*, no content-type
    const form = init?.body as FormData;
    expect(form.get('field_slug')).toBe('attachment_files');
    expect(form.get('object_slug')).toBe('task');
    expect((form.get('file') as File).name).toBe('Biên bản họp.docx');
    expect(a).toMatchObject({ fileId: 'FILMOCK0001', fileName: 'Biên bản họp.docx', fileSize: file.size, fileExt: 'docx' });
    expect(a.meta).toMatchObject({ file_id: 'FILMOCK0001', acl: 'private', url: expect.stringContaining('{file_id}') });
    expect(backend.calls.at(-1)?.service).toBeUndefined();
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('reports the server message, an expired session, or a reply without a file id', async () => {
    installBackend();
    await expect(taskApi.uploadFile(new File(['x'], 'anh [loi].png'))).rejects.toThrow('file type not allowed');
    await expect(taskApi.uploadFile(new File(['x'], 'cai-dat.exe'))).rejects.toThrow('file type not allowed');
    installBackend({}, { scenario: 'expired' });
    await expect(taskApi.uploadFile(new File(['x'], 'a.png'))).rejects.toBeInstanceOf(SessionExpiredError);
    installBackend({}, { override: () => jsonResponse({ r: 0, data: { fileName: 'a.png' } }) });
    await expect(taskApi.uploadFile(new File(['x'], 'a.png'))).rejects.toThrow('Máy chủ không trả về thông tin file vừa tải lên.');
  });
});
