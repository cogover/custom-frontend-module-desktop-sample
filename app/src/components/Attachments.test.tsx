import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { parseAttachments, type Attachment } from '../domain/attachments';
import { AttachButton, AttachmentChips, AttachmentErrors, AttachmentLinks, useAttachmentUploads } from './Attachments';

const meta = (id: string, name: string, size = 2048) => ({ file_id: id, fileName: name, fileSize: size, fileType: '', acl: 'private' });
const file = (name: string, size = 10, type = 'application/pdf') => new File([new Uint8Array(size)], name, { type });

/** Deferred uploads: each call waits until the test settles it. */
function deferredUpload() {
  const pending: { name: string; signal: AbortSignal; resolve: (a: Attachment) => void; reject: (e: unknown) => void }[] = [];
  const upload = vi.fn(
    (f: File, signal: AbortSignal) =>
      new Promise<Attachment>((resolve, reject) => pending.push({ name: f.name, signal, resolve, reject })),
  );
  const done = async (i: number, id = `F${i}`) => {
    const p = pending[i];
    await act(async () => p.resolve(parseAttachments([meta(id, p.name, 4096)])[0]));
  };
  const fail = async (i: number, msg: string) => {
    await act(async () => pending[i].reject(new Error(msg)));
  };
  return { upload, pending, done, fail };
}

function Harness({ initial = [], upload }: { initial?: Attachment[]; upload: (f: File, s: AbortSignal) => Promise<Attachment> }) {
  const files = useAttachmentUploads(initial, upload);
  return (
    <div>
      <AttachButton onFiles={files.addFiles} />
      <AttachmentChips items={files.items} onRemove={files.remove} />
      <AttachmentErrors items={files.failed} />
      <p data-testid="state">
        {files.uploading ? 'uploading' : 'idle'}|{files.attachments.map(a => a.fileId).join(',')}
      </p>
      {files.note && <p data-testid="note">{files.note}</p>}
    </div>
  );
}

const pick = (files: File[]) => fireEvent.change(screen.getByTestId('attach-input'), { target: { files } });
const chips = () => screen.queryAllByTestId('attach-chip');
const states = () => chips().map(c => c.dataset.state);

describe('attachment uploads in the form', () => {
  it('starts with the task files and uploads new ones right away, at most 3 at a time', async () => {
    const d = deferredUpload();
    render(<Harness initial={parseAttachments([meta('OLD', 'cu.pdf')])} upload={d.upload} />);
    expect(states()).toEqual(['done']);
    expect(screen.getByTestId('state')).toHaveTextContent('idle|OLD');
    pick(['a.pdf', 'b.png', 'c.xlsx', 'd.docx', 'e.zip'].map(n => file(n)));
    expect(states()).toEqual(['done', 'uploading', 'uploading', 'uploading', 'uploading', 'uploading']);
    expect(d.upload).toHaveBeenCalledTimes(3); // the other two wait
    expect(screen.getByTestId('state')).toHaveTextContent('uploading|OLD');
    expect(chips()[1]).toHaveTextContent('Đang tải…');
    await d.done(0);
    expect(d.upload).toHaveBeenCalledTimes(4);
    await d.fail(1, 'file type not allowed');
    expect(d.upload).toHaveBeenCalledTimes(5);
    await d.done(2);
    await d.done(3);
    await d.done(4);
    expect(states()).toEqual(['done', 'done', 'error', 'done', 'done', 'done']);
    expect(chips()[2]).toHaveAttribute('title', 'b.png: Không nhận loại file .png');
    expect(chips()[2]).toHaveTextContent('Lỗi');
    // the reason is spelled out under the chips, not only in the tooltip
    expect(screen.getAllByTestId('attach-error').map(e => e.textContent)).toEqual(['b.png: Không nhận loại file .png']);
    expect(screen.getByTestId('attach-errors')).toHaveAttribute('role', 'alert');
    expect(chips()[1]).toHaveTextContent('a.pdf10 B');
    expect(screen.getByTestId('state')).toHaveTextContent('idle|OLD,F0,F2,F3,F4'); // failed ones are not kept
  });

  it('refuses files over 50 MB without uploading them; a 50 MB file goes', () => {
    const d = deferredUpload();
    render(<Harness upload={d.upload} />);
    pick([file('lon.mp4', 50 * 1024 * 1024 + 1, 'video/mp4')]);
    expect(states()).toEqual(['error']);
    expect(chips()[0]).toHaveAttribute('title', 'lon.mp4: File lớn hơn 50 MB');
    expect(screen.getByTestId('attach-error')).toHaveTextContent('lon.mp4: File lớn hơn 50 MB');
    expect(d.upload).not.toHaveBeenCalled();
    pick([file('vua.mp4', 50 * 1024 * 1024, 'video/mp4')]);
    expect(states()).toEqual(['error', 'uploading']);
    expect(d.upload).toHaveBeenCalledTimes(1);
  });

  it('keeps at most 10 files per task, counting the task files and every pick; failed ones do not count', async () => {
    const user = userEvent.setup();
    const d = deferredUpload();
    render(<Harness initial={parseAttachments([meta('OLD1', 'cu1.pdf'), meta('OLD2', 'cu2.pdf')])} upload={d.upload} />);
    pick(Array.from({ length: 6 }, (_, i) => file(`a${i}.txt`, 5, 'text/plain')));
    expect(chips()).toHaveLength(8);
    expect(screen.queryByTestId('note')).toBeNull();
    pick([file('rong.txt', 0), ...Array.from({ length: 4 }, (_, i) => file(`b${i}.txt`, 5, 'text/plain'))]);
    // 2 + 6 + 2 = 10 kept; the empty file shows as failed, the last 2 are skipped
    expect(chips()).toHaveLength(11);
    expect(states().filter(s => s === 'error')).toHaveLength(1);
    expect(screen.getByTestId('note')).toHaveTextContent('Mỗi công việc đính kèm tối đa 10 file — đã bỏ qua 2 file.');
    pick([file('c.txt', 5)]);
    expect(chips()).toHaveLength(11);
    expect(screen.getByTestId('note')).toHaveTextContent('đã bỏ qua 1 file.');
    // a failed upload frees its place
    await d.fail(0, 'file type not allowed');
    await user.click(screen.getByRole('button', { name: 'Bỏ “rong.txt”' }));
    expect(screen.queryByTestId('note')).toBeNull();
    pick([file('d.txt', 5)]); // a0 (failed) no longer counts: d takes its place
    expect(chips()).toHaveLength(11);
    expect(screen.queryByTestId('note')).toBeNull();
    pick([file('e.txt', 5)]);
    expect(screen.getByTestId('note')).toHaveTextContent('đã bỏ qua 1 file.');
  });

  it('removing a chip drops the file and stops its upload; the next queued file starts', async () => {
    const user = userEvent.setup();
    const d = deferredUpload();
    render(<Harness initial={parseAttachments([meta('OLD', 'cu.pdf')])} upload={d.upload} />);
    pick(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf'].map(n => file(n)));
    await user.click(within(chips()[1]).getByRole('button', { name: 'Bỏ “a.pdf”' }));
    expect(d.pending[0].signal.aborted).toBe(true);
    await act(async () => {}); // the slot frees up
    expect(d.upload).toHaveBeenCalledTimes(4);
    await d.done(0); // late answer for the removed file: ignored
    expect(chips().map(c => c.textContent)).not.toContain('a.pdf');
    await user.click(screen.getByRole('button', { name: 'Bỏ “cu.pdf”' }));
    await d.done(1);
    await d.done(2);
    await d.done(3);
    expect(screen.getByTestId('state')).toHaveTextContent('idle|F1,F2,F3');
  });

  it('opens the file picker from the "Đính kèm" button; the same file can be picked twice', async () => {
    const user = userEvent.setup();
    render(<Harness upload={deferredUpload().upload} />);
    const input = screen.getByTestId('attach-input') as HTMLInputElement;
    expect(input).toHaveAttribute('multiple');
    const click = vi.spyOn(input, 'click');
    await user.click(screen.getByTestId('attach-button'));
    expect(click).toHaveBeenCalled();
    expect(screen.getByTestId('attach-button')).toHaveTextContent('Đính kèm');
    pick([file('a.pdf')]);
    expect(input.value).toBe('');
  });
});

describe('attachment links in the detail view', () => {
  it('opens each file from the same origin in a new tab, with its size and a kind icon', () => {
    render(<AttachmentLinks files={parseAttachments([meta('F1', 'Báo cáo.pdf', 248_000), meta('F2', 'anh.png', 0)])} />);
    const links = screen.getAllByTestId('attachment-link');
    // ?redirect=true: the file itself (without it the file server answers with a JSON pointer)
    expect(links[0]).toHaveAttribute('href', '/files/F1/original/B%C3%A1o%20c%C3%A1o.pdf?redirect=true');
    expect(links[0]).toHaveAttribute('download', 'Báo cáo.pdf');
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer');
    expect(links[0]).toHaveTextContent('Báo cáo.pdf242 KB');
    expect(links[0].querySelector('.attach-icon')).toHaveAttribute('data-kind', 'pdf');
    expect(links[1]).toHaveTextContent(/^anh\.png$/);
    expect(links[1].querySelector('.attach-icon')).toHaveAttribute('data-kind', 'image');
    expect(screen.getByRole('list', { name: 'File đính kèm' })).toBeInTheDocument();
  });
});
