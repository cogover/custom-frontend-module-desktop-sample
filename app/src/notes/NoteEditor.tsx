import { Eye, Maximize2, Minimize2, PencilLine } from 'lucide-react';
import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { errorMessage, isSessionExpired } from '../api/client';
import { DescriptionField, type DescriptionApi } from '../components/DescriptionField';
import { FIELD_H } from '../components/fields';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { cn } from '../lib/utils';
import { FORMAT_LABEL } from './domain';
import { contentToHtml, convertContent } from './markdown';
import { FolderSelect } from './FolderSelect';
import { NewFolderDialog } from './NewFolderDialog';
import { NOTE_CONTENT_MAX } from './notesConfig';
import { TagPicker } from './TagPicker';
import type { ContentFormat, NoteContent, NoteDraft, Ref } from './types';

export interface NoteEditorProps {
  mode: 'new' | 'edit';
  initial: { title: string; folderId: string | null; content: NoteContent; tags: Ref[] };
  /** My folders, indented (only the owner can move a note: editors of a shared note see no folder field). */
  folders: { id: string; name: string; depth: number }[] | null;
  tags: Ref[];
  onCreateTag: (name: string) => Promise<Ref>;
  /** "Tạo thư mục mới…" at the end of the folder list (owner only, with `folders`). */
  onCreateFolder?: (name: string, parentId: string | null) => Promise<{ id: string }>;
  onSave: (draft: NoteDraft) => Promise<void>;
  onCancel: () => void;
}

const FORMATS: ContentFormat[] = [2, 3, 1];

/**
 * Create / edit a note (CONTRACT §9.3): title (required), folder, format (rich text with the Plate editor of
 * Công việc, Markdown with a preview, or plain text — switching converts what is there), tags.
 */
export function NoteEditor({ mode, initial, folders, tags, onCreateTag, onCreateFolder, onSave, onCancel }: NoteEditorProps) {
  const id = useId();
  // an empty note opens as rich text whatever it was saved as (`{text_type: 1, value: null}` when empty)
  const startFormat: ContentFormat = initial.content.value ? initial.content.format : 2;
  const [title, setTitle] = useState(initial.title);
  const [folderId, setFolderId] = useState(initial.folderId);
  const [format, setFormat] = useState<ContentFormat>(startFormat);
  const [text, setText] = useState(startFormat === 2 ? '' : initial.content.value);
  // rich text: what the editor was opened with (a format switch remounts it with the converted content)
  const [richSource, setRichSource] = useState(startFormat === 2 ? initial.content.value : '');
  const [richKey, setRichKey] = useState(0);
  const [picked, setPicked] = useState<Ref[]>(initial.tags);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [imagesBusy, setImagesBusy] = useState(false);
  const [error, setError] = useState('');
  const [titleError, setTitleError] = useState(false);
  // "Phóng to": the content field covers the whole note pane (title, folder, tags hidden behind it) to write at ease
  const [expanded, setExpanded] = useState(false);
  const [folderAsk, setFolderAsk] = useState(false);
  const rich = useRef<DescriptionApi>(null);

  /** The rich text as it is now ('' when empty); the editor answers null when nothing changed. */
  const currentRich = () => {
    const html = rich.current?.read();
    return html === null || html === undefined ? richSource : html;
  };
  const currentValue = () => (format === 2 ? currentRich() : text);

  const switchFormat = (to: ContentFormat) => {
    if (to === format) return;
    const value = convertContent(currentValue(), format, to);
    if (to === 2) {
      setRichSource(value);
      setRichKey(k => k + 1);
    } else setText(value);
    setPreview(false);
    setFormat(to);
  };

  const previewHtml = useMemo(() => (preview && format === 3 ? contentToHtml({ format: 3, value: text }) : ''), [preview, format, text]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy || imagesBusy) return;
    if (!title.trim()) {
      setTitleError(true);
      setError('Nhập tiêu đề ghi chú');
      document.getElementById(`${id}-title`)?.focus();
      return;
    }
    const value = currentValue();
    if (value.length > NOTE_CONTENT_MAX) {
      setError(`Nội dung dài quá ${NOTE_CONTENT_MAX.toLocaleString('vi-VN')} ký tự.`);
      return;
    }
    setError('');
    setBusy(true);
    try {
      await onSave({ title: title.trim(), folderId, content: { format, value }, tags: picked });
    } catch (err) {
      if (!isSessionExpired(err)) setError(`Không lưu được: ${errorMessage(err)}`);
      setBusy(false);
    }
  };

  const expandButton = (
    <button
      type="button"
      className="link-btn note-expand"
      data-testid="note-expand"
      aria-pressed={expanded}
      title={expanded ? 'Thu nhỏ trình soạn (Esc)' : 'Phóng to trình soạn'}
      onClick={() => setExpanded(x => !x)}
    >
      {expanded ? <Minimize2 size={14} strokeWidth={2} aria-hidden="true" /> : <Maximize2 size={14} strokeWidth={2} aria-hidden="true" />}
      {expanded ? 'Thu nhỏ' : 'Phóng to'}
    </button>
  );

  return (
    <>
      <form
        className="note-editor"
        data-testid="note-editor"
        onSubmit={submit}
        onKeyDown={e => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void submit();
        }}
      >
        <div className="editor-head">
          <h2>{mode === 'new' ? 'Ghi chú mới' : 'Sửa ghi chú'}</h2>
          <div className="editor-actions">
            <button type="button" className="btn-ghost" data-testid="note-cancel" disabled={busy} onClick={onCancel}>
              Huỷ
            </button>
            <button type="submit" className="btn-primary" data-testid="note-save" disabled={busy || imagesBusy}>
              {busy ? 'Đang lưu…' : 'Lưu'}
            </button>
          </div>
        </div>

        <div className="field">
          <label htmlFor={`${id}-title`}>Tiêu đề</label>
          <input
            id={`${id}-title`}
            className="input editor-title"
            data-testid="note-title-input"
            maxLength={255}
            placeholder="Tiêu đề ghi chú"
            aria-invalid={titleError || undefined}
            autoFocus={mode === 'new'}
            value={title}
            onChange={e => {
              setTitle(e.target.value);
              if (titleError && e.target.value.trim()) setTitleError(false);
            }}
          />
        </div>

        <div className="editor-row">
          {folders && (
            <div className="field">
              <label htmlFor={`${id}-folder`}>Thư mục</label>
              <FolderSelect
                id={`${id}-folder`}
                testId="note-folder"
                value={folderId}
                onChange={setFolderId}
                folders={folders}
                noneLabel="Không thuộc thư mục nào"
                onNewFolder={onCreateFolder ? () => setFolderAsk(true) : undefined}
              />
            </div>
          )}
          <div className="field">
            <label htmlFor={`${id}-format`}>Định dạng</label>
            <Select value={String(format)} onValueChange={v => switchFormat(Number(v) as ContentFormat)}>
              <SelectTrigger id={`${id}-format`} data-testid="note-format" data-value={format} className={cn('w-full', FIELD_H.default)}>
                <SelectValue>{FORMAT_LABEL[format]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {FORMATS.map(f => (
                  <SelectItem key={f} value={String(f)}>
                    {FORMAT_LABEL[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="field field-tags">
            <span className="field-label">Thẻ</span>
            <TagPicker value={picked} all={tags} onChange={setPicked} onCreate={onCreateTag} />
          </div>
        </div>

        <div
          className="note-body"
          data-expanded={expanded || undefined}
          data-testid="note-body"
          onKeyDown={e => {
            if (expanded && e.key === 'Escape') {
              e.stopPropagation();
              setExpanded(false);
            }
          }}
        >
          {expanded && (
            <div className="note-body-head">
              <span className="note-body-title" data-testid="note-body-title">
                {title.trim() || (mode === 'new' ? 'Ghi chú mới' : 'Sửa ghi chú')}
              </span>
              <button type="submit" className="btn-primary" disabled={busy || imagesBusy}>
                {busy ? 'Đang lưu…' : 'Lưu'}
              </button>
            </div>
          )}
          {format === 2 ? (
            <DescriptionField
              key={richKey}
              editing={mode === 'edit'}
              initialHtml={richSource}
              apiRef={rich}
              onImagesBusy={setImagesBusy}
              label="Nội dung"
              placeholder="Viết ghi chú…"
              testId="note-rich"
              labelAction={expandButton}
            />
          ) : (
            <div className="field field-grow">
              <div className="editor-label-row">
                <label htmlFor={`${id}-text`}>Nội dung</label>
                <span className="editor-label-actions">
                  {format === 3 && (
                    <button type="button" className="link-btn" data-testid="md-preview" aria-pressed={preview} onClick={() => setPreview(p => !p)}>
                      {preview ? <PencilLine size={14} strokeWidth={2} aria-hidden="true" /> : <Eye size={14} strokeWidth={2} aria-hidden="true" />}
                      {preview ? 'Soạn' : 'Xem trước'}
                    </button>
                  )}
                  {expandButton}
                </span>
              </div>
              {preview ? (
                <div className="v-html prose md-preview" data-testid="md-preview-body" dangerouslySetInnerHTML={{ __html: previewHtml || '<p>(trống)</p>' }} />
              ) : (
                <textarea
                  id={`${id}-text`}
                  className={format === 3 ? 'input notes-text md' : 'input notes-text'}
                  data-testid="note-text"
                  placeholder={format === 3 ? '# Tiêu đề\n\n- Gạch đầu dòng\n- **Đậm**, _nghiêng_, `code`' : 'Viết ghi chú…'}
                  value={text}
                  onChange={e => setText(e.target.value)}
                />
              )}
            </div>
          )}
        </div>

        {error && (
          <p className="err" role="alert" data-testid="note-error">
            {error}
          </p>
        )}
      </form>
      {folders && onCreateFolder && (
        <NewFolderDialog
          open={folderAsk}
          folders={folders}
          parentId={folderId}
          onCreate={onCreateFolder}
          onClose={createdId => {
            setFolderAsk(false);
            if (createdId) setFolderId(createdId);
          }}
        />
      )}
    </>
  );
}
