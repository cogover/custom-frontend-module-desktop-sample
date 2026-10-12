/**
 * Rich-text description editor (Plate.js). Loaded lazily in its own chunk (see loadEditor.ts) so the
 * popup and the first page load stay fast. The value is turned into clean HTML by ./html.ts — Plate's
 * own classes/attributes never reach Cogover.
 */
import { BlockquoteRules, BoldRules, CodeRules, HeadingRules, ItalicRules, StrikethroughRules, UnderlineRules } from '@platejs/basic-nodes';
import {
  BlockquotePlugin,
  BoldPlugin,
  CodePlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  ItalicPlugin,
  StrikethroughPlugin,
  UnderlinePlugin,
} from '@platejs/basic-nodes/react';
import { BaseLinkPlugin, LinkRules, unwrapLink, upsertLink } from '@platejs/link';
import { BulletedListRules, OrderedListRules, toggleList } from '@platejs/list-classic';
import { BulletedListPlugin, ListItemContentPlugin, ListItemPlugin, ListPlugin, NumberedListPlugin } from '@platejs/list-classic/react';
import { X, type LucideIcon } from 'lucide-react';
import { isUrl, type Value } from 'platejs';
import {
  Key,
  Plate,
  PlateContent,
  PlateElement,
  createPlatePlugin,
  toPlatePlugin,
  useEditorRef,
  useEditorSelector,
  useFocused,
  usePlateEditor,
  useSelected,
  type PlateEditor,
  type PlateElementProps,
} from 'platejs/react';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { errorMessage } from '../api/client';
import { uploadProblem } from '../domain/attachments';
import { dataUrlToFile, replaceWordImages, uploadableImage, type InlineImage } from '../domain/inlineImages';
import { Input } from '../components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '../components/ui/popover';
import type { MentionSource } from '../domain/mentions';
import { htmlToValue, isAllowedHref, type RteValue } from './html';
import { MentionCombobox, MentionPlugin, type MentionKeys } from './mentions';
import { TOOLS, type ToolId } from './tools';

// ---- elements ----

function LinkElement(props: PlateElementProps) {
  const url = String((props.element as { url?: string }).url ?? '');
  return (
    <PlateElement
      {...props}
      as="a"
      className="rte-link"
      attributes={{ ...props.attributes, href: url, title: url, rel: 'noopener noreferrer', target: '_blank' }}
    >
      {props.children}
    </PlateElement>
  );
}

/** Images: shown, selectable, deletable; pasted ones are uploaded to `_attachments` first (CONTRACT §5.3). */
function ImageElement(props: PlateElementProps) {
  const el = props.element as { url?: string; alt?: string };
  const selected = useSelected();
  const focused = useFocused();
  return (
    <PlateElement {...props} as="span" className="rte-img">
      <span contentEditable={false} data-selected={selected && focused ? 'true' : undefined}>
        <img src={el.url} alt={el.alt ?? ''} draggable={false} />
      </span>
      {props.children}
    </PlateElement>
  );
}

const ImagePlugin = createPlatePlugin({
  key: 'img',
  node: { isElement: true, isInline: true, isVoid: true, component: ImageElement },
});

// ---- pictures pasted into the description: uploaded like Cogover's own editor does ----

export type UploadImage = (file: File, signal: AbortSignal) => Promise<InlineImage>;
export interface ImageStatus {
  /** Pictures still uploading (saving waits for them). */
  pending: number;
  /** Why the last picture could not be kept; '' when fine. */
  error: string;
}

type ImgNode = { type?: string; url?: string };
const isTempSrc = (url: unknown) => typeof url === 'string' && /^(data|blob):/i.test(url);

/**
 * A pasted picture is shown at once from its data:/blob: source, uploaded to `_attachments`, then its
 * src is swapped for the uploaded one; a picture that cannot be uploaded is taken out again (with the
 * reason). Pictures already in the stored description are never re-uploaded.
 */
class InlineImageUploads {
  private readonly pending = new Map<string, AbortController>();
  /** temporary src → uploaded picture (undo/redo can bring a temporary src back). */
  private readonly uploaded = new Map<string, InlineImage>();
  private readonly files = new Map<string, File>();
  private readonly known: Set<string>;
  private error = '';

  constructor(
    private readonly editor: PlateEditor,
    private readonly upload: UploadImage,
    private readonly status: (s: ImageStatus) => void,
    private readonly onUploaded: (img: InlineImage) => void,
  ) {
    this.known = new Set(this.temps().map(([n]) => String(n.url)));
  }

  private temps() {
    return Array.from(this.editor.api.nodes({ at: [], match: n => (n as ImgNode).type === 'img' && isTempSrc((n as ImgNode).url) })).map(
      ([n, p]) => [n as ImgNode, p] as const,
    );
  }

  private pathsOf(url: string) {
    return Array.from(this.editor.api.nodes({ at: [], match: n => (n as ImgNode).type === 'img' && (n as ImgNode).url === url })).map(([, p]) => p);
  }

  /** Not an undo step: undo should remove the pasted picture, never bring back its temporary source. */
  private quietly(fn: () => void) {
    const tf = this.editor.tf as { withoutSaving?: (f: () => void) => void };
    if (tf.withoutSaving) tf.withoutSaving(fn);
    else fn();
  }

  private report() {
    this.status({ pending: this.pending.size, error: this.error });
  }

  /** A picture pasted as a file (screenshot, "Copy image"): shown from a blob: URL until uploaded. */
  addFile(file: File): string {
    const url = URL.createObjectURL(file);
    this.files.set(url, file);
    return url;
  }

  /** Uploads every temporary picture of the document (call after any change). */
  scan() {
    for (const [node] of this.temps()) {
      const url = String(node.url);
      if (this.known.has(url) || this.pending.has(url)) continue;
      const done = this.uploaded.get(url);
      if (done) {
        this.swap(url, done.src);
        continue;
      }
      const file = this.files.get(url) ?? dataUrlToFile(url);
      if (file) this.start(url, file);
      else this.drop(url, 'không đọc được ảnh');
    }
  }

  private swap(url: string, src: string) {
    this.quietly(() => {
      for (const at of this.pathsOf(url)) this.editor.tf.setNodes({ url: src } as Partial<ImgNode>, { at });
    });
  }

  private start(url: string, file: File) {
    const ctl = new AbortController();
    this.pending.set(url, ctl);
    this.error = '';
    this.report();
    uploadableImage(file)
      .then(f => this.upload(f, ctl.signal))
      .then(
        img => {
          if (ctl.signal.aborted) return;
          this.uploaded.set(url, img);
          this.onUploaded(img);
          this.swap(url, img.src);
        },
        err => {
          if (!ctl.signal.aborted) this.drop(url, uploadProblem(errorMessage(err), file.name));
        },
      )
      .finally(() => {
        this.pending.delete(url);
        if (!ctl.signal.aborted) this.report();
      });
  }

  private drop(url: string, why: string) {
    this.quietly(() => {
      for (const at of this.pathsOf(url).reverse()) this.editor.tf.removeNodes({ at });
    });
    this.error = `Không tải được ảnh dán vào: ${why}`;
    this.report();
  }

  dispose() {
    this.pending.forEach(c => c.abort());
    this.pending.clear();
    this.files.forEach((_, url) => URL.revokeObjectURL(url));
  }
}

const imageUploads = new WeakMap<object, InlineImageUploads>();

/** Without an uploader (e.g. a preview) pasted temporary pictures are not kept: they could not be saved. */
function withoutTempImages(nodes: unknown[]): unknown[] {
  return nodes
    .filter(n => !((n as ImgNode).type === 'img' && isTempSrc((n as ImgNode).url)))
    .map(n => {
      const c = (n as { children?: unknown[] }).children;
      return c ? { ...(n as object), children: withoutTempImages(c) } : n;
    });
}

const textOfHtml = (html: string) => (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '').replace(/\u00a0/g, ' ').trim();

/**
 * Pasted HTML goes through the same converter as descriptions loaded from Cogover, so a paste can only
 * bring what the editor saves (basic formatting, lists, safe links, pictures). Word's pictures come from
 * the clipboard RTF; data:/blob: pictures and pasted image files are uploaded (InlineImageUploads).
 * Copy/paste inside the editor keeps Plate's own fragment.
 */
const CleanPastePlugin = createPlatePlugin({ key: 'cleanPaste' }).overrideEditor(({ editor, tf: { insertData } }) => ({
  transforms: {
    insertData(data: DataTransfer) {
      if (data.types.includes('application/x-slate-fragment')) return insertData(data);
      const uploads = imageUploads.get(editor);
      const html = data.getData('text/html');
      const files = Array.from(data.files ?? []).filter(f => f.type.startsWith('image/'));
      // a picture on its own (screenshot, "Copy image" — whose HTML is just an <img>): upload the file itself
      if (uploads && files.length && (!html || !textOfHtml(html))) {
        editor.tf.insertNodes(files.map(f => ({ type: 'img', url: uploads.addFile(f), children: [{ text: '' }] })) as never);
        uploads.scan();
        return true;
      }
      if (html) {
        const { value } = htmlToValue(replaceWordImages(html, data.getData('text/rtf')), { paste: true });
        editor.tf.insertFragment((uploads ? value : withoutTempImages(value)) as Value);
        uploads?.scan();
        return true;
      }
      return insertData(data);
    },
  },
}));

// ---- plugins: marks, H1–H3, quote, classic lists (real ul/ol/li), links; Markdown input rules ----

const PLUGINS = [
  BoldPlugin.configure({ inputRules: [BoldRules.markdown({ variant: '*' })] }),
  ItalicPlugin.configure({ inputRules: [ItalicRules.markdown({ variant: '*' }), ItalicRules.markdown({ variant: '_' })] }),
  UnderlinePlugin.configure({ inputRules: [UnderlineRules.markdown()] }),
  StrikethroughPlugin.configure({
    inputRules: [StrikethroughRules.markdown()],
    shortcuts: { toggle: { keys: [[Key.Mod, Key.Shift, 'x']] } },
  }),
  CodePlugin.configure({ inputRules: [CodeRules.markdown()], shortcuts: { toggle: { keys: [[Key.Mod, 'e']] } } }),
  H1Plugin.configure({ inputRules: [HeadingRules.markdown()] }),
  H2Plugin.configure({ inputRules: [HeadingRules.markdown()] }),
  H3Plugin.configure({ inputRules: [HeadingRules.markdown()] }),
  BlockquotePlugin.configure({ inputRules: [BlockquoteRules.markdown()] }),
  ListPlugin,
  BulletedListPlugin.configure({
    inputRules: [BulletedListRules.markdown({ variant: '-' }), BulletedListRules.markdown({ variant: '*' })],
  }),
  NumberedListPlugin.configure({ inputRules: [OrderedListRules.markdown({ variant: '.' })] }),
  ListItemPlugin,
  ListItemContentPlugin,
  // a URL typed or pasted becomes a link once followed by a space or Enter (user review 2026-10-08)
  toPlatePlugin(BaseLinkPlugin, {
    // only allowed schemes count as URLs: Plate's own check takes ftp:// too, and autolink then failed half-way
    // and replaced the typed URL with the space
    options: { allowedSchemes: ['http', 'https', 'mailto'], isUrl: (s: string) => /^(https?:\/\/|mailto:)/i.test(s) && isUrl(s) },
    inputRules: [LinkRules.autolink({ variant: 'space' }), LinkRules.autolink({ variant: 'break' })],
  }).withComponent(LinkElement),
  ImagePlugin,
  MentionPlugin,
  CleanPastePlugin,
];

// ---- toolbar ----

const MARK_OF: Partial<Record<ToolId, string>> = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strike: 'strikethrough',
  code: 'code',
};

/** One Tab stop for the whole toolbar (WAI-ARIA toolbar): arrows move between its buttons. */
const RovingContext = createContext<{ active: ToolId; setActive: (id: ToolId) => void }>({ active: 'bold', setActive: () => {} });

function ToolButton({
  id,
  label,
  icon: Icon,
  pressed,
  disabled,
  onAction,
}: {
  id: ToolId;
  label: string;
  icon: LucideIcon;
  pressed?: boolean;
  disabled?: boolean;
  onAction: () => void;
}) {
  const roving = useContext(RovingContext);
  return (
    <button
      type="button"
      className="rte-btn"
      tabIndex={roving.active === id ? 0 : -1}
      onFocus={() => roving.setActive(id)}
      data-testid={`rte-${id}`}
      aria-label={label}
      title={label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      disabled={disabled}
      // keep the caret / selection in the editor while clicking
      onMouseDown={(e: MouseEvent) => e.preventDefault()}
      onClick={onAction}
    >
      <Icon size={16} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}

const isMod = (e: KeyboardEvent) => e.metaKey || e.ctrlKey;

function useBlockActive(type: string) {
  return useEditorSelector(editor => !!editor.selection && editor.api.some({ match: { type } }), [type]);
}

function useMarkActive(key: string) {
  return useEditorSelector(editor => !!editor.selection && !!(editor.api.marks() as Record<string, unknown> | null)?.[key], [key]);
}

/** Link popover: add / change / remove the link on the selected text. */
function LinkPopover({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const editor = useEditorRef();
  const inputId = useId();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const saved = useRef<PlateEditor['selection']>(null);
  const existing = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    saved.current = editor.selection;
    const entry = editor.api.node({ match: { type: 'a' } });
    existing.current = entry ? String((entry[0] as { url?: string }).url ?? '') : null;
    setUrl(existing.current ?? '');
    setError('');
  }, [open, editor]);

  /** Back to the editor: the old selection when cancelled; after a change Plate already placed the caret. */
  const close = (restore = true) => {
    onOpenChange(false);
    if (restore && saved.current) editor.tf.select(saved.current);
    editor.tf.focus();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // the task form around us must not submit
    let next = url.trim();
    if (next && !/^[a-z][a-z0-9+.-]*:/i.test(next)) next = next.includes('@') && !next.includes('/') ? `mailto:${next}` : `https://${next}`;
    if (!next || !isAllowedHref(next)) {
      setError('Nhập liên kết bắt đầu bằng http://, https:// hoặc mailto:');
      return;
    }
    if (saved.current) editor.tf.select(saved.current);
    upsertLink(editor, { url: next, skipValidation: true });
    close(false);
  };

  const remove = () => {
    if (saved.current) editor.tf.select(saved.current);
    unwrapLink(editor);
    close(false);
  };

  return (
    <PopoverContent
      className="rte-link-pop"
      align="start"
      data-testid="rte-link-popover"
      onOpenAutoFocus={e => {
        e.preventDefault();
        document.getElementById(inputId)?.focus();
      }}
      onCloseAutoFocus={e => e.preventDefault()}
      onEscapeKeyDown={e => {
        e.preventDefault(); // only this popover closes, not the task popup
        close();
      }}
    >
      {/* not a <form>: it would be nested in the task form */}
      <div
        className="rte-link-form"
        role="group"
        aria-label="Liên kết"
        onKeyDown={e => {
          if (e.key === 'Enter') submit(e);
        }}
      >
        <div className="rte-link-head">
          <label htmlFor={inputId} className="rte-link-label">
            Liên kết
          </label>
          <button
            type="button"
            className="icon-btn rte-link-close"
            data-testid="rte-link-close"
            aria-label="Đóng"
            title="Đóng (Esc)"
            onClick={() => close()}
          >
            <X size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <Input
          id={inputId}
          data-testid="rte-link-input"
          className="h-9 text-sm"
          value={url}
          placeholder="https://…"
          aria-invalid={error ? 'true' : undefined}
          onChange={e => {
            setUrl(e.target.value);
            setError('');
          }}
        />
        {error && <p className="err">{error}</p>}
        <div className="rte-link-actions">
          {existing.current !== null && (
            <button type="button" className="link-btn rte-link-remove" data-testid="rte-link-remove" onClick={remove}>
              Gỡ liên kết
            </button>
          )}
          <button type="button" className="btn-primary rte-link-save" data-testid="rte-link-save" onClick={submit}>
            Áp dụng
          </button>
        </div>
      </div>
    </PopoverContent>
  );
}

function Toolbar({ linkOpen, setLinkOpen }: { linkOpen: boolean; setLinkOpen: (open: boolean) => void }) {
  const editor = useEditorRef();
  const marks = {
    bold: useMarkActive('bold'),
    italic: useMarkActive('italic'),
    underline: useMarkActive('underline'),
    strike: useMarkActive('strikethrough'),
    code: useMarkActive('code'),
  };
  const blocks = {
    h1: useBlockActive('h1'),
    h2: useBlockActive('h2'),
    h3: useBlockActive('h3'),
    ul: useBlockActive('ul'),
    ol: useBlockActive('ol'),
    quote: useBlockActive('blockquote'),
    link: useBlockActive('a'),
  };
  const canUndo = useEditorSelector(e => e.history.undos.length > 0, []);
  const canRedo = useEditorSelector(e => e.history.redos.length > 0, []);

  const run = (fn: () => void) => () => {
    if (!editor.selection) editor.tf.select(editor.api.end([]));
    fn();
    editor.tf.focus();
  };
  const [active, setActive] = useState<ToolId>('bold');
  const roving = useMemo(() => ({ active, setActive }), [active]);
  const onArrows = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(e.key) || !(e.target as Element).classList.contains('rte-btn')) return;
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('.rte-btn:not(:disabled)'));
    const at = buttons.indexOf(e.target as HTMLButtonElement);
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? buttons.length - 1
          : (at + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    e.preventDefault();
    buttons[next]?.focus();
  };
  const mark = (id: ToolId) => run(() => editor.tf.toggleMark(MARK_OF[id]!));
  const block = (type: string) => run(() => editor.tf.toggleBlock(type));
  const list = (type: 'ul' | 'ol') => run(() => toggleList(editor, { type }));

  return (
    <RovingContext.Provider value={roving}>
      <div className="rte-toolbar" role="toolbar" aria-label="Định dạng mô tả" data-testid="rte-toolbar" onKeyDown={onArrows}>
        <ToolButton id="bold" {...TOOLS.bold} pressed={marks.bold} onAction={mark('bold')} />
        <ToolButton id="italic" {...TOOLS.italic} pressed={marks.italic} onAction={mark('italic')} />
        <ToolButton id="underline" {...TOOLS.underline} pressed={marks.underline} onAction={mark('underline')} />
        <ToolButton id="strike" {...TOOLS.strike} pressed={marks.strike} onAction={mark('strike')} />
        <ToolButton id="code" {...TOOLS.code} pressed={marks.code} onAction={mark('code')} />
        <span className="rte-sep" aria-hidden="true" />
        <ToolButton id="h1" {...TOOLS.h1} pressed={blocks.h1} onAction={block('h1')} />
        <ToolButton id="h2" {...TOOLS.h2} pressed={blocks.h2} onAction={block('h2')} />
        <ToolButton id="h3" {...TOOLS.h3} pressed={blocks.h3} onAction={block('h3')} />
        <span className="rte-sep" aria-hidden="true" />
        <ToolButton id="ul" {...TOOLS.ul} pressed={blocks.ul && !blocks.ol} onAction={list('ul')} />
        <ToolButton id="ol" {...TOOLS.ol} pressed={blocks.ol} onAction={list('ol')} />
        <ToolButton
          id="quote"
          {...TOOLS.quote}
          pressed={blocks.quote}
          onAction={run(() => editor.tf.toggleBlock('blockquote', { wrap: true }))}
        />
        <Popover open={linkOpen} onOpenChange={setLinkOpen}>
          <PopoverAnchor asChild>
            <span className="rte-anchor">
              <ToolButton id="link" {...TOOLS.link} pressed={blocks.link} onAction={() => setLinkOpen(!linkOpen)} />
            </span>
          </PopoverAnchor>
          <LinkPopover open={linkOpen} onOpenChange={setLinkOpen} />
        </Popover>
        <span className="rte-sep" aria-hidden="true" />
        <ToolButton id="undo" {...TOOLS.undo} disabled={!canUndo} onAction={run(() => editor.undo())} />
        <ToolButton id="redo" {...TOOLS.redo} disabled={!canRedo} onAction={run(() => editor.redo())} />
      </div>
    </RovingContext.Provider>
  );
}

// ---- editor ----

/** The editor behind a rendered editing area (tests and tooling drive Plate through its API). */
const editors = new WeakMap<Element, PlateEditor>();
export const editorFor = (el: Element | null) => (el ? editors.get(el) : undefined);

export interface EditorHandle {
  /** The current document (read when the form is submitted). */
  getValue: () => Value;
}

export interface RichTextEditorProps {
  id: string;
  /** Accessible name of the editing area ("Mô tả"). */
  label: string;
  placeholder: string;
  initialValue: RteValue;
  /** Called once mounted, with the document as Plate normalised it (the baseline for "nothing changed"). */
  onReady: (handle: EditorHandle, normalized: Value) => void;
  /** Called when this editor goes away, with its last document. */
  onDetach?: (value: Value) => void;
  /** Uploads a pasted picture (without it, pasted data:/blob: pictures are left out). */
  uploadImage?: UploadImage;
  onImageStatus?: (status: ImageStatus) => void;
  /** A pasted picture is uploaded (its FILE_METADATA goes to `_attachments` when saving). */
  onImageUploaded?: (img: InlineImage) => void;
  /** data-testid of the editing area ("field-desc" for the task description). */
  testId?: string;
  /** Put the caret in the editor as soon as it is mounted. */
  autoFocus?: boolean;
  /** "@" lists people to mention (a note's content); without it "@" is plain text. */
  mentions?: MentionSource;
}

export default function RichTextEditor(props: RichTextEditorProps) {
  const { id, label, placeholder, initialValue, onReady, onDetach } = props;
  const editor = usePlateEditor({ plugins: PLUGINS, value: initialValue as Value });
  const [linkOpen, setLinkOpen] = useState(false);
  const ready = useRef(onReady);
  const detach = useRef(onDetach);
  const latest = useRef(props);
  latest.current = props;
  const canUpload = !!props.uploadImage;
  const autoFocus = useRef(props.autoFocus);
  useEffect(() => {
    ready.current({ getValue: () => editor.children }, editor.children);
    let focusTimer = 0;
    if (autoFocus.current) {
      // caret at the end of the document, then focus in a task of our own. Not `tf.focus({ edge })`: with the
      // selection just changed, Slate retries the focus on a timer, and when the document changes again before it
      // fires (typing at once, a slow machine) that retry throws where nothing can catch it.
      const end = editor.api.end([]);
      if (end) editor.tf.select(end);
      focusTimer = window.setTimeout(() => {
        try {
          editor.tf.focus();
        } catch {
          // the document moved on before the first paint: whoever changed it is already in the editor
        }
      }, 0);
    }
    return () => {
      window.clearTimeout(focusTimer);
      detach.current?.(editor.children);
    };
  }, [editor]);
  useEffect(() => {
    if (!canUpload) return;
    const uploads = new InlineImageUploads(
      editor,
      (file, signal) => latest.current.uploadImage!(file, signal),
      s => latest.current.onImageStatus?.(s),
      img => latest.current.onImageUploaded?.(img),
    );
    imageUploads.set(editor, uploads);
    return () => {
      uploads.dispose();
      imageUploads.delete(editor);
    };
  }, [editor, canUpload]);
  const register = (el: HTMLDivElement | null) => {
    if (el) editors.set(el, editor);
  };
  const mentionKeys = useRef<MentionKeys | null>(null);

  return (
    <Plate editor={editor} onChange={() => imageUploads.get(editor)?.scan()}>
      {/* Ctrl/Cmd+K → link popover (capture: before Plate's own key handling) */}
      <div
        className="rte"
        onKeyDownCapture={e => {
          if (isMod(e) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            e.stopPropagation();
            setLinkOpen(true);
            return;
          }
          // the "@" list takes arrows / Enter / Tab before Plate's own key handling
          if (e.target instanceof Element && e.target.closest('[data-slate-editor]') && mentionKeys.current?.onKeyDown(e)) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        <Toolbar linkOpen={linkOpen} setLinkOpen={setLinkOpen} />
        <PlateContent
          ref={register}
          id={id}
          className="rte-content v-html"
          data-testid={props.testId ?? 'field-desc'}
          aria-label={label}
          aria-multiline="true"
          placeholder={placeholder}
          spellCheck
        />
        {props.mentions && <MentionCombobox source={props.mentions} keys={mentionKeys} />}
      </div>
    </Plate>
  );
}
