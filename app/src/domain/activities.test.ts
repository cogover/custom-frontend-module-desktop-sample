import { describe, expect, it } from 'vitest';
import { activitiesBody, activityByIdBody, activityHtml, activityTypeLabel, normalizeActivity, noteBody } from './activities';

describe('activities of a task (Object `activity`, lookup `Task`)', () => {
  it('reads an API row: subject, kind, author, time (activity_time, else created) and files', () => {
    const a = normalizeActivity({
      id: 'ACT1',
      name: ' Báo cáo ',
      activity_type: 'note',
      content: '<div>Xong</div>',
      created: 1000,
      activity_time: 2000,
      created_by: { id: 'PER1', first_name: 'Lan', last_name: 'Nguyễn Thị', email: 'x@y.z' },
      files: [JSON.stringify({ file_id: 'F1', fileName: 'a.pdf', fileSize: 10 })],
    })!;
    expect(a).toMatchObject({ id: 'ACT1', type: 'note', subject: 'Báo cáo', content: '<div>Xong</div>', at: 2000 });
    expect(a.author).toMatchObject({ id: 'PER1', firstName: 'Lan', lastName: 'Nguyễn Thị' });
    expect(a.files.map(f => f.fileId)).toEqual(['F1']);
    const b = normalizeActivity({ id: 'ACT2', activity_type: [{ slug: 'task' }], created: 5 })!;
    expect(b).toMatchObject({ type: 'task', subject: '', content: '', author: null, at: 5, files: [] });
    expect(normalizeActivity({ name: 'no id' })).toBeNull();
    expect(normalizeActivity(null)).toBeNull();
  });

  it('labels every kind like Cogover (unknown kinds keep their slug)', () => {
    expect(['note', 'task', 'call', 'meeting', 'email', 'sms', 'chat', 'facebook_comment', 'chat_zalo_fb'].map(activityTypeLabel)).toEqual([
      'Ghi chú', 'Công việc', 'Gọi điện', 'Họp', 'Email', 'SMS', 'Chat', 'Facebook', 'Live-chat',
    ]);
    expect(activityTypeLabel('fax')).toBe('fax');
    expect(activityTypeLabel('')).toBe('Hoạt động');
  });

  it('shows stored content safely: pictures with the {resolution_size} placeholder at original size, no scripts or styles', () => {
    const html = activityHtml(
      '<div><span data-autocomplete-type="mention" style="color:red" onclick="x()">@Lan</span> xem nhé</div>' +
        '<img src="https://w.test/files/0/F1/{resolution_size}/image.png?redirect=true&amp;long_text_field_id=OF1">' +
        '<img src="https://w.test/files/0/F2/%7Bresolution_size%7D/b.png"><script>alert(1)</script>',
    );
    expect(html).toContain('src="https://w.test/files/0/F1/original/image.png?redirect=true&amp;long_text_field_id=OF1"');
    expect(html).toContain('src="https://w.test/files/0/F2/original/b.png"');
    expect(html).toContain('@Lan');
    expect(html).not.toMatch(/script|onclick|style=/);
  });

  it('asks for one page of the task’s timeline, newest first, and for one activity by id', () => {
    const body = activitiesBody('TAS1', ['x', 'ACT9']);
    expect(body).toMatchObject({
      object_slug: 'activity',
      type: 1,
      logic_sequence: '',
      filters: [{ field: 'Task', op: '=', params: 'TAS1', fieldType: 'lookup_normal' }],
      sorts: [{ created: { order: 'desc' } }],
      search_after: ['x', 'ACT9'],
      size: 15,
    });
    expect(body.fields).toEqual(['id', 'name', 'activity_type', 'content', 'created', 'created_by', 'activity_time', 'files']);
    expect(activityByIdBody('ACT9')).toMatchObject({ filters: [{ field: 'id', op: '=', params: 'ACT9', fieldType: 'short_text' }], size: 1 });
  });

  it('writes a note like Cogover’s own timeline does; no subject, but `name` always present (empty)', () => {
    const body = noteBody({ taskId: 'TAS1', html: '<p>Nội dung</p>', images: [] }, 1234);
    expect(body).toEqual({
      workspace_id: 'WSDEMO0000001',
      object_type: 'OTDEMOACTIV01',
      client_time_zone: 'Asia/Saigon',
      data: {
        object_type: 'OTDEMOACTIV01',
        workspace_id: 'WSDEMO0000001',
        activity_type: 'note',
        note_type: 'normal',
        name: '',
        content: '<p>Nội dung</p>',
        Task: 'TAS1',
        source_object: 'task',
        source_record: 'TAS1',
        manual_log: 1,
        activity_time: 1234,
      },
    });
    const withImg = noteBody({ taskId: 'TAS1', html: '<p><img src="x"></p>', images: [{ file_id: 'F1' }] }, 1);
    expect(withImg.data).toMatchObject({ name: '', _attachments: [{ file_id: 'F1' }] });
  });
});
