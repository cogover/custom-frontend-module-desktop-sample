import { AlertDialog } from 'radix-ui';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Page } from '../api/tasks';
import { errorMessage } from '../api/client';
import { activityHtml, activityTypeLabel, canManageActivity, type Activity, type NewNote } from '../domain/activities';
import { dateTimeText, shortStamp } from '../domain/dates';
import type { InlineImage } from '../domain/inlineImages';
import { mentionContextForTask, type MentionCandidate, type MentionSource } from '../domain/mentions';
import { personName } from '../domain/people';
import { htmlToText } from '../domain/text';
import type { Person } from '../domain/types';
import { AttachmentLinks } from './Attachments';
import { DescriptionField, type DescriptionApi } from './DescriptionField';
import { useConfirmLayer } from '../hooks/useConfirmLayer';
import { Avatar } from './Person';

export interface ActivitiesApi {
  list: (taskId: string, searchAfter?: unknown[]) => Promise<Page<Activity>>;
  create: (note: NewNote) => Promise<Activity>;
  /** Changes my own note (content; pictures pasted now join its `_attachments`) and reads it back. */
  update?: (id: string, html: string, images: InlineImage[]) => Promise<Activity>;
  /** Deletes my own note. */
  remove?: (id: string) => Promise<void>;
  uploadImage: (file: File, signal: AbortSignal) => Promise<InlineImage>;
  /** People for "@" in a note (name or e-mail; me excluded). */
  searchPeople?: (query: string, signal: AbortSignal) => Promise<MentionCandidate[]>;
}

const UNKNOWN: Person = { id: '?', firstName: 'Không rõ', lastName: '', avatarUrl: null };

interface ActivityItemProps {
  item: Activity;
  now: number;
  /** "Sửa" / "Xoá" on my own notes (absent: read only). */
  onEdit?: () => void;
  onDelete?: () => void;
  /** The note editor shown in place of the content while editing. */
  editor?: ReactNode;
}

function ActivityItem({ item, now, onEdit, onDelete, editor }: ActivityItemProps) {
  const author = item.author ?? UNKNOWN;
  const html = activityHtml(item.content);
  return (
    <li className="act" data-testid="activity-item" data-activity-id={item.id} data-type={item.type}>
      <Avatar person={author} />
      <div className="act-body">
        <p className="act-head">
          <span className="act-author">{personName(author) || author.id}</span>
          <span className="act-type" data-type={item.type}>
            {activityTypeLabel(item.type)}
          </span>
          {item.subject && <span className="act-subject">{item.subject}</span>}
          {item.at != null && (
            <time className="act-time" dateTime={new Date(item.at).toISOString()} title={dateTimeText(item.at)}>
              {shortStamp(item.at, now)}
            </time>
          )}
          {(onEdit || onDelete) && !editor && (
            <span className="act-actions">
              {onEdit && (
                <button type="button" className="icon-btn act-btn" aria-label="Sửa ghi chú" data-testid="activity-edit" onClick={onEdit}>
                  <Pencil size={14} strokeWidth={1.9} aria-hidden="true" />
                </button>
              )}
              {onDelete && (
                <button type="button" className="icon-btn icon-danger act-btn" aria-label="Xoá ghi chú" data-testid="activity-delete" onClick={onDelete}>
                  <Trash2 size={14} strokeWidth={1.9} aria-hidden="true" />
                </button>
              )}
            </span>
          )}
        </p>
        {editor ??
          /* sanitised for display (DOMPurify): no scripts, event handlers or inline styles */
          (html && <div className="v-html act-content" data-testid="activity-content" dangerouslySetInnerHTML={{ __html: html }} />)}
        {item.files.length > 0 && <AttachmentLinks files={item.files} />}
      </div>
    </li>
  );
}

interface NoteComposerProps {
  taskId: string;
  me: Person;
  api: ActivitiesApi;
  onDone: (a: Activity) => void;
  onCancel: () => void;
  /** Editing this note (its content is loaded; unchanged content just closes the editor). */
  note?: Activity;
}

/**
 * "Thêm ghi chú" / editing my note: the content only (rich text, focused at once); pasted pictures go to the
 * note's `_attachments`; "@" mentions people (Cogover notifies them when the note is saved).
 */
function NoteComposer({ taskId, me, api, onDone, onCancel, note }: NoteComposerProps) {
  const tid = note ? 'activity-edit' : 'activity';
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const content = useRef<DescriptionApi>(null);
  const search = api.searchPeople;
  const mentions = useMemo<MentionSource | undefined>(
    () => (search ? { search, context: mentionContextForTask(taskId) } : undefined),
    [search, taskId],
  );
  const submit = async () => {
    if (saving || busy) return;
    const read = content.current?.read();
    if (note && read === null) {
      onCancel(); // nothing changed
      return;
    }
    const html = read ?? '';
    if (!htmlToText(html).trim() && !/<img\b/i.test(html)) {
      setError('Nhập nội dung ghi chú');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const pasted = content.current?.images() ?? [];
      const saved = note && api.update ? await api.update(note.id, html, pasted) : await api.create({ taskId, html, images: pasted.map(i => i.meta) });
      onDone(saved.author ? saved : { ...saved, author: note?.author ?? me });
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };
  return (
    <div className="act-composer" data-testid={note ? 'activity-edit-composer' : 'activity-composer'}>
      <DescriptionField
        editing={!!note}
        initialHtml={note?.content ?? ''}
        apiRef={content}
        uploadImage={api.uploadImage}
        onImagesBusy={setBusy}
        label="Nội dung"
        placeholder="Viết ghi chú… (gõ @ để nhắc đến ai đó)"
        testId={`${tid}-content-editor`}
        optional={false}
        autoFocus
        mentions={mentions}
      />
      {error && (
        <p className="err" role="alert" data-testid={`${tid}-error`}>
          {error}
        </p>
      )}
      <div className="act-composer-actions">
        <button type="button" className="btn-ghost" data-testid={`${tid}-cancel`} disabled={saving} onClick={onCancel}>
          Huỷ
        </button>
        <button type="button" className="btn-primary" data-testid={`${tid}-submit`} disabled={saving || busy} onClick={submit}>
          {saving ? 'Đang lưu…' : busy ? 'Đang tải ảnh…' : 'Lưu ghi chú'}
        </button>
      </div>
    </div>
  );
}

/** "Xoá ghi chú?" over the task popup: "Huỷ" has the focus, Esc only closes this box. */
function ConfirmNoteDelete({ note, onCancel, onConfirm }: { note: Activity | null; onCancel: () => void; onConfirm: (a: Activity) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const open = note !== null;
  const restoreFocus = useConfirmLayer(open, busy, onCancel);
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={o => {
        if (!o && !busy) onCancel();
      }}
    >
      <AlertDialog.Portal>
        <div className="scrim confirm-scrim">
          <AlertDialog.Content className="sheet confirm-sheet" data-testid="confirm-note-delete" onCloseAutoFocus={restoreFocus}>
            <AlertDialog.Title asChild>
              <h2>Xoá ghi chú?</h2>
            </AlertDialog.Title>
            <AlertDialog.Description className="confirm-text">Ghi chú sẽ bị xoá vĩnh viễn khỏi Cogover.</AlertDialog.Description>
            <div className="sheet-foot">
              <AlertDialog.Cancel asChild>
                <button className="btn-ghost" type="button" data-testid="confirm-note-delete-cancel" disabled={busy}>
                  Huỷ
                </button>
              </AlertDialog.Cancel>
              <button
                className="btn-danger"
                type="button"
                data-testid="confirm-note-delete-ok"
                disabled={busy}
                onClick={async () => {
                  if (!note) return;
                  setBusy(true);
                  try {
                    await onConfirm(note);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? 'Đang xoá…' : 'Xoá'}
              </button>
            </div>
          </AlertDialog.Content>
        </div>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/**
 * "Hoạt động" of a task (CONTRACT §5.3c): every activity linked by `activity.Task`, newest first, 15 at a
 * time; anyone who can open the task may add a note, and change or delete their own notes.
 */
export function ActivityPanel({
  taskId,
  me,
  now,
  api,
  onNoteAdded,
  onToast,
}: {
  taskId: string;
  me: Person;
  now: number;
  api: ActivitiesApi;
  onNoteAdded?: () => void;
  /** Short messages after editing / deleting a note. */
  onToast?: (message: string) => void;
}) {
  const [items, setItems] = useState<Activity[]>([]);
  const [total, setTotal] = useState(0);
  const [next, setNext] = useState<unknown[]>([]);
  const [last, setLast] = useState(true);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [more, setMore] = useState(false);
  const [composing, setComposing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Activity | null>(null);
  const run = useRef(0);

  const load = useCallback(() => {
    const id = ++run.current;
    setStatus('loading');
    api.list(taskId).then(
      page => {
        if (id !== run.current) return;
        setItems(page.rows);
        setTotal(page.total);
        setNext(page.searchAfter);
        setLast(page.last);
        setStatus('ready');
      },
      e => {
        if (id !== run.current) return;
        setError(errorMessage(e));
        setStatus('error');
      },
    );
  }, [api, taskId]);

  useEffect(() => {
    setComposing(false);
    setEditingId(null);
    load();
    return () => {
      run.current++;
    };
  }, [load]);

  const loadMore = async () => {
    const id = run.current;
    setMore(true);
    try {
      const page = await api.list(taskId, next);
      if (id !== run.current) return;
      setItems(list => [...list, ...page.rows.filter(r => !list.some(x => x.id === r.id))]);
      setNext(page.searchAfter);
      setLast(page.last);
    } catch (e) {
      if (id === run.current) setError(errorMessage(e));
    } finally {
      if (id === run.current) setMore(false);
    }
  };

  return (
    <section className="v-acts" data-testid="activities" aria-labelledby={`acts-${taskId}`}>
      <div className="v-acts-head">
        <h3 id={`acts-${taskId}`}>
          Hoạt động
          {status === 'ready' && total > 0 && (
            <>
              {' '}
              <span className="v-acts-count">· {total}</span>
            </>
          )}
        </h3>
        {!composing && (
          <button type="button" className="btn-ghost act-add" data-testid="activity-add" onClick={() => setComposing(true)}>
            <Plus size={15} strokeWidth={2} aria-hidden="true" />
            Thêm ghi chú
          </button>
        )}
      </div>
      {composing && (
        <NoteComposer
          taskId={taskId}
          me={me}
          api={api}
          onCancel={() => setComposing(false)}
          onDone={created => {
            setItems(list => [created, ...list.filter(x => x.id !== created.id)]);
            setTotal(n => n + 1);
            setComposing(false);
            if (status !== 'ready') setStatus('ready');
            onNoteAdded?.();
          }}
        />
      )}
      {status === 'loading' && (
        <p className="muted" data-testid="activities-loading" role="status">
          Đang tải hoạt động…
        </p>
      )}
      {status === 'error' && (
        <p className="err" data-testid="activities-error" role="alert">
          Không tải được hoạt động: {error}{' '}
          <button type="button" className="link-btn" data-testid="activities-retry" onClick={load}>
            Thử lại
          </button>
        </p>
      )}
      {status === 'ready' && items.length === 0 && (
        <p className="muted" data-testid="activities-empty">
          Chưa có hoạt động nào
        </p>
      )}
      {items.length > 0 && status !== 'loading' && (
        <ul className="acts" aria-label="Danh sách hoạt động">
          {items.map(a => {
            const mine = canManageActivity(a, me.id);
            return (
              <ActivityItem
                key={a.id}
                item={a}
                now={now}
                onEdit={mine && api.update ? () => setEditingId(a.id) : undefined}
                onDelete={mine && api.remove ? () => setDeleting(a) : undefined}
                editor={
                  editingId === a.id ? (
                    <NoteComposer
                      taskId={taskId}
                      me={me}
                      api={api}
                      note={a}
                      onCancel={() => setEditingId(null)}
                      onDone={saved => {
                        setItems(list => list.map(x => (x.id === saved.id ? saved : x)));
                        setEditingId(null);
                        onToast?.('Đã sửa ghi chú');
                      }}
                    />
                  ) : undefined
                }
              />
            );
          })}
        </ul>
      )}
      {status === 'ready' && !last && items.length < total && (
        <button type="button" className="btn-ghost act-more" data-testid="activities-more" disabled={more} onClick={loadMore}>
          {more ? 'Đang tải…' : `Xem thêm (${total - items.length})`}
        </button>
      )}
      <ConfirmNoteDelete
        note={deleting}
        onCancel={() => setDeleting(null)}
        onConfirm={async note => {
          try {
            await api.remove?.(note.id);
            setItems(list => list.filter(x => x.id !== note.id));
            setTotal(n => Math.max(0, n - 1));
            onToast?.('Đã xoá ghi chú');
          } catch (e) {
            onToast?.(`Không xoá được ghi chú: ${errorMessage(e)}`);
          }
          setDeleting(null);
        }}
      />
    </section>
  );
}
