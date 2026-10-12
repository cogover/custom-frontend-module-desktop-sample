import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Value } from 'platejs';
import type { PlateEditor } from 'platejs/react';
import { describe, expect, it, vi } from 'vitest';
import { htmlToValue, valueToHtml } from './html';
import type { InlineImage } from '../domain/inlineImages';
import RichTextEditor, { editorFor, type EditorHandle, type ImageStatus, type RichTextEditorProps } from './RichTextEditor';

function setup(html = '<p>Xin chào</p>', extra: Partial<RichTextEditorProps> = {}) {
  const onReady = vi.fn<(h: EditorHandle, v: Value) => void>();
  const user = userEvent.setup();
  render(
    <RichTextEditor id="desc" label="Mô tả" placeholder="Ghi chú về việc cần làm" initialValue={htmlToValue(html).value} onReady={onReady} {...extra} />,
  );
  const box = screen.getByTestId('field-desc');
  const editor = editorFor(box)!;
  const html$ = () => valueToHtml(editor.children);
  const selectAll = () => act(() => editor.tf.select({ anchor: editor.api.start([])!, focus: editor.api.end([])! }));
  const caretAtEnd = () => act(() => editor.tf.select(editor.api.end([])));
  const type = (text: string) =>
    act(() => {
      for (const ch of text) editor.tf.insertText(ch);
    });
  return { user, box, editor, onReady, html: html$, selectAll, caretAtEnd, type };
}

const pressed = (id: string) => screen.getByTestId(`rte-${id}`).getAttribute('aria-pressed');

describe('RichTextEditor (Plate)', () => {
  it('is a labelled multi-line textbox with the toolbar of the contract and hands its document over', () => {
    const { box, onReady, editor } = setup();
    expect(box).toHaveAttribute('role', 'textbox');
    expect(box).toHaveAttribute('contenteditable', 'true');
    expect(box).toHaveAccessibleName('Mô tả');
    expect(box).toHaveAttribute('aria-multiline', 'true');
    expect(screen.getByRole('toolbar', { name: 'Định dạng mô tả' })).toBe(screen.getByTestId('rte-toolbar'));
    const ids = Array.from(screen.getByTestId('rte-toolbar').querySelectorAll('button')).map(b => b.dataset.testid);
    expect(ids).toEqual(
      ['bold', 'italic', 'underline', 'strike', 'code', 'h1', 'h2', 'h3', 'ul', 'ol', 'quote', 'link', 'undo', 'redo'].map(id => `rte-${id}`),
    );
    expect(screen.getByTestId('rte-bold')).toHaveAccessibleName('Đậm (Ctrl+B)');
    expect(onReady).toHaveBeenCalledTimes(1);
    const [handle, normalized] = onReady.mock.calls[0];
    expect(valueToHtml(normalized)).toBe('<p>Xin chào</p>');
    expect(handle.getValue()).toBe(editor.children);
  });

  it('toggles marks on the selection from the toolbar and shows them pressed', async () => {
    const { user, html, selectAll } = setup();
    selectAll();
    for (const id of ['bold', 'italic', 'underline', 'strike', 'code']) {
      expect(pressed(id)).toBe('false');
      await user.click(screen.getByTestId(`rte-${id}`));
      expect(pressed(id)).toBe('true');
    }
    expect(html()).toBe('<p><strong><em><u><s><code>Xin chào</code></s></u></em></strong></p>');
    await user.click(screen.getByTestId('rte-bold'));
    expect(pressed('bold')).toBe('false');
    expect(html()).toBe('<p><em><u><s><code>Xin chào</code></s></u></em></p>');
  });

  it('turns blocks into headings, lists and quotes and back', async () => {
    const { user, html, caretAtEnd } = setup();
    caretAtEnd();
    for (const [id, out] of [
      ['h1', '<h1>Xin chào</h1>'],
      ['h2', '<h2>Xin chào</h2>'],
      ['h3', '<h3>Xin chào</h3>'],
    ] as const) {
      await user.click(screen.getByTestId(`rte-${id}`));
      expect(html()).toBe(out);
      expect(pressed(id)).toBe('true');
    }
    await user.click(screen.getByTestId('rte-h3'));
    expect(html()).toBe('<p>Xin chào</p>');
    await user.click(screen.getByTestId('rte-ul'));
    expect(html()).toBe('<ul><li>Xin chào</li></ul>');
    expect(pressed('ul')).toBe('true');
    await user.click(screen.getByTestId('rte-ol'));
    expect(html()).toBe('<ol><li>Xin chào</li></ol>');
    expect(pressed('ol')).toBe('true');
    expect(pressed('ul')).toBe('false');
    await user.click(screen.getByTestId('rte-ol'));
    expect(html()).toBe('<p>Xin chào</p>');
    await user.click(screen.getByTestId('rte-quote'));
    expect(html()).toBe('<blockquote><p>Xin chào</p></blockquote>');
    expect(pressed('quote')).toBe('true');
  });

  it('understands Markdown shortcuts while typing', () => {
    const { editor, html, caretAtEnd, type } = setup('');
    caretAtEnd();
    type('# Kế hoạch');
    act(() => editor.tf.insertBreak());
    type('- việc một');
    act(() => editor.tf.insertBreak());
    type('việc hai');
    act(() => {
      editor.tf.insertBreak();
      editor.tf.insertBreak(); // empty item leaves the list
    });
    type('1. bước');
    act(() => {
      editor.tf.insertBreak();
      editor.tf.insertBreak();
    });
    type('> ghi chú');
    act(() => {
      editor.tf.insertBreak();
      editor.tf.insertBreak();
    });
    type('**đậm** *nghiêng* __gạch__ ~~bỏ~~ `mã`');
    expect(html()).toBe(
      '<h1>Kế hoạch</h1><ul><li>việc một</li><li>việc hai</li></ul><ol><li>bước</li></ol><blockquote><p>ghi chú</p></blockquote>' +
        '<p><strong>đậm</strong> <em>nghiêng</em> <u>gạch</u> <s>bỏ</s> <code>mã</code></p>',
    );
  });

  it('turns a typed URL into a link once a space or Enter follows (http, https only)', () => {
    const { editor, html, caretAtEnd, type } = setup('');
    caretAtEnd();
    type('xem http://localhost:5317/?app=tasks#/task/T1 ngay');
    act(() => editor.tf.insertBreak());
    type('https://acme.cogover.example/a');
    act(() => editor.tf.insertBreak());
    type('ftp://x.com chưa');
    expect(html()).toBe(
      '<p>xem <a href="http://localhost:5317/?app=tasks#/task/T1" target="_blank" rel="noopener noreferrer">http://localhost:5317/?app=tasks#/task/T1</a> ngay</p>' +
        '<p><a href="https://acme.cogover.example/a" target="_blank" rel="noopener noreferrer">https://acme.cogover.example/a</a></p><p>ftp://x.com chưa</p>',
    );
  });

  it('undoes and redoes, the buttons enabled only when there is something to undo or redo', async () => {
    const { user, html, caretAtEnd, type } = setup();
    expect(screen.getByTestId('rte-undo')).toBeDisabled();
    expect(screen.getByTestId('rte-redo')).toBeDisabled();
    caretAtEnd();
    type(' bạn');
    expect(html()).toBe('<p>Xin chào bạn</p>');
    await waitFor(() => expect(screen.getByTestId('rte-undo')).toBeEnabled());
    await user.click(screen.getByTestId('rte-undo'));
    expect(html()).toBe('<p>Xin chào</p>');
    await user.click(screen.getByTestId('rte-redo'));
    expect(html()).toBe('<p>Xin chào bạn</p>');
  });

  it('adds, changes and removes a link from the link popover (only http, https, mailto)', async () => {
    const { user, html, selectAll } = setup();
    selectAll();
    await user.click(screen.getByTestId('rte-link'));
    const input = screen.getByTestId('rte-link-input');
    expect(input).toHaveFocus();
    expect(screen.queryByTestId('rte-link-remove')).toBeNull();
    await user.type(input, 'javascript:alert(1)');
    await user.click(screen.getByTestId('rte-link-save'));
    expect(screen.getByTestId('rte-link-popover')).toHaveTextContent('Nhập liên kết bắt đầu bằng http://, https:// hoặc mailto:');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    await user.clear(input);
    await user.type(input, 'cogover.com/tai-lieu{Enter}'); // no scheme → https://
    expect(screen.queryByTestId('rte-link-popover')).toBeNull();
    expect(html()).toBe('<p><a href="https://cogover.com/tai-lieu" target="_blank" rel="noopener noreferrer">Xin chào</a></p>');
    expect(pressed('link')).toBe('true');

    // change it, then remove it
    selectAll();
    await user.click(screen.getByTestId('rte-link'));
    expect(screen.getByTestId('rte-link-input')).toHaveValue('https://cogover.com/tai-lieu');
    await user.clear(screen.getByTestId('rte-link-input'));
    await user.type(screen.getByTestId('rte-link-input'), 'support@example.test');
    await user.click(screen.getByTestId('rte-link-save'));
    expect(html()).toBe('<p><a href="mailto:support@example.test" target="_blank" rel="noopener noreferrer">Xin chào</a></p>');
    selectAll();
    await user.click(screen.getByTestId('rte-link'));
    await user.click(screen.getByTestId('rte-link-remove'));
    expect(html()).toBe('<p>Xin chào</p>');
  });

  it('opens the link popover with Ctrl/Cmd+K; Esc closes only the popover', async () => {
    const { user, box, selectAll } = setup();
    selectAll();
    fireEvent.keyDown(box, { key: 'k', ctrlKey: true });
    expect(await screen.findByTestId('rte-link-popover')).toBeInTheDocument();
    const outer = vi.fn();
    document.addEventListener('keydown', outer);
    await user.keyboard('{Escape}');
    document.removeEventListener('keydown', outer);
    expect(screen.queryByTestId('rte-link-popover')).toBeNull();
    fireEvent.keyDown(box, { key: 'k', metaKey: true });
    expect(await screen.findByTestId('rte-link-popover')).toBeInTheDocument();
  });

  it('closes the link popover with its ✕ button without changing the text', async () => {
    const { user, html, selectAll, editor } = setup();
    selectAll();
    await user.click(screen.getByTestId('rte-link'));
    await user.type(screen.getByTestId('rte-link-input'), 'cogover.com');
    const close = screen.getByTestId('rte-link-close');
    expect(close).toHaveAccessibleName('Đóng');
    expect(close).toHaveAttribute('title', 'Đóng (Esc)');
    await user.click(close);
    expect(screen.queryByTestId('rte-link-popover')).toBeNull();
    expect(html()).toBe('<p>Xin chào</p>'); // nothing applied
    expect(editor.selection).not.toBeNull(); // back in the editor with the old selection
  });

  it('pastes HTML through the same cleaner as stored descriptions: formatting, safe links, linked pictures', () => {
    const { editor, html, caretAtEnd } = setup();
    caretAtEnd();
    act(() => editor.tf.insertBreak());
    const data: Record<string, string> = {
      'text/html':
        '<meta charset="utf-8"><p style="color:red">dán <b>đậm</b> <a href="https://x.test">link</a> <a href="javascript:alert(1)">xấu</a><img src="/a.png"></p>' +
        '<ul><li>A<ul><li>A1</li></ul></li></ul><table><tr><td>Ô 1</td><td>Ô 2</td></tr></table><script>alert(1)</script>',
      'text/plain': 'dán đậm link',
    };
    const transfer = { types: Object.keys(data), getData: (t: string) => data[t] ?? '', files: [], items: [] } as unknown as DataTransfer;
    act(() => editor.tf.insertData(transfer));
    expect(html()).toBe(
      '<p>Xin chào</p><p>dán <strong>đậm</strong> <a href="https://x.test" target="_blank" rel="noopener noreferrer">link</a> xấu<img src="/a.png"></p>' +
        '<ul><li>A<ul><li>A1</li></ul></li></ul><p>Ô 1 Ô 2</p>',
    );
    // plain text keeps Plate's own handling
    const plain = { types: ['text/plain'], getData: (t: string) => (t === 'text/plain' ? 'chữ thường' : ''), files: [], items: [] } as unknown as DataTransfer;
    act(() => editor.tf.insertData(plain));
    expect(html()).toContain('<p>Ô 1 Ô 2chữ thường</p>');
  });

  it('shows existing images and lets them be deleted', () => {
    const { editor, box, html } = setup('<p>Ảnh:</p><p><img src="/files/0/F1/original/x.png" alt="Sơ đồ"></p>');
    const img = box.querySelector('img')!;
    expect(img).toHaveAttribute('src', '/files/0/F1/original/x.png');
    expect(img).toHaveAttribute('alt', 'Sơ đồ');
    expect(img.closest('[contenteditable="false"]')).not.toBeNull();
    act(() => {
      const [, path] = editor.api.node({ at: [], match: { type: 'img' } })!;
      editor.tf.removeNodes({ at: path });
    });
    expect(html()).toBe('<p>Ảnh:</p>');
  });

  it('has a single Tab stop: arrows move along the toolbar', async () => {
    const { user } = setup();
    const bold = screen.getByTestId('rte-bold');
    expect(bold).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('rte-italic')).toHaveAttribute('tabindex', '-1');
    act(() => bold.focus());
    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('rte-italic')).toHaveFocus();
    expect(screen.getByTestId('rte-italic')).toHaveAttribute('tabindex', '0');
    expect(bold).toHaveAttribute('tabindex', '-1');
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByTestId('rte-link')).toHaveFocus(); // wraps round, skipping the disabled undo/redo
    await user.keyboard('{Home}');
    expect(bold).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByTestId('rte-link')).toHaveFocus();
  });

  it('keeps the caret in the editor when a toolbar button is pressed with the mouse', () => {
    setup();
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    screen.getByTestId('rte-bold').dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
  });

  it('applies a toolbar action at the end when the editor has no selection yet', async () => {
    const { user, html, editor } = setup();
    expect(editor.selection).toBeNull();
    await user.click(screen.getByTestId('rte-h2'));
    expect(html()).toBe('<h2>Xin chào</h2>');
    expect((editor as PlateEditor).selection).not.toBeNull();
  });
});

describe('RichTextEditor lifetime', () => {
  it('hands its last document over when it goes away', () => {
    const onDetach = vi.fn();
    const { unmount } = render(
      <RichTextEditor id="d" label="Mô tả" placeholder="" initialValue={htmlToValue('<p>a</p>').value} onReady={() => {}} onDetach={onDetach} />,
    );
    const editor = editorFor(screen.getByTestId('field-desc'))!;
    act(() => {
      editor.tf.select(editor.api.end([]));
      editor.tf.insertText('b');
    });
    unmount();
    expect(onDetach).toHaveBeenCalledTimes(1);
    expect(valueToHtml(onDetach.mock.calls[0][0])).toBe('<p>ab</p>');
  });
});

describe('pictures pasted into the description (uploaded like Cogover’s editor)', () => {
  const PNG = `data:image/png;base64,${btoa('\x89PNG\r\n\x1a\nfake')}`;
  const transfer = (data: Record<string, string>, files: File[] = []) =>
    ({ types: [...Object.keys(data), ...(files.length ? ['Files'] : [])], getData: (t: string) => data[t] ?? '', files, items: [] }) as unknown as DataTransfer;
  const uploadedImg = (id: string): InlineImage => ({
    src: `https://w.test/files/0/${id}/original/anh.png?redirect=true&long_text_field_id=OFDEMOTASKDSC`,
    fileId: id,
    meta: { file_id: id },
  });
  function deferred() {
    const calls: { file: File; resolve: (i: InlineImage) => void; reject: (e: unknown) => void }[] = [];
    const uploadImage = vi.fn(
      (file: File) => new Promise<InlineImage>((resolve, reject) => calls.push({ file, resolve, reject })),
    );
    return { uploadImage, calls };
  }
  function setupWithUploads(html?: string) {
    const d = deferred();
    const statuses: ImageStatus[] = [];
    const uploaded: InlineImage[] = [];
    const ctx = setup(html, { uploadImage: d.uploadImage, onImageStatus: st => statuses.push(st), onImageUploaded: i => uploaded.push(i) });
    ctx.caretAtEnd();
    act(() => ctx.editor.tf.insertBreak());
    return { ...ctx, ...d, statuses, uploaded };
  }

  it('shows a pasted data: picture at once, uploads it, then points it at the uploaded file; web links stay', async () => {
    const t = setupWithUploads();
    act(() => t.editor.tf.insertData(transfer({ 'text/html': `<p>Ảnh <img src="${PNG}"> và <img src="https://cdn.test/a.png"></p>` })));
    await waitFor(() => expect(t.uploadImage).toHaveBeenCalledTimes(1)); // only the data: one
    expect(t.calls[0].file).toMatchObject({ type: 'image/png', name: 'anh-mo-ta.png' });
    expect(t.statuses.at(-1)).toEqual({ pending: 1, error: '' });
    expect(t.html()).toContain(PNG);
    await act(async () => t.calls[0].resolve(uploadedImg('F1')));
    await waitFor(() => expect(t.statuses.at(-1)).toEqual({ pending: 0, error: '' }));
    expect(t.html()).toBe(
      '<p>Xin chào</p><p>Ảnh <img src="https://w.test/files/0/F1/original/anh.png?redirect=true&amp;long_text_field_id=OFDEMOTASKDSC"> và <img src="https://cdn.test/a.png"></p>',
    );
    expect(t.uploaded).toEqual([uploadedImg('F1')]);
  });

  it('takes a picture that cannot be uploaded out again and says why', async () => {
    const t = setupWithUploads();
    act(() => t.editor.tf.insertData(transfer({ 'text/html': `<p>Ảnh <img src="${PNG}"></p>` })));
    await waitFor(() => expect(t.calls).toHaveLength(1));
    await act(async () => t.calls[0].reject(new Error('file type not allowed')));
    await waitFor(() => expect(t.statuses.at(-1)).toEqual({ pending: 0, error: 'Không tải được ảnh dán vào: Không nhận loại file .png' }));
    expect(t.html()).toBe('<p>Xin chào</p><p>Ảnh </p>');
    expect(t.uploaded).toEqual([]);
  });

  it('uploads a picture pasted as a file (screenshot), shown from a blob: URL meanwhile', async () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/1');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const t = setupWithUploads();
    const shot = new File(['png'], 'image.png', { type: 'image/png' });
    // "Copy image" also puts an <img> in the HTML: the file itself is used
    act(() => t.editor.tf.insertData(transfer({ 'text/html': '<img src="https://site.test/x.png">' }, [shot])));
    await waitFor(() => expect(t.calls).toHaveLength(1));
    expect(t.calls[0].file).toBe(shot);
    // shown from the blob: URL (never part of the saved HTML: saving waits for the upload)
    expect(JSON.stringify(t.editor.children)).toContain('blob:http://localhost/1');
    expect(t.html()).not.toContain('blob:');
    await act(async () => t.calls[0].resolve(uploadedImg('F2')));
    await waitFor(() => expect(t.html()).toContain('/files/0/F2/original/'));
    create.mockRestore();
    revoke.mockRestore();
  });

  it('Word: the file:// pictures are taken from the clipboard RTF and uploaded', async () => {
    const t = setupWithUploads();
    const rtf = '{\\rtf1{\\*\\shppict{\\pict{\\*\\picprop{\\sp{\\sn a}{\\sv 1}}}\\pngblip\\bliptag5 89504e470d0a1a0a00}}{\\nonshppict{\\pict\\wmetafile8 0100}}}';
    act(() =>
      t.editor.tf.insertData(
        transfer({ 'text/html': '<p class=MsoNormal>Sơ đồ <img src="file:///C:/Temp/msohtmlclip1/01/clip_image001.png"></p>', 'text/rtf': rtf }),
      ),
    );
    await waitFor(() => expect(t.calls).toHaveLength(1));
    const bytes = new Uint8Array(await t.calls[0].file.arrayBuffer());
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    await act(async () => t.calls[0].resolve(uploadedImg('F3')));
    await waitFor(() => expect(t.html()).toContain('/files/0/F3/original/'));
  });

  it('drops Word pictures it cannot recover, and pictures that are already stored are never re-uploaded', async () => {
    const t = setupWithUploads(`<p>Cũ <img src="${PNG}"></p>`);
    act(() => t.editor.tf.insertData(transfer({ 'text/html': '<p>Mới <img src="file:///C:/Temp/clip_image001.emz"></p>' })));
    await act(async () => {});
    expect(t.uploadImage).not.toHaveBeenCalled();
    expect(t.html()).toBe(`<p>Cũ <img src="${PNG}"></p><p>Mới</p>`);
  });

  it('without an uploader, pasted data:/blob: pictures are left out (they could not be saved); links stay', () => {
    const { editor, html, caretAtEnd } = setup();
    caretAtEnd();
    act(() => editor.tf.insertBreak());
    act(() => editor.tf.insertData(transfer({ 'text/html': `<p>A<img src="${PNG}">B<img src="https://cdn.test/a.png"></p>` })));
    expect(html()).toBe('<p>Xin chào</p><p>AB<img src="https://cdn.test/a.png"></p>');
  });
});
