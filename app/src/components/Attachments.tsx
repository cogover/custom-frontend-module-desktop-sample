import { File, FileArchive, FileAudio, FileImage, FileSpreadsheet, FileText, FileVideo, Paperclip, Presentation, X, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../api/client';
import {
  MAX_FILES_PER_TASK,
  UPLOAD_CONCURRENCY,
  attachmentHref,
  fileKind,
  fileProblem,
  formatBytes,
  uploadProblem,
  type Attachment,
  type FileKind,
} from '../domain/attachments';

const KIND_ICON: Record<FileKind, LucideIcon> = {
  image: FileImage,
  pdf: FileText,
  doc: FileText,
  text: FileText,
  sheet: FileSpreadsheet,
  slide: Presentation,
  archive: FileArchive,
  video: FileVideo,
  audio: FileAudio,
  other: File,
};

export function FileKindIcon({ name, type = '' }: { name: string; type?: string }) {
  const kind = fileKind(name, type);
  const Icon = KIND_ICON[kind];
  return <Icon className="attach-icon" data-kind={kind} size={15} strokeWidth={1.8} aria-hidden="true" />;
}

/** Detail view: one chip per file, opening it (same origin, session cookie) in a new tab. */
export function AttachmentLinks({ files }: { files: Attachment[] }) {
  return (
    <ul className="attach-list" aria-label="File đính kèm">
      {files.map(f => (
        <li key={f.fileId}>
          <a
            className="attach-chip"
            data-testid="attachment-link"
            data-state="done"
            href={attachmentHref(f)}
            download={f.fileName}
            target="_blank"
            rel="noopener noreferrer"
            title={f.fileName}
          >
            <FileKindIcon name={f.fileName} type={f.fileType} />
            <span className="attach-name">{f.fileName}</span>
            {f.fileSize > 0 && <span className="attach-size">{formatBytes(f.fileSize)}</span>}
          </a>
        </li>
      ))}
    </ul>
  );
}

// ---- form: picking and uploading ----

export type UploadState = 'uploading' | 'done' | 'error';

export interface UploadItem {
  key: string;
  name: string;
  size: number;
  type: string;
  state: UploadState;
  /** Why it failed (shown as the chip's title). */
  error?: string;
  attachment?: Attachment;
}

type Upload = (file: File, signal: AbortSignal) => Promise<Attachment>;

let seq = 0;
const nextKey = () => `f${++seq}`;

/** Files that count against MAX_FILES_PER_TASK: kept or still uploading (failed ones are not saved). */
const kept = (list: readonly UploadItem[]) => list.filter(it => it.state !== 'error').length;

/**
 * Files of the form: the task's current ones plus new picks, uploaded right away (at most
 * UPLOAD_CONCURRENCY at once, at most MAX_FILES_PER_TASK in all). Removing a chip drops the file (and stops its upload).
 */
export function useAttachmentUploads(initial: Attachment[], upload: Upload) {
  const [items, setItemsState] = useState<UploadItem[]>(() =>
    initial.map(a => ({ key: a.fileId, name: a.fileName, size: a.fileSize, type: a.fileType, state: 'done', attachment: a })),
  );
  // mirror of `items` for event handlers that must count files before React re-renders
  const itemsRef = useRef(items);
  const setItems = useCallback((change: (list: UploadItem[]) => UploadItem[]) => {
    itemsRef.current = change(itemsRef.current);
    setItemsState(itemsRef.current);
  }, []);
  const [note, setNote] = useState('');
  const queue = useRef<{ key: string; file: File }[]>([]);
  const running = useRef(new Map<string, AbortController>());
  const alive = useRef(true);

  const patch = (key: string, change: Partial<UploadItem>) => {
    if (alive.current) setItems(list => list.map(it => (it.key === key ? { ...it, ...change } : it)));
  };

  const pump = useCallback(() => {
    while (running.current.size < UPLOAD_CONCURRENCY && queue.current.length) {
      const { key, file } = queue.current.shift()!;
      const ctl = new AbortController();
      running.current.set(key, ctl);
      upload(file, ctl.signal)
        .then(
          attachment => {
            if (!ctl.signal.aborted) patch(key, { state: 'done', attachment, error: undefined });
          },
          err => {
            if (!ctl.signal.aborted) patch(key, { state: 'error', error: uploadProblem(errorMessage(err), file.name) });
          },
        )
        .finally(() => {
          running.current.delete(key);
          if (alive.current) pump();
        });
    }
  }, [upload]);

  const addFiles = useCallback(
    (files: ArrayLike<File>) => {
      const all = Array.from(files);
      if (!all.length) return;
      let room = MAX_FILES_PER_TASK - kept(itemsRef.current);
      let skipped = 0;
      const added: UploadItem[] = [];
      for (const file of all) {
        const problem = fileProblem(file);
        if (!problem && room <= 0) {
          skipped += 1;
          continue;
        }
        const key = nextKey();
        if (!problem) {
          room -= 1;
          queue.current.push({ key, file });
        }
        added.push({ key, name: file.name, size: file.size, type: file.type, state: problem ? 'error' : 'uploading', error: problem ?? undefined });
      }
      setNote(skipped ? `Mỗi công việc đính kèm tối đa ${MAX_FILES_PER_TASK} file — đã bỏ qua ${skipped} file.` : '');
      setItems(list => [...list, ...added]);
      pump();
    },
    [pump, setItems],
  );

  const remove = useCallback(
    (key: string) => {
      queue.current = queue.current.filter(q => q.key !== key);
      running.current.get(key)?.abort();
      running.current.delete(key);
      setItems(list => list.filter(it => it.key !== key));
      setNote('');
      pump(); // its slot goes to the next waiting file
    },
    [pump, setItems],
  );

  // closing the form stops what is still uploading
  useEffect(() => {
    alive.current = true;
    const map = running.current;
    return () => {
      alive.current = false;
      map.forEach(ctl => ctl.abort());
    };
  }, []);

  const attachments = items.filter(it => it.state === 'done' && it.attachment).map(it => it.attachment!);
  const uploading = items.some(it => it.state === 'uploading');
  const failed = items.filter(it => it.state === 'error');
  return { items, attachments, uploading, failed, note, addFiles, remove };
}

export function AttachmentChips({ items, onRemove, disabled }: { items: UploadItem[]; onRemove: (key: string) => void; disabled?: boolean }) {
  if (!items.length) return null;
  return (
    <ul className="attach-list" aria-label="File đính kèm">
      {items.map(it => (
        <li key={it.key}>
          <span
            className="attach-chip"
            data-testid="attach-chip"
            data-state={it.state}
            title={it.state === 'error' ? `${it.name}: ${it.error ?? 'Không tải lên được'}` : it.name}
          >
            <FileKindIcon name={it.name} type={it.type} />
            <span className="attach-name">{it.name}</span>
            <span className="attach-size">
              {it.state === 'uploading' ? 'Đang tải…' : it.state === 'error' ? 'Lỗi' : formatBytes(it.size)}
            </span>
            <button
              type="button"
              className="attach-remove"
              data-testid="attach-remove"
              aria-label={`Bỏ “${it.name}”`}
              title="Bỏ file này"
              disabled={disabled}
              onClick={() => onRemove(it.key)}
            >
              <X size={13} strokeWidth={2} aria-hidden="true" />
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Why each failed file was not attached, spelled out under the chips (the chip itself only says "Lỗi"). */
export function AttachmentErrors({ items }: { items: UploadItem[] }) {
  if (!items.length) return null;
  return (
    <ul className="attach-errors" role="alert" data-testid="attach-errors">
      {items.map(it => (
        <li key={it.key} data-testid="attach-error">
          <span className="attach-error-name">{it.name}</span>: {it.error ?? 'Không tải lên được'}
        </li>
      ))}
    </ul>
  );
}

/** "Đính kèm" button + hidden file input (several files). */
export function AttachButton({ onFiles, disabled }: { onFiles: (files: FileList) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className="btn-ghost attach-btn" data-testid="attach-button" disabled={disabled} onClick={() => input.current?.click()}>
        <Paperclip size={15} strokeWidth={2} aria-hidden="true" />
        Đính kèm
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        data-testid="attach-input"
        aria-label="Chọn file đính kèm"
        tabIndex={-1}
        onChange={e => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = ''; // the same file can be picked again
        }}
      />
    </>
  );
}
