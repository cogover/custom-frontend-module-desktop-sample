import { Component, Suspense, lazy, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import { inlineImagesIn, type InlineImage } from '../domain/inlineImages';
import type { MentionSource } from '../domain/mentions';
import { sanitizeDescription, sanitizeForSave } from '../domain/sanitize';
import { htmlToValue, valueToHtml, type RteValue } from '../rte/html';
import { loadEditor, loadedEditor } from '../rte/loadEditor';
import { StaticToolbar } from '../rte/tools';
import type { EditorHandle, ImageStatus, RichTextEditorProps, UploadImage } from '../rte/RichTextEditor';

export interface DescriptionApi {
  /**
   * HTML to send: clean and sanitised; '' when empty. null = do not send `description` at all
   * (the original cannot be edited here, or nothing changed while editing).
   */
  read: () => string | null;
  /** Pictures pasted and uploaded in this session that are still in the description (for `_attachments`). */
  images: () => InlineImage[];
}

// React.lazy remembers a failed download: a retry needs a fresh lazy component
let LazyEditor = lazy(() => loadEditor());
const retryEditorDownload = () => {
  LazyEditor = lazy(() => loadEditor());
};

const LABEL = 'Mô tả';
const PLACEHOLDER = 'Ghi chú về việc cần làm';

/** Shown until the editor is mounted (and while its chunk downloads): same box, the text already visible. */
function EditorFallback({ html, label, placeholder, testId }: { html: string; label: string; placeholder: string; testId: string }) {
  return (
    <div className="rte rte-loading" aria-busy="true">
      <StaticToolbar />
      <div className="rte-content v-html" aria-label={label} data-testid={`${testId}-loading`}>
        {html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <p className="rte-placeholder">{placeholder}</p>}
      </div>
    </div>
  );
}

/** Downloads the editor (fallback meanwhile); when that fails (offline…) says so and lets the user retry. */
class LazyEditorSlot extends Component<{ editor: RichTextEditorProps; fallback: ReactNode }, { failed: boolean; attempt: number }> {
  state = { failed: false, attempt: 0 };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) {
      const Editor = LazyEditor; // read at render time: a retry swaps it for a fresh one
      return (
        <div key={this.state.attempt} className="rte-slot">
          <Suspense fallback={this.props.fallback}>
            <Editor {...this.props.editor} />
          </Suspense>
        </div>
      );
    }
    return (
      <div className="rte rte-failed" role="alert">
        <p data-testid="field-desc-failed">Không tải được trình soạn thảo mô tả.</p>
        <button
          type="button"
          className="link-btn"
          data-testid="field-desc-retry"
          onClick={() => {
            retryEditorDownload();
            this.setState(s => ({ failed: false, attempt: s.attempt + 1 }));
          }}
        >
          Thử lại
        </button>
      </div>
    );
  }
}

interface DescriptionFieldProps {
  editing: boolean;
  /** The description as stored on Cogover ('' when creating). */
  initialHtml: string;
  apiRef: Ref<DescriptionApi>;
  /** Uploads a pasted picture to `_attachments`. */
  uploadImage?: UploadImage;
  /** True while pasted pictures are uploading (saving has to wait). */
  onImagesBusy?: (busy: boolean) => void;
  /** Same field elsewhere (a note's content): its label, placeholder, test id; optional shows "(không bắt buộc)". */
  label?: string;
  placeholder?: string;
  testId?: string;
  optional?: boolean;
  /** Caret in the editor as soon as it is there (a note's content). */
  autoFocus?: boolean;
  /** "@" mentions people (a note's content). */
  mentions?: MentionSource;
  /** A control at the right end of the label row (the note editor's "Phóng to"). */
  labelAction?: ReactNode;
}

/**
 * "Mô tả" in the create/edit form: Plate rich-text editor (lazy chunk), or a read-only view with a note
 * when the stored description has elements the editor cannot keep (tables, embeds, colours…).
 */
export function DescriptionField({
  editing,
  initialHtml,
  apiRef,
  uploadImage,
  onImagesBusy,
  label = LABEL,
  placeholder = PLACEHOLDER,
  testId = 'field-desc',
  optional = true,
  autoFocus = false,
  mentions,
  labelAction,
}: DescriptionFieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  const [parsed] = useState(() => htmlToValue(initialHtml));
  const locked = editing && parsed.unsupported !== null;
  const editor = useRef<EditorHandle | null>(null);
  // the document as the last editor left it (only matters if an editor ever had to be mounted again)
  const lastValue = useRef<RteValue | null>(null);
  const current = () => (editor.current ? editor.current.getValue() : (lastValue.current ?? parsed.value));
  // "nothing changed" is judged on normalised HTML (re-based once, when Plate first normalised the document)
  const baseline = useRef<string | null>(null);
  const rebased = useRef(false);
  baseline.current ??= sanitizeForSave(valueToHtml(parsed.value));
  const uploaded = useRef<InlineImage[]>([]);
  const [imageStatus, setImageStatus] = useState<ImageStatus>({ pending: 0, error: '' });
  const busy = useRef(onImagesBusy);
  busy.current = onImagesBusy;
  useEffect(() => busy.current?.(imageStatus.pending > 0), [imageStatus.pending]);

  useImperativeHandle(
    apiRef,
    () => ({
      read: () => {
        if (locked) return null;
        const html = sanitizeForSave(valueToHtml(current()));
        return editing && html === baseline.current ? null : html;
      },
      images: () => (locked ? [] : inlineImagesIn(valueToHtml(current()), uploaded.current)),
    }),
    [locked, editing, parsed],
  );

  // The popup paints first with the look-alike box; Plate mounts right after that paint (keeps opening fast).
  // How it mounts is decided ONCE: straight away when the chunk is already here, otherwise through the lazy
  // slot — and it stays that way. (Switching from the lazy slot to the direct component on a later render —
  // e.g. after picking a date — used to mount a second, empty editor and lose what had been typed.)
  const [mount, setMount] = useState<null | 'direct' | 'lazy'>(null);
  useEffect(() => {
    if (locked) return;
    let timer = 0;
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => setMount(m => m ?? (loadedEditor() ? 'direct' : 'lazy')), 0);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [locked]);

  const staticHtml = useMemo(() => sanitizeDescription(initialHtml), [initialHtml]);

  const labelText = (
    <span className="field-label" id={`${id}-label`} onClick={() => document.getElementById(id)?.focus()}>
      {label} {optional && <span className="opt">(không bắt buộc)</span>}
    </span>
  );
  const labelEl = labelAction ? (
    <div className="field-label-row">
      {labelText}
      {labelAction}
    </div>
  ) : (
    labelText
  );

  if (locked) {
    return (
      <div className="field field-grow">
        {labelEl}
        <div className="rte rte-locked">
          <div
            id={id}
            className="rte-content v-html"
            role="textbox"
            aria-readonly="true"
            aria-multiline="true"
            aria-label={label}
            aria-describedby={noteId}
            tabIndex={0}
            data-testid={testId}
            dangerouslySetInnerHTML={{ __html: staticHtml }}
          />
        </div>
        <p className="hint" id={noteId} data-testid="field-desc-locked">
          Mô tả có định dạng chưa hỗ trợ — hãy sửa trên Cogover
        </p>
      </div>
    );
  }

  const props: RichTextEditorProps = {
    id,
    label,
    placeholder,
    testId,
    autoFocus,
    mentions,
    initialValue: lastValue.current ?? parsed.value,
    onReady: (handle, normalized) => {
      editor.current = handle;
      if (!rebased.current) {
        rebased.current = true;
        baseline.current = sanitizeForSave(valueToHtml(normalized));
      }
    },
    onDetach: value => {
      lastValue.current = value as RteValue;
      editor.current = null;
    },
    uploadImage,
    onImageStatus: setImageStatus,
    onImageUploaded: img => {
      uploaded.current = [...uploaded.current, img];
    },
  };
  const fallback = <EditorFallback html={staticHtml} label={label} placeholder={placeholder} testId={testId} />;
  const Direct = mount === 'direct' ? loadedEditor()?.default : undefined;
  return (
    <div className="field field-grow">
      {labelEl}
      {mount === null ? fallback : Direct ? <Direct {...props} /> : <LazyEditorSlot editor={props} fallback={fallback} />}
      {imageStatus.pending > 0 && (
        <p className="hint" role="status" data-testid="desc-images-status">
          Đang tải {imageStatus.pending} ảnh lên…
        </p>
      )}
      {imageStatus.error && imageStatus.pending === 0 && (
        <p className="err" role="alert" data-testid="desc-images-error">
          {imageStatus.error}
        </p>
      )}
    </div>
  );
}
