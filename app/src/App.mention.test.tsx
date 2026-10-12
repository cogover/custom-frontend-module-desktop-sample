import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MENTION_STYLE } from './domain/mentions';
import { editorFor } from './rte/RichTextEditor';
import { getItem, renderApp } from './test/app';
import { ME, jsonResponse } from './test/fixtures';

type Calls = { calls: { path: string; service?: string; body: any }[] };
const searches = (backend: Calls) => backend.calls.filter(c => c.path === '/api/v1/records/list' && c.body?.object_slug === 'personnel' && c.body.type === 3);
const options = () => screen.queryAllByTestId('mention-option');
const optionIds = () => options().map(o => o.dataset.personId);

async function openComposer(user: { click: (el: Element) => Promise<void> }, id = 'TASMOCK0002') {
  await user.click(getItem(id).querySelector('.desc, .main')!);
  await user.click(await screen.findByTestId('activity-add'));
  const box = await screen.findByTestId('activity-content-editor');
  const editor = editorFor(box)!;
  const type = (text: string) =>
    act(() => {
      if (!editor.selection) editor.tf.select(editor.api.end([]));
      editor.tf.insertText(text);
    });
  return { box, editor, type };
}

describe('@mentions in a note (CONTRACT §5.3f)', () => {
  it('searches people by name or e-mail and saves the mention as Cogover’s span (the backend notifies)', async () => {
    const { user, backend } = await renderApp();
    const { box, editor, type } = await openComposer(user);
    expect(screen.getByTestId('activity-composer')).toHaveTextContent('gõ @ để nhắc đến ai đó');
    type('Nhờ @la');
    await waitFor(() => expect(optionIds()).toEqual(['PERMOCK00002']));
    expect(options()[0]).toHaveTextContent('Nguyễn Thị Lan');
    expect(options()[0]).toHaveTextContent('lan.nguyen@example.test');
    expect(screen.getByRole('listbox', { name: 'Nhắc đến nhân sự' })).toBeInTheDocument();
    expect(box).toHaveAttribute('aria-expanded', 'true');
    expect(box.getAttribute('aria-activedescendant')).toBe(options()[0].id);

    // the query of Cogover's own list (names, people with an account, not me, not deleted) + the e-mail
    const body = searches(backend).at(-1)!.body;
    expect(body.logic_sequence).toBe('(1 OR 2 OR 3 OR 4 OR 5) AND 6 AND 7 AND 8');
    expect(body.filters.map((f: any) => [f.field, f.op, f.params])).toEqual([
      ['first_last_name', 'like', 'la'],
      ['last_first_name', 'like', 'la'],
      ['first_name', 'like', 'la'],
      ['last_name', 'like', 'la'],
      ['account_email', 'like', 'la'],
      ['account_email', 'not null', null],
      ['deleted', '!=', 1],
      ['id', '!=', ME],
    ]);
    expect(body.fields).toEqual(['id', 'first_name', 'last_name', 'account_email', 'avatar']);

    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(screen.queryByTestId('mention-list')).toBeNull());
    expect(box).not.toHaveAttribute('aria-expanded');
    // the pill is painted by the editor a moment after the list closes (seen failing on a busy machine)
    await waitFor(() => expect(box.querySelector('.rte-mention')).toHaveTextContent('@Nguyễn Thị Lan'));
    expect(editor.children[0]).toMatchObject({ type: 'p', children: [{ text: 'Nhờ ' }, { type: 'mention', personId: 'PERMOCK00002' }, { text: ' ' }] });
    type('xem giúp');
    await user.click(screen.getByTestId('activity-submit'));
    await waitFor(() => expect(screen.queryByTestId('activity-composer')).toBeNull());

    const sent = backend.calls.find(c => c.service === '10200')!.body.data;
    expect(sent.content).toBe(
      '<p>Nhờ <span contenteditable="false" data-autocomplete-type="mention" data-id="PERMOCK00002" data-parent-object-id="OTDEMOTASK001" ' +
        'data-parent-record-id="TASMOCK0002" data-redirect="/o/task/TASMOCK0002?layoutId=LODEMOLAYOUT1&amp;activityId={record_id}" ' +
        `data-type="autocomplete" style="${MENTION_STYLE}">@Nguyễn Thị Lan</span> xem giúp</p>`,
    );
    // shown in the timeline as a pill (marker kept, inline style dropped)
    const pillOf = () => screen.getAllByTestId('activity-item')[0].querySelector('[data-autocomplete-type="mention"]');
    await waitFor(() => expect(pillOf()).toHaveTextContent('@Nguyễn Thị Lan'));
    const pill = pillOf()!;
    expect(pill).not.toHaveAttribute('style');
  });

  it('"@" alone lists everyone with an account; arrows, a click and Esc (only the list closes)', async () => {
    const { user } = await renderApp();
    const { box, editor, type } = await openComposer(user);
    type('@');
    // no account (Tuấn, Linh, Ngọc, Đức), deleted (Tùng) and me (An) are left out
    await waitFor(() => expect(optionIds()).toEqual(['PERMOCK00002', 'PERMOCK00003', 'PERMOCK00004', 'PERMOCK00006', 'PERMOCK00008', 'PERMOCK00011']));
    expect(options()[0]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(options()[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(box, { key: 'ArrowUp' });
    fireEvent.keyDown(box, { key: 'ArrowUp' });
    expect(options()[5]).toHaveAttribute('aria-selected', 'true'); // wraps around

    fireEvent.keyDown(box, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('mention-list')).toBeNull());
    expect(screen.getByTestId('task-dialog')).toBeInTheDocument();
    type('abc'); // same "@": stays closed
    await new Promise(r => setTimeout(r, 250));
    expect(screen.queryByTestId('mention-list')).toBeNull();

    type(' @ngô');
    await waitFor(() => expect(optionIds()).toEqual(['PERMOCK00011']));
    await user.click(options()[0]);
    await waitFor(() => expect(screen.queryByTestId('mention-list')).toBeNull());
    expect(editor.api.string([])).toContain('abc ');
    await waitFor(() => expect(box.querySelector('.rte-mention')).toHaveTextContent('@Ngô Khánh Vy'));
    // Enter without a list is a new line again
    fireEvent.keyDown(box, { key: 'Enter' });
  });

  it('says when nobody matches, gives up on several words that match nobody, and reports a failed search', async () => {
    const { user } = await renderApp({}, {
      override: (path, body) => (path === '/api/v1/records/list' && body?.object_slug === 'personnel' && body.type === 3 && body.filters[0].params === 'boom' ? jsonResponse({ r: 5, msg: 'Hỏng' }) : undefined),
    });
    const { type } = await openComposer(user);
    type('@zzz');
    expect(await screen.findByTestId('mention-empty')).toHaveTextContent('Không tìm thấy nhân sự');
    type(' abc');
    await waitFor(() => expect(screen.queryByTestId('mention-list')).toBeNull());
    type(' @boom');
    expect(await screen.findByTestId('mention-error')).toHaveTextContent('Không tìm được nhân sự: Hỏng');
  });

  it('a mention typed by e-mail, and no "@" list in the task description', async () => {
    const { user, backend } = await renderApp();
    const { box, type } = await openComposer(user);
    type('@minh.tq@');
    await new Promise(r => setTimeout(r, 250));
    expect(screen.queryByTestId('mention-list')).toBeNull(); // a second "@": not a mention any more
    act(() => {
      const editor = editorFor(box)!;
      editor.tf.setValue([{ type: 'p', children: [{ text: '' }] }]);
      editor.tf.select(editor.api.end([]));
      editor.tf.insertText('@minh.tq');
    });
    await waitFor(() => expect(optionIds()).toEqual(['PERMOCK00003']));
    await user.click(screen.getByTestId('activity-cancel'));
    await user.click(screen.getByTestId('form-edit'));
    const desc = editorFor(await screen.findByTestId('field-desc'))!;
    const before = searches(backend).length;
    act(() => {
      desc.tf.select(desc.api.end([]));
      desc.tf.insertText(' @la');
    });
    await new Promise(r => setTimeout(r, 250));
    expect(screen.queryByTestId('mention-list')).toBeNull();
    expect(searches(backend).length).toBe(before);
    expect(within(screen.getByTestId('task-form')).queryByRole('listbox')).toBeNull();
  });
});
