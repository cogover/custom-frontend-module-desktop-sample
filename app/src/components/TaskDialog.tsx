import { Pencil, Trash2, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Attachment } from '../domain/attachments';
import type { InlineImage } from '../domain/inlineImages';
import type { StatusFlow } from '../domain/statusFlow';
import { dateTimeText, shortStamp } from '../domain/dates';
import type { Person, Role, Task, TaskPatch } from '../domain/types';
import type { PeopleDirectory } from '../hooks/usePeople';
import { useMobileScrollLock } from '../hooks/useScrollLock';
import { TaskForm, type FormValues } from './TaskForm';
import { TaskView } from './TaskView';

export type DialogMode = 'create' | 'view' | 'edit';

const SHEET_TITLE: Record<Exclude<DialogMode, 'view'>, string> = {
  create: 'Tạo công việc',
  edit: 'Sửa công việc',
};

interface TaskDialogProps {
  mode: DialogMode | null;
  task: Task | null;
  me: Person | null;
  roles: Role[];
  readOnly: boolean;
  now: number;
  directory: PeopleDirectory;
  onClose: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (task: Task) => void;
  /** The delete confirmation is open on top: Esc and outside presses belong to it, never to this popup. */
  confirming?: boolean;
  onCreate: (values: FormValues) => Promise<void>;
  onSave: (task: Task, values: FormValues) => Promise<void>;
  /** Uploads one attachment (file server). */
  onUpload: (file: File, signal: AbortSignal) => Promise<Attachment>;
  /** Uploads a picture pasted into the description (to `_attachments`). */
  onUploadImage?: (file: File, signal: AbortSignal) => Promise<InlineImage>;
  /** Quick edit in the view mode: a status change (same flow as the card's status). */
  onQuickStatus?: (task: Task, status: string) => void;
  /** Quick edit in the view mode: any other property, saved at once. */
  onQuickChange?: (task: Task, patch: TaskPatch) => void;
  /** The activities timeline of the open task (view mode). */
  activities?: (task: Task) => ReactNode;
  /** The status workflow (transition rule); null = every status. */
  statusFlow?: StatusFlow | null;
}


interface MetaPart {
  text: string;
  title?: string;
}

/** "TAS-1005 · Tạo 09:12 30/09 · Cập nhật 09:13 30/09" (full times in the titles). */
export function metaParts(task: Task, now: number): MetaPart[] {
  const parts: MetaPart[] = [];
  if (task.code) parts.push({ text: task.code });
  if (task.created != null) parts.push({ text: `Tạo ${shortStamp(task.created, now)}`, title: `Tạo lúc ${dateTimeText(task.created)}` });
  if (task.updated != null) parts.push({ text: `Cập nhật ${shortStamp(task.updated, now)}`, title: `Cập nhật lúc ${dateTimeText(task.updated)}` });
  return parts;
}

function MetaLine({ parts }: { parts: MetaPart[] }) {
  return (
    <p className="sheet-meta" data-testid="task-meta">
      {parts.map((p, i) => (
        <span key={p.text}>
          {i > 0 && ' · '}
          <span className="meta-part" title={p.title}>
            {p.text}
          </span>
        </span>
      ))}
    </p>
  );
}

export function TaskDialog(props: TaskDialogProps) {
  const { mode, task, me, roles, readOnly, now, directory, onClose, onEdit, onCancelEdit, onDelete, onCreate, onSave, onUpload, onUploadImage, onQuickStatus, onQuickChange, activities, statusFlow = null, confirming = false } = props;
  const [footer, setFooter] = useState<HTMLDivElement | null>(null);
  const formId = useId();
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const open = mode !== null && (mode === 'create' || task !== null) && me !== null;
  const meta = task ? metaParts(task, now) : [];

  const focusFor = useCallback((m: DialogMode | null) => {
    if (m === 'view') {
      (editRef.current ?? closeRef.current)?.focus(); // follow-only: no "Sửa", the ✕ takes the focus
    } else if (m) {
      const el = titleRef.current;
      if (!el) return;
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end); // caret after the existing name, ready to keep typing
    }
  }, []);

  // switching between view and edit keeps focus inside the popup, on the natural next control
  useEffect(() => {
    if (!open) return;
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    focusFor(mode);
  }, [open, mode, task?.id, focusFor]);

  // the form calls the API; the footer button reflects the pending request
  const submit = async (values: FormValues) => {
    setSaving(true);
    try {
      if (mode === 'create') await onCreate(values);
      else if (task) await onSave(task, values);
    } finally {
      setSaving(false);
    }
  };

  // phones (page scrolls): keep the page behind the popup still, like the design's html.locked
  useMobileScrollLock(open);

  // the personnel list loads lazily the first time a form opens
  const ensurePeople = directory.ensure;
  useEffect(() => {
    if (open && mode !== 'view') ensurePeople();
  }, [open, mode, ensurePeople]);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={o => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        {/*
          Plain scrim instead of Dialog.Overlay: the overlay brings react-remove-scroll, which injects a
          stylesheet and sets body{position:relative;overflow;padding} on every open/close — a full
          style + layout + repaint of the page (and re-raster of the blurred SVG background) each time.
          The desktop page never scrolls (only the list does); phones get html.locked below.
        */}
        <div className="scrim">
          <Dialog.Content
            className="sheet"
            data-testid="task-dialog"
            aria-describedby={undefined}
            onOpenAutoFocus={e => {
              e.preventDefault();
              focusFor(mode);
            }}
            onEscapeKeyDown={e => {
              if (saving || confirming) e.preventDefault();
              else if (mode === 'edit') {
                // Esc while editing goes back to the details without saving
                e.preventDefault();
                onCancelEdit();
              }
            }}
            // a press or focus outside never closes the popup (view, create or edit): only ✕, Esc or Huỷ do
            onInteractOutside={e => e.preventDefault()}
          >
            {open && mode && (
              <>
                <div className={`sheet-head${mode === 'view' ? ' sheet-head-view' : ''}`}>
                  {/* view mode: no heading here — the meta line sits next to the icons and the task name
                      below is the Dialog.Title (the popup is named after the task) */}
                  <div className="sheet-head-text">
                    {mode !== 'view' && (
                      <Dialog.Title asChild>
                        <h2>{SHEET_TITLE[mode]}</h2>
                      </Dialog.Title>
                    )}
                    {task && mode !== 'create' && meta.length > 0 && <MetaLine parts={meta} />}
                  </div>
                  <div className="sheet-actions">
                    {/* view mode: Sửa · Xoá as icons next to the ✕ (no footer); hidden for follow-only tasks */}
                    {mode === 'view' && task && !readOnly && (
                      <>
                        <button
                          ref={editRef}
                          className="icon-btn"
                          type="button"
                          data-testid="form-edit"
                          aria-label="Sửa"
                          title="Sửa"
                          onClick={onEdit}
                        >
                          <Pencil size={17} strokeWidth={1.9} aria-hidden="true" />
                        </button>
                        <button
                          className="icon-btn icon-danger"
                          type="button"
                          data-testid="form-delete"
                          aria-label="Xoá công việc"
                          title="Xoá công việc"
                          onClick={() => onDelete(task)}
                        >
                          <Trash2 size={17} strokeWidth={1.9} aria-hidden="true" />
                        </button>
                        <span className="sheet-actions-sep" aria-hidden="true" />
                      </>
                    )}
                    <Dialog.Close asChild>
                      <button ref={closeRef} className="icon-btn" type="button" aria-label="Đóng" title="Đóng" data-testid="dialog-close">
                        <X size={18} strokeWidth={2} aria-hidden="true" />
                      </button>
                    </Dialog.Close>
                  </div>
                </div>

                <div className="sheet-body" ref={bodyRef}>
                  {mode === 'view' && task ? (
                    <TaskView
                      task={task}
                      roles={roles}
                      readOnly={readOnly}
                      now={now}
                      quick={me && onQuickStatus && onQuickChange ? { me, directory, statusFlow, onStatus: onQuickStatus, onChange: onQuickChange } : undefined}
                    >
                      {activities?.(task)}
                    </TaskView>
                  ) : (
                    me && (
                      <TaskForm
                        key={`${mode}-${task?.id ?? 'new'}`}
                        formId={formId}
                        mode={mode === 'edit' ? 'edit' : 'create'}
                        task={mode === 'edit' ? task : null}
                        me={me}
                        now={now}
                        directory={directory}
                        titleRef={titleRef}
                        saving={saving}
                        footer={footer}
                        upload={onUpload}
                        uploadImage={onUploadImage}
                        statusFlow={statusFlow}
                        onCancel={mode === 'edit' ? onCancelEdit : onClose}
                        onSubmit={submit}
                      />
                    )
                  )}
                </div>

                {/* form footer: filled by TaskForm (files on the left · Huỷ · Lưu/Tạo) */}
                {mode !== 'view' && <div className="sheet-foot" ref={setFooter} />}
              </>
            )}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
