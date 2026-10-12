import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockBackendOptions } from '../../dev/mock-backend';
import { loadEditor } from '../rte/loadEditor';
import { chooseOption } from '../test/app';
import { ME, freezeTime, installBackend, jsonResponse, type FetchOptions } from '../test/fixtures';
import NotesApp from './NotesApp';
import type { WindowApi } from '../desktop/WindowControls';

async function renderNotes(opts: Partial<MockBackendOptions> = {}, fetchOpts: FetchOptions = {}, win?: WindowApi) {
  await loadEditor();
  freezeTime();
  const env = installBackend(opts, fetchOpts);
  const user = userEvent.setup();
  const view = render(<NotesApp win={win} />);
  await waitFor(() => expect(screen.queryByTestId('notes-loading')).toBeNull());
  return { ...env, user, view };
}

type Row = Record<string, unknown>;
const records = (backend: { state: { records: Record<string, Row[]> } }, slug: string) => backend.state.records[slug] ?? [];
const record = (backend: { state: { records: Record<string, Row[]> } }, slug: string, id: string) => records(backend, slug).find(r => r.id === id);
const tree = () => screen.getByTestId('notes-tree');
const treeNames = () => within(tree()).getAllByRole('treeitem').map(el => el.getAttribute('aria-label'));
const toast = () => screen.getByTestId('toast');
const go = (id: string) => window.history.replaceState(null, '', `/#/note/${id}`);

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('NotesApp — lists', () => {
  it('loads my folder tree, my notes, the notes shared with me (by owner) and my pins; private/public of others stay out', async () => {
    const { fetchMock } = await renderNotes();
    expect(screen.getByTestId('scope-count-mine')).toHaveTextContent('5');
    expect(screen.getByTestId('scope-count-shared')).toHaveTextContent('3');
    expect(screen.getByTestId('scope-count-all')).toHaveTextContent('8');
    expect(treeNames()).toEqual(['Cá nhân', 'Sản phẩm', 'Vận hành', 'Ý tưởng dock ứng dụng']);

    const groups = screen.getAllByTestId('shared-group');
    expect(groups.map(g => g.querySelector('.shared-owner > span:not(.avatar)')!.textContent)).toEqual(['Nguyễn Thị Lan', 'Trần Quang Minh']);
    expect(within(groups[0]).getAllByTestId('shared-note').map(b => b.textContent)).toEqual(['Bảng giá đại lý Q4', 'Checklist onboarding']);
    expect(screen.queryByText('Thông báo nghỉ lễ')).toBeNull(); // public: only by link
    expect(screen.queryByText('Nháp của Minh')).toBeNull(); // private, even with me in a list
    expect(screen.getAllByTestId('pinned-note').map(b => b.textContent)).toEqual(['Publish Custom Frontend Module', 'Bảng giá đại lý Q4']);
    expect(screen.getByTestId('notes-totals')).toHaveTextContent('8 ghi chú · 6 thư mục');
    expect(screen.getByTestId('notes-welcome')).toBeInTheDocument();

    // the notes shared with me are asked for my department too (department_personnel)
    const bodies = fetchMock.mock.calls.map(c => JSON.parse(String((c[1] as RequestInit)?.body ?? 'null')));
    const shared = bodies.find(b => b?.object_slug === 'notes_content' && b.type === 3);
    expect(shared.logic_sequence).toBe('1 AND (2 OR 3 OR 4 OR 5)');
    expect(JSON.stringify(shared.filters)).toContain('DEPMOCK01');
    expect(bodies.find(b => b?.object_slug === 'notes_cat').filters).toEqual([{ field: 'owner', op: '=', params: '$currentUser', fieldType: 'lookup_normal' }]);
  });

  it('search (no accents) keeps matching notes and their folders, marks the match; a folder name keeps its notes', async () => {
    const { user } = await renderNotes();
    await user.type(screen.getByTestId('notes-search'), 'giao ban');
    expect(treeNames()).toEqual(['Vận hành', 'Họp', 'Giao ban tuần 40']);
    expect(tree().querySelector('mark')).toHaveTextContent('Giao ban');
    expect(screen.getByTestId('shared-empty')).toBeInTheDocument();
    await user.clear(screen.getByTestId('notes-search'));
    await user.type(screen.getByTestId('notes-search'), 'frontend');
    expect(treeNames()).toEqual(['Sản phẩm', 'Custom Module', 'Frontend', 'Mention trong ghi chú', 'Publish Custom Frontend Module']);
    await user.clear(screen.getByTestId('notes-search'));
    await user.type(screen.getByTestId('notes-search'), 'zzz');
    expect(screen.getByTestId('tree-empty')).toHaveTextContent('Không có ghi chú nào của bạn khớp tìm kiếm.');
  });

  it('quick filter: Cá nhân hides the shared list, Được chia sẻ hides the tree; pins follow; the choice is kept', async () => {
    const { user } = await renderNotes();
    await user.click(screen.getByTestId('scope-mine'));
    expect(screen.queryByTestId('shared-section')).toBeNull();
    expect(screen.getAllByTestId('pinned-note').map(b => b.textContent)).toEqual(['Publish Custom Frontend Module']);
    await user.click(screen.getByTestId('scope-shared'));
    expect(screen.queryByTestId('notes-tree')).toBeNull();
    expect(screen.getAllByTestId('pinned-note').map(b => b.textContent)).toEqual(['Bảng giá đại lý Q4']);
    expect(localStorage.getItem('ghi-chu.scope')).toBe('shared');
  });

  it('the tree works with the keyboard (↑↓ move, → opens / goes in, ← goes back, Enter opens a note)', async () => {
    await renderNotes();
    const first = within(tree()).getByRole('treeitem', { name: 'Cá nhân' });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    const product = within(tree()).getByRole('treeitem', { name: 'Sản phẩm' });
    expect(product).toHaveFocus();
    fireEvent.keyDown(product, { key: 'ArrowRight' });
    expect(product).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(product, { key: 'ArrowRight' });
    const cm = within(tree()).getByRole('treeitem', { name: 'Custom Module' });
    expect(cm).toHaveFocus();
    fireEvent.keyDown(cm, { key: 'ArrowLeft' });
    expect(product).toHaveFocus();
    fireEvent.keyDown(product, { key: 'ArrowLeft' });
    expect(product).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(product, { key: 'End' });
    const last = within(tree()).getByRole('treeitem', { name: 'Ý tưởng dock ứng dụng' });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: 'Enter' });
    expect(await screen.findByTestId('note-title')).toHaveTextContent('Ý tưởng dock ứng dụng');
    expect(screen.getByTestId('note-content').innerHTML).toBe('<p>Gom các module thành ứng dụng trên một desktop chung.</p><p>Mỗi app một cửa sổ.</p>');
  });
});

describe('NotesApp — one note', () => {
  it('opens a note from the tree: Markdown rendered, breadcrumb, owner actions, #/note/<id>; table of contents on demand', async () => {
    const { user } = await renderNotes();
    await user.click(within(tree()).getByText('Sản phẩm'));
    await user.click(within(tree()).getByText('Custom Module'));
    await user.click(within(tree()).getByText('Frontend'));
    await user.click(within(tree()).getByText('Publish Custom Frontend Module'));
    expect(screen.getByTestId('note-title')).toHaveTextContent('Publish Custom Frontend Module');
    expect(window.location.hash).toBe('#/note/NOTMOCK01');
    expect(screen.getAllByTestId('crumb').map(c => c.textContent)).toEqual(['Sản phẩm', 'Custom Module', 'Frontend']);
    expect(screen.getByTestId('note-content').querySelector('table')).not.toBeNull();
    expect(screen.getByTestId('note-visibility')).toHaveTextContent('Chia sẻ cho người hoặc phòng');
    expect(screen.getByTestId('note-tags')).toHaveTextContent('#quy-trình#dev-cli');
    for (const id of ['note-pin', 'note-copy-link', 'note-share', 'note-edit', 'note-delete']) expect(screen.getByTestId(id)).toBeInTheDocument();
    expect(within(tree()).getByRole('treeitem', { name: 'Publish Custom Frontend Module' })).toHaveAttribute('aria-selected', 'true');

    expect(screen.queryByTestId('toc')).toBeNull(); // off by default
    await user.click(screen.getByTestId('toc-toggle'));
    expect(screen.getByTestId('toc')).toHaveTextContent('Chuẩn bịBuildPublish và kích hoạtKiểm tra');
    expect(localStorage.getItem('ghi-chu.toc')).toBe('1');
    await user.click(within(screen.getByTestId('toc')).getByText('Build'));
    expect(within(screen.getByTestId('toc')).getByText('Build')).toHaveAttribute('aria-current', 'location');

    // a breadcrumb folder unfolds and focuses it in the tree
    await user.click(screen.getAllByTestId('crumb')[0]);
    await waitFor(() => expect(within(tree()).getByRole('treeitem', { name: 'Sản phẩm' })).toHaveFocus());
  });

  it('a #/note/<id> link opens the note with its folders unfolded; a public note not in my lists is read by id; an unknown one says so', async () => {
    go('NOTMOCK01');
    const { user } = await renderNotes();
    expect(await screen.findByTestId('note-title')).toHaveTextContent('Publish Custom Frontend Module');
    await waitFor(() => expect(within(tree()).getByRole('treeitem', { name: 'Publish Custom Frontend Module' })).toHaveAttribute('aria-selected', 'true'));

    window.location.hash = '#/note/NOTMOCK30';
    expect(await screen.findByText('Thông báo nghỉ lễ', { selector: 'h1' })).toBeInTheDocument();
    expect(screen.getByTestId('note-visibility')).toHaveTextContent('Công khai trong Workspace');
    expect(screen.queryByTestId('note-edit')).toBeNull();

    window.location.hash = '#/note/KHONGCO';
    await waitFor(() => expect(toast()).toHaveTextContent('Không tìm thấy ghi chú này hoặc bạn không có quyền xem.'));
    expect(screen.getByTestId('notes-welcome')).toBeInTheDocument();
    expect(window.location.hash).toBe('');
    await user.click(screen.getAllByTestId('shared-note')[0]);
    expect(screen.getByTestId('shared-by')).toHaveTextContent('Được chia sẻ bởi Nguyễn Thị Lan');
  });

  it('creates a note (plain text, chosen folder): owner me, private, content {text_type: 1}; a title is required', async () => {
    const { user, backend } = await renderNotes();
    await user.click(screen.getByTestId('notes-new'));
    await user.click(screen.getByTestId('note-save'));
    expect(screen.getByTestId('note-error')).toHaveTextContent('Nhập tiêu đề ghi chú');
    expect(screen.getByTestId('note-title-input')).toHaveAttribute('aria-invalid', 'true');

    await user.type(screen.getByTestId('note-title-input'), 'Việc cần nhớ');
    chooseOption(screen.getByTestId('note-format'), 'Văn bản thuần');
    await user.type(screen.getByTestId('note-text'), 'Dòng một');
    chooseOption(screen.getByTestId('note-folder'), 'Cá nhân');
    await user.click(screen.getByTestId('note-save'));
    await screen.findByTestId('note-view');
    const rec = records(backend, 'notes_content').find(r => r.name === 'Việc cần nhớ')!;
    expect(rec).toMatchObject({ owner: ME, visibility: 'private', folder: 'FOLMOCK06', tags: null });
    expect(JSON.parse(rec.content as string)).toEqual({ text_type: 1, value: 'Dòng một' });
    expect(window.location.hash).toBe(`#/note/${rec.id}`);
    expect(toast()).toHaveTextContent('Đã tạo “Việc cần nhớ”');
    expect(screen.getAllByTestId('crumb').map(c => c.textContent)).toEqual(['Cá nhân']);
    expect(within(tree()).getByRole('treeitem', { name: 'Việc cần nhớ' })).toHaveAttribute('aria-selected', 'true');
  });

  it('edits a note: title, Markdown with preview, a new tag (created in notes_tag)', async () => {
    go('NOTMOCK05');
    const { user, backend } = await renderNotes();
    await user.click(await screen.findByTestId('note-edit'));
    expect(screen.getByTestId('note-format')).toHaveAttribute('data-value', '3');
    const title = screen.getByTestId('note-title-input');
    await user.clear(title);
    await user.type(title, 'Rollback nhanh');
    const text = screen.getByTestId('note-text');
    await user.clear(text);
    await user.type(text, '## Bước{enter}{enter}- Kích hoạt lại');
    await user.click(screen.getByTestId('md-preview'));
    expect(screen.getByTestId('md-preview-body').querySelector('h2')).toHaveTextContent('Bước');
    await user.click(screen.getByTestId('tag-add'));
    await user.type(screen.getByTestId('tag-search'), 'khẩn');
    await user.click(await screen.findByTestId('tag-create'));
    expect(screen.getByTestId('tag-chip')).toHaveTextContent('#khẩn');
    await user.click(screen.getByTestId('note-save'));
    await screen.findByTestId('note-view');

    const tag = records(backend, 'notes_tag').find(t => t.name === 'khẩn')!;
    const rec = record(backend, 'notes_content', 'NOTMOCK05')!;
    expect(rec).toMatchObject({ name: 'Rollback nhanh', tags: [tag.id], folder: 'FOLMOCK04' });
    expect(JSON.parse(rec.content as string)).toEqual({ text_type: 3, value: '## Bước\n\n- Kích hoạt lại' });
    expect(screen.getByTestId('note-content').querySelector('h2')).toHaveTextContent('Bước');
    expect(toast()).toHaveTextContent('Đã lưu “Rollback nhanh”');
  });

  it('switching the format converts the content (plain → rich keeps the text)', async () => {
    go('NOTMOCK04');
    const { user, backend } = await renderNotes();
    await user.click(await screen.findByTestId('note-edit'));
    expect(screen.getByTestId('note-format')).toHaveAttribute('data-value', '1');
    chooseOption(screen.getByTestId('note-format'), 'Văn bản định dạng');
    expect(await screen.findByTestId('note-rich')).toHaveTextContent('Gom các module thành ứng dụng trên một desktop chung.');
    await user.click(screen.getByTestId('note-save'));
    await screen.findByTestId('note-view');
    const saved = JSON.parse(record(backend, 'notes_content', 'NOTMOCK04')!.content as string);
    expect(saved.text_type).toBe(2);
    expect(saved.value).toContain('<p>Gom các module thành ứng dụng trên một desktop chung.</p>');
  });

  it('deletes a note after confirmation (its pins go with it); Huỷ keeps it', async () => {
    go('NOTMOCK01');
    const { user, backend } = await renderNotes();
    await user.click(await screen.findByTestId('note-delete'));
    expect(screen.getByTestId('notes-confirm')).toHaveTextContent('“Publish Custom Frontend Module” sẽ bị xoá vĩnh viễn');
    await user.click(screen.getByTestId('notes-confirm-cancel'));
    expect(record(backend, 'notes_content', 'NOTMOCK01')).toBeDefined();
    await user.click(screen.getByTestId('note-delete'));
    await user.click(screen.getByTestId('notes-confirm-ok'));
    await waitFor(() => expect(screen.getByTestId('notes-welcome')).toBeInTheDocument());
    expect(record(backend, 'notes_content', 'NOTMOCK01')).toBeUndefined();
    expect(record(backend, 'notes_pin', 'PINMOCK01')).toBeUndefined();
    expect(screen.getAllByTestId('pinned-note').map(b => b.textContent)).toEqual(['Bảng giá đại lý Q4']);
    expect(toast()).toHaveTextContent('Đã xoá “Publish Custom Frontend Module”');
    expect(window.location.hash).toBe('');
  });

  it('pins (a notes_pin of mine, after the last one) and unpins', async () => {
    go('NOTMOCK02');
    const { user, backend } = await renderNotes();
    await user.click(await screen.findByTestId('note-pin'));
    await waitFor(() => expect(screen.getByTestId('note-pin')).toHaveAttribute('aria-pressed', 'true'));
    const pin = records(backend, 'notes_pin').find(p => p.note === 'NOTMOCK02')!;
    expect(pin).toMatchObject({ person: ME, order: 3 });
    expect(screen.getAllByTestId('pinned-note').map(b => b.textContent)).toContain('Mention trong ghi chú');
    await user.click(screen.getByTestId('note-pin'));
    await waitFor(() => expect(records(backend, 'notes_pin').some(p => p.note === 'NOTMOCK02')).toBe(false));
    expect(toast()).toHaveTextContent('Đã bỏ ghim');
  });

  it('copies the note link', async () => {
    go('NOTMOCK02');
    const { user } = await renderNotes();
    const writeText = (navigator.clipboard ? navigator.clipboard.writeText : undefined) as unknown;
    expect(writeText).toBeDefined(); // user-event installs a clipboard stub
    await user.click(await screen.findByTestId('note-copy-link'));
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/#/note/NOTMOCK02`);
    expect(toast()).toHaveTextContent('Đã sao chép liên kết');
  });
});

describe('NotesApp — editor: "Phóng to"', () => {
  it('covers the pane with the content field (title + Lưu on top), Esc or "Thu nhỏ" goes back; what is typed stays', async () => {
    const { user } = await renderNotes();
    await user.click(screen.getByTestId('notes-new'));
    await user.type(screen.getByTestId('note-title-input'), 'Biên bản họp');
    chooseOption(screen.getByTestId('note-format'), 'Văn bản thuần');
    await user.type(screen.getByTestId('note-text'), 'Dòng một');
    const body = screen.getByTestId('note-body');
    expect(body).not.toHaveAttribute('data-expanded');
    await user.click(screen.getByTestId('note-expand'));
    expect(body).toHaveAttribute('data-expanded', 'true');
    expect(screen.getByTestId('note-expand')).toHaveTextContent('Thu nhỏ');
    expect(screen.getByTestId('note-body-title')).toHaveTextContent('Biên bản họp');
    expect(within(body).getByRole('button', { name: 'Lưu' })).toHaveAttribute('type', 'submit');
    expect(screen.getByTestId('note-text')).toHaveValue('Dòng một');
    await user.type(screen.getByTestId('note-text'), '{Escape}');
    expect(body).not.toHaveAttribute('data-expanded');
    expect(screen.getByTestId('note-editor')).toBeInTheDocument(); // Esc only left "Phóng to"
    await user.click(screen.getByTestId('note-expand'));
    await user.click(screen.getByTestId('note-expand'));
    expect(body).not.toHaveAttribute('data-expanded');
    expect(screen.getByTestId('note-text')).toHaveValue('Dòng một');
  });

  it('has "Phóng to" beside the rich-text label too', async () => {
    const { user } = await renderNotes();
    await user.click(screen.getByTestId('notes-new'));
    const label = await screen.findByText('Nội dung', { selector: '.field-label' });
    expect(label.closest('.field-label-row')).toContainElement(screen.getByTestId('note-expand'));
  });
});

describe('NotesApp — editor: quick new folder', () => {
  it('"＋ Tạo thư mục mới…" at the end of the folder list opens a popup; the new folder is created and picked', async () => {
    const { user, backend } = await renderNotes();
    await user.click(screen.getByTestId('notes-new'));
    const select = screen.getByTestId('note-folder');
    chooseOption(select, 'Sản phẩm');
    expect(select).toHaveAttribute('data-value', 'FOLMOCK01');
    fireEvent.click(select);
    expect(screen.getAllByRole('option').at(-1)).toHaveTextContent('Tạo thư mục mới…'); // shadcn Select, last entry
    fireEvent.keyDown(screen.getAllByRole('option')[0], { key: 'Escape' });

    // Huỷ: nothing created, the folder picked so far stays
    chooseOption(select, 'Tạo thư mục mới…');
    expect(await screen.findByTestId('new-folder-dialog')).toBeInTheDocument();
    expect(select).toHaveAttribute('data-value', 'FOLMOCK01');
    await user.click(within(screen.getByTestId('new-folder-dialog')).getByRole('button', { name: 'Huỷ' }));
    expect(screen.queryByTestId('new-folder-dialog')).toBeNull();
    expect(select).toHaveAttribute('data-value', 'FOLMOCK01');

    chooseOption(select, 'Tạo thư mục mới…');
    const dialog = await screen.findByTestId('new-folder-dialog');
    expect(within(dialog).getByTestId('new-folder-parent')).toHaveAttribute('data-value', 'FOLMOCK01'); // inside the folder picked
    expect(within(dialog).getByTestId('new-folder-name')).toHaveFocus();
    await user.click(within(dialog).getByTestId('new-folder-create'));
    expect(within(dialog).getByTestId('new-folder-error')).toHaveTextContent('Nhập tên thư mục');
    await user.type(within(dialog).getByTestId('new-folder-name'), 'Biên bản');
    chooseOption(within(dialog).getByTestId('new-folder-parent'), 'Không (thư mục gốc)');
    await user.type(within(dialog).getByTestId('new-folder-name'), '{Enter}'); // Enter in the name creates it
    await waitFor(() => expect(screen.queryByTestId('new-folder-dialog')).toBeNull());
    const created = records(backend, 'notes_cat').find(f => f.name === 'Biên bản')!;
    expect(created).toMatchObject({ parent_folder: null, owner: ME });
    expect(select).toHaveAttribute('data-value', created.id as string);
    expect(select).toHaveTextContent('Biên bản');
    expect(screen.getByTestId('note-editor')).toBeInTheDocument(); // still writing the note
    expect(toast()).toHaveTextContent('Đã tạo thư mục “Biên bản”');
  });
});

describe('NotesApp — sharing and rights', () => {
  it('shares with a department (view) and a person (edit): visibility + the four lists are saved', async () => {
    go('NOTMOCK02');
    const { user, backend } = await renderNotes();
    expect(await screen.findByTestId('note-share')).not.toHaveAttribute('data-on'); // private: not blue
    expect(screen.getByTestId('note-share')).toHaveAccessibleName('Chia sẻ');
    await user.click(await screen.findByTestId('note-share'));
    const dialog = screen.getByTestId('share-dialog');
    expect(within(dialog).getByTestId('share-vis-private')).toBeChecked();
    expect(within(dialog).getByTestId('share-add')).toBeDisabled(); // lists only count while shared
    await user.click(within(dialog).getByTestId('share-vis-shared'));
    await user.click(within(dialog).getByTestId('share-add'));
    await user.type(await screen.findByTestId('share-search'), 'kinh');
    await user.click(await screen.findByTestId('share-option-department'));
    await user.click(within(dialog).getByTestId('share-add'));
    await user.type(await screen.findByTestId('share-search'), 'lan');
    await user.click(await screen.findByTestId('share-option-person'));
    const rows = within(dialog).getAllByTestId('share-entry');
    expect(rows.map(r => r.textContent)).toEqual([expect.stringContaining('Phòng Kinh doanh'), expect.stringContaining('Nguyễn Thị Lan')]);
    chooseOption(within(rows[1]).getByTestId('share-role'), 'Có thể sửa');
    await user.click(within(dialog).getByTestId('share-save'));
    await waitFor(() => expect(screen.queryByTestId('share-dialog')).toBeNull());
    expect(record(backend, 'notes_content', 'NOTMOCK02')).toMatchObject({
      visibility: 'shared', viewers: null, editors: ['PERMOCK00002'], viewer_departments: ['DEPMOCK02'], editor_departments: null,
    });
    expect(screen.getByTestId('note-visibility')).toHaveTextContent('Chia sẻ cho người hoặc phòng');
    expect(toast()).toHaveTextContent('Đã cập nhật chia sẻ');
    // the share button turns blue while the note is shared
    expect(screen.getByTestId('note-share')).toHaveAttribute('data-on', 'true');
    expect(screen.getByTestId('note-share')).toHaveAccessibleName('Chia sẻ (đang chia sẻ cho người / phòng)');
  });

  it('a note shared to view: no edit, share or delete; a note shared to edit: editable, but not movable', async () => {
    go('NOTMOCK20');
    const { user, backend } = await renderNotes();
    expect(await screen.findByTestId('shared-by')).toHaveTextContent('Nguyễn Thị Lan');
    for (const id of ['note-edit', 'note-share', 'note-delete']) expect(screen.queryByTestId(id)).toBeNull();
    await user.click(screen.getByText('Checklist onboarding'));
    await user.click(await screen.findByTestId('note-edit'));
    expect(screen.queryByTestId('note-folder')).toBeNull();
    const title = screen.getByTestId('note-title-input');
    await user.clear(title);
    await user.type(title, 'Checklist onboarding v2');
    await user.click(screen.getByTestId('note-save'));
    await screen.findByTestId('note-view');
    expect(record(backend, 'notes_content', 'NOTMOCK22')).toMatchObject({ name: 'Checklist onboarding v2', folder: null, owner: 'PERMOCK00002' });
  });
});

describe('NotesApp — folders', () => {
  it('creates a folder in place (Enter), renames it (F2), refuses to delete a folder with notes, deletes an empty one', async () => {
    const { user, backend } = await renderNotes();
    await user.click(screen.getByTestId('new-folder'));
    await user.type(screen.getByTestId('folder-name-input'), 'Dự án{enter}');
    await waitFor(() => expect(treeNames()).toContain('Dự án'));
    const created = records(backend, 'notes_cat').find(f => f.name === 'Dự án')!;
    expect(created).toMatchObject({ parent_folder: null, owner: ME });

    const row = within(tree()).getByRole('treeitem', { name: 'Dự án' });
    row.focus();
    fireEvent.keyDown(row, { key: 'F2' });
    const box = screen.getByTestId('folder-name-input');
    await user.clear(box);
    await user.type(box, 'Dự án 2026{enter}');
    await waitFor(() => expect(record(backend, 'notes_cat', created.id as string)!.name).toBe('Dự án 2026'));
    expect(toast()).toHaveTextContent('Đã đổi tên thành “Dự án 2026”');

    // the ⋯ menu of a folder
    const product = within(tree()).getByRole('treeitem', { name: 'Sản phẩm' });
    await user.click(within(product).getAllByTestId('folder-menu')[0]);
    await user.click(await screen.findByRole('menuitem', { name: 'Xoá thư mục' }));
    expect(toast()).toHaveTextContent('“Sản phẩm” còn ghi chú hoặc thư mục con');
    expect(screen.queryByTestId('notes-confirm')).toBeNull();

    const personal = within(tree()).getByRole('treeitem', { name: 'Cá nhân' });
    await user.click(within(personal).getByTestId('folder-menu'));
    await user.click(await screen.findByRole('menuitem', { name: 'Xoá thư mục' }));
    await user.click(screen.getByTestId('notes-confirm-ok'));
    await waitFor(() => expect(record(backend, 'notes_cat', 'FOLMOCK06')).toBeUndefined());
    expect(treeNames()).not.toContain('Cá nhân');
  });

  it('a sub-folder from the folder menu, and a new note in a folder', async () => {
    const { user, backend } = await renderNotes();
    const ops = within(tree()).getByRole('treeitem', { name: 'Vận hành' });
    await user.click(within(ops).getByTestId('folder-menu'));
    await user.click(await screen.findByRole('menuitem', { name: 'Thư mục con mới' }));
    await user.type(screen.getByTestId('folder-name-input'), 'Sự cố{enter}');
    await waitFor(() => expect(records(backend, 'notes_cat').find(f => f.name === 'Sự cố')).toMatchObject({ parent_folder: 'FOLMOCK04' }));
    expect(within(tree()).getByRole('treeitem', { name: 'Vận hành' })).toHaveAttribute('aria-expanded', 'true');

    await user.click(within(within(tree()).getByRole('treeitem', { name: 'Vận hành' })).getAllByTestId('folder-menu')[0]);
    await user.click(await screen.findByRole('menuitem', { name: 'Ghi chú mới trong thư mục này' }));
    expect(screen.getByTestId('note-folder')).toHaveAttribute('data-value', 'FOLMOCK04');
    await user.click(screen.getByTestId('note-cancel'));
    expect(screen.getByTestId('notes-welcome')).toBeInTheDocument();

    // Esc on a new folder name gives up
    await user.click(screen.getByTestId('new-folder'));
    await user.type(screen.getByTestId('folder-name-input'), 'Bỏ{Escape}');
    expect(screen.queryByTestId('folder-name-input')).toBeNull();
    expect(records(backend, 'notes_cat').some(f => f.name === 'Bỏ')).toBe(false);
  });
});

describe('NotesApp — folders: the header button', () => {
  it('creates at the top level even when a note of a sub-folder is open', async () => {
    go('NOTMOCK01'); // in Sản phẩm › Custom Module › Frontend
    const { user, backend } = await renderNotes();
    await screen.findByTestId('note-view');
    await user.click(screen.getByTestId('new-folder'));
    await user.type(screen.getByTestId('folder-name-input'), 'Gốc mới{enter}');
    await waitFor(() => expect(treeNames()).toContain('Gốc mới'));
    expect(records(backend, 'notes_cat').find(f => f.name === 'Gốc mới')).toMatchObject({ parent_folder: null });
  });
});

describe('NotesApp — drag and drop in the tree (CONTRACT §9.3)', () => {
  let pointed: Element | null = null;
  const press = (el: Element) => fireEvent.pointerDown(el, { button: 0, clientX: 10, clientY: 10 });
  const moveOver = (el: Element | null) => {
    pointed = el;
    fireEvent.pointerMove(window, { clientX: 40, clientY: 40 });
  };
  const rowOf = (name: string) => within(tree()).getByRole('treeitem', { name }).querySelector('.row')!;
  beforeEach(() => {
    pointed = null;
    document.elementFromPoint = (() => pointed) as typeof document.elementFromPoint;
  });

  it('drops a folder into another folder, then back to the top level through the header', async () => {
    const { user, backend } = await renderNotes();
    await user.click(screen.getByTestId('expand-all'));
    press(rowOf('Họp'));
    moveOver(rowOf('Cá nhân'));
    expect(rowOf('Cá nhân')).toHaveAttribute('data-drop-target', 'ok');
    expect(rowOf('Họp')).toHaveAttribute('data-dragging', 'true');
    expect(screen.getByTestId('drag-ghost')).toHaveTextContent('Họp');
    expect(screen.getByTestId('tree-root-drop')).toHaveTextContent('Thả vào đây để đưa ra thư mục gốc');
    fireEvent.pointerUp(window);
    await waitFor(() => expect(record(backend, 'notes_cat', 'FOLMOCK05')!.parent_folder).toBe('FOLMOCK06'));
    expect(toast()).toHaveTextContent('Đã chuyển thư mục “Họp” vào “Cá nhân”');
    expect(screen.queryByTestId('drag-ghost')).toBeNull();
    expect(rowOf('Họp').closest('[role="group"]')!.closest('[role="treeitem"]')).toHaveAttribute('aria-label', 'Cá nhân');

    press(rowOf('Họp'));
    moveOver(null); // the drag starts: the header becomes the drop zone of the top level
    moveOver(screen.getByTestId('tree-root-drop'));
    expect(screen.getByTestId('tree-root-drop')).toHaveAttribute('data-drop-target', 'ok');
    fireEvent.pointerUp(window);
    await waitFor(() => expect(record(backend, 'notes_cat', 'FOLMOCK05')!.parent_folder).toBeNull());
    expect(toast()).toHaveTextContent('Đã chuyển thư mục “Họp” ra thư mục gốc');
  });

  it('drops a note into a folder; refuses a folder into its own sub-folder; Esc cancels; a click is not a drag', async () => {
    const { user, backend } = await renderNotes();
    await user.click(screen.getByTestId('expand-all'));
    press(rowOf('Ý tưởng dock ứng dụng'));
    moveOver(rowOf('Vận hành'));
    fireEvent.pointerUp(window);
    await waitFor(() => expect(record(backend, 'notes_content', 'NOTMOCK04')!.folder).toBe('FOLMOCK04'));
    expect(toast()).toHaveTextContent('Đã chuyển “Ý tưởng dock ứng dụng” vào “Vận hành”');

    const calls = backend.calls.length;
    press(rowOf('Sản phẩm'));
    moveOver(rowOf('Frontend'));
    expect(rowOf('Frontend')).toHaveAttribute('data-drop-target', 'no');
    fireEvent.pointerUp(window);
    press(rowOf('Sản phẩm'));
    moveOver(rowOf('Cá nhân'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('drag-ghost')).toBeNull();
    fireEvent.pointerUp(window);
    // a press without moving is a plain click (no drag)
    press(rowOf('Cá nhân'));
    fireEvent.pointerUp(window);
    expect(screen.queryByTestId('drag-ghost')).toBeNull();
    expect(backend.calls.length).toBe(calls); // nothing written
  });
});

describe('NotesApp — states and shortcuts', () => {
  it('session expired / error with retry', async () => {
    await renderNotes({}, { scenario: 'expired' });
    expect(screen.getByTestId('session-expired')).toBeInTheDocument();
  });

  it('shows the error and retries', async () => {
    let fail = true;
    const { user } = await renderNotes({}, { override: path => (fail && path === '/api/v1/records/list' ? jsonResponse({ r: 500, msg: 'Lỗi thử' }) : undefined) });
    expect(screen.getByTestId('app-error')).toHaveTextContent('Lỗi thử');
    fail = false;
    await user.click(screen.getByTestId('app-retry'));
    await waitFor(() => expect(screen.getByTestId('notes-tree')).toBeInTheDocument());
  });

  it('"n" opens a new note and "/" the search — not while the window is minimised', async () => {
    const win: WindowApi = { maximized: false, hidden: true, onClose() {}, onMinimize() {}, onToggleMax() {} };
    const { view } = await renderNotes({}, {}, win);
    fireEvent.keyDown(document.body, { key: 'n' });
    expect(screen.queryByTestId('note-editor')).toBeNull();
    view.rerender(<NotesApp win={{ ...win, hidden: false }} />);
    fireEvent.keyDown(document.body, { key: '/' });
    expect(screen.getByTestId('notes-search')).toHaveFocus();
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: 'n' });
    expect(screen.getByTestId('note-editor')).toBeInTheDocument();
  });
});
