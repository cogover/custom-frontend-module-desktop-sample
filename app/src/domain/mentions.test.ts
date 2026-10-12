import { describe, expect, it, vi } from 'vitest';
import { mentionContextForTask, mentionPeopleBody, mentionQueryAt, normalizeCandidates } from './mentions';

describe('mentionQueryAt: the "@…" being typed before the caret', () => {
  it('finds "@" at the start or after a space / bracket, with up to three words', () => {
    expect(mentionQueryAt('@')).toEqual({ at: 0, query: '' });
    expect(mentionQueryAt('Nhờ @la')).toEqual({ at: 4, query: 'la' });
    expect(mentionQueryAt('(@Huy')).toEqual({ at: 1, query: 'Huy' });
    expect(mentionQueryAt('Nhờ @Nguyễn Thị Lan')).toEqual({ at: 4, query: 'Nguyễn Thị Lan' });
    expect(mentionQueryAt('@huy.bui@')).toBeNull(); // second "@"
    expect(mentionQueryAt('@minh.tq@exa')).toBeNull();
  });

  it('ignores e-mail addresses, a space right after "@", line breaks, long or wordy text', () => {
    expect(mentionQueryAt('gửi an@example.test')).toBeNull();
    expect(mentionQueryAt('@ la')).toBeNull();
    expect(mentionQueryAt('@la\nb')).toBeNull();
    expect(mentionQueryAt('@la  b')).toBeNull();
    expect(mentionQueryAt(`@${'x'.repeat(41)}`)).toBeNull();
    expect(mentionQueryAt('@một hai ba bốn')).toBeNull();
    expect(mentionQueryAt('không có')).toBeNull();
  });
});

describe('people search and mention context', () => {
  it('builds Cogover’s mention query, with or without me', () => {
    const withMe = mentionPeopleBody('  lan ', 'PER1');
    expect(withMe).toMatchObject({ object_slug: 'personnel', type: 3, logic_sequence: '(1 OR 2 OR 3 OR 4 OR 5) AND 6 AND 7 AND 8', size: 8 });
    expect(withMe.filters[0]).toEqual({ field: 'first_last_name', op: 'like', params: 'lan', fieldType: 'short_text' });
    expect(withMe.filters.at(-1)).toEqual({ field: 'id', op: '!=', params: 'PER1', fieldType: 'short_text' });
    const anonymous = mentionPeopleBody('', null, 3);
    expect(anonymous.logic_sequence).toBe('(1 OR 2 OR 3 OR 4 OR 5) AND 6 AND 7');
    expect(anonymous.filters).toHaveLength(7);
    expect(anonymous.size).toBe(3);
  });

  it('turns rows into candidates (name, avatar, account e-mail), skipping bad rows and duplicates', () => {
    expect(
      normalizeCandidates([
        { id: 'P1', first_name: 'Lan', last_name: 'Nguyễn Thị', account_email: ' lan@x.test ' },
        { id: 'P1', first_name: 'Lan' },
        { id: 'P2', first_name: 'Vy', account_email: 5 },
        null,
        {},
      ]),
    ).toEqual([
      { person: { id: 'P1', firstName: 'Lan', lastName: 'Nguyễn Thị', avatarUrl: null }, email: 'lan@x.test' },
      { person: { id: 'P2', firstName: 'Vy', lastName: '', avatarUrl: null }, email: '' },
    ]);
  });

  it('points a note’s mentions at the task (detail layout, {record_id} = the note)', () => {
    expect(mentionContextForTask('TAS1')).toEqual({
      objectId: 'OTDEMOTASK001',
      recordId: 'TAS1',
      redirect: '/o/task/TAS1?layoutId=LODEMOLAYOUT1&activityId={record_id}',
    });
  });

  it('uses the Object and the detail layout of the Workspace serving the page (one set per hostname)', async () => {
    // the IDs are picked when the modules load: load them again as the page of another Workspace
    vi.resetModules();
    vi.stubGlobal('location', new URL('https://globex.cogover.example/_cm_5/index.html'));
    const elsewhere = await import('./mentions');
    expect(elsewhere.mentionContextForTask('TAS1')).toEqual({
      objectId: 'OTDEMO2TASK01',
      recordId: 'TAS1',
      redirect: '/o/task/TAS1?layoutId=LODEMO2LAYOUT&activityId={record_id}',
    });
    vi.resetModules();
  });
});
