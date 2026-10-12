import { ChevronRight, Clock, Globe, Link2, ListTree, Lock, Pencil, Pin, Share2, Trash2, Users } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Avatar } from '../components/Person';
import { dateTimeText, shortStamp } from '../domain/dates';
import { personName } from '../domain/people';
import { FORMAT_LABEL, VISIBILITY_LABEL, noteTitle } from './domain';
import { contentToHtml } from './markdown';
import type { Folder, Note, Visibility } from './types';

const VISIBILITY_ICON: Record<Visibility, ReactNode> = {
  private: <Lock size={13} strokeWidth={2} aria-hidden="true" />,
  shared: <Users size={13} strokeWidth={2} aria-hidden="true" />,
  public: <Globe size={13} strokeWidth={2} aria-hidden="true" />,
};

export interface NoteViewProps {
  note: Note;
  /** Folders from the top level to the note's folder (mine only). */
  path: Folder[];
  mine: boolean;
  canEdit: boolean;
  pinned: boolean;
  tocOn: boolean;
  now: number;
  scroller: RefObject<HTMLDivElement | null>;
  onToggleToc: () => void;
  onPin: () => void;
  onCopyLink: () => void;
  onShare: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRevealFolder: (folderId: string) => void;
}

interface Heading {
  level: number;
  text: string;
}

const HEADINGS = 'h1, h2, h3';

function headingsOf(html: string): Heading[] {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.querySelectorAll(HEADINGS))
    .map(h => ({ level: Number(h.tagName[1]), text: (h.textContent ?? '').trim() }))
    .filter(h => h.text);
}

function IconButton({ label, onClick, pressed, on, testId, danger, children }: { label: string; onClick: () => void; pressed?: boolean; on?: boolean; testId: string; danger?: boolean; children: ReactNode }) {
  return (
    <button type="button" className={danger ? 'icon-btn icon-danger' : 'icon-btn'} aria-label={label} title={label} aria-pressed={pressed} data-on={on || undefined} data-testid={testId} onClick={onClick}>
      {children}
    </button>
  );
}

/**
 * One note (CONTRACT §9.3): breadcrumb, title, actions (table of contents, pin, link, share, edit, delete — each
 * only when allowed), owner / visibility / last change, tags, then the content as safe HTML. "Trên trang này"
 * (h1–h3) is off by default and only offered when there are two headings or more and room beside the note.
 */
export function NoteView(props: NoteViewProps) {
  const { note, path, mine, canEdit, pinned, tocOn, now, scroller } = props;
  const titleId = useId();
  const html = useMemo(() => contentToHtml(note.content), [note.content]);
  const headings = useMemo(() => headingsOf(html), [html]);
  const hasToc = headings.length >= 2;
  const proseRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  // the table of contents follows the heading being read
  useEffect(() => {
    const sc = scroller.current;
    if (!sc || !hasToc || !tocOn) return;
    let frame = 0;
    const spy = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const hs = Array.from(proseRef.current?.querySelectorAll<HTMLElement>(HEADINGS) ?? []).filter(h => h.textContent?.trim());
        const line = sc.getBoundingClientRect().top + 90;
        let at = 0;
        hs.forEach((h, i) => {
          if (h.getBoundingClientRect().top <= line) at = i;
        });
        if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4) at = hs.length - 1;
        setActive(Math.max(0, at));
      });
    };
    sc.addEventListener('scroll', spy, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      sc.removeEventListener('scroll', spy);
    };
  }, [scroller, hasToc, tocOn, html]);

  const goTo = (i: number) => {
    const hs = Array.from(proseRef.current?.querySelectorAll<HTMLElement>(HEADINGS) ?? []).filter(h => h.textContent?.trim());
    hs[i]?.scrollIntoView?.({ block: 'start' });
    setActive(i);
  };

  const owner = note.owner;
  const changedBy = note.updatedBy && note.updatedBy.id !== owner?.id ? personName(note.updatedBy) : '';

  return (
    <div className="doc" data-toc={hasToc && tocOn ? '' : undefined} data-testid="note-view" data-note-id={note.id}>
      <article className="doc-main" aria-labelledby={titleId}>
        <nav className="crumbs" aria-label="Vị trí ghi chú">
          {mine ? (
            path.length ? (
              path.map((f, i) => (
                <span key={f.id} className="crumb-part">
                  {i > 0 && <ChevronRight size={12} strokeWidth={2} aria-hidden="true" />}
                  <button type="button" className="crumb" data-testid="crumb" onClick={() => props.onRevealFolder(f.id)}>
                    {f.name}
                  </button>
                </span>
              ))
            ) : (
              <span className="crumb-text">Không thuộc thư mục nào</span>
            )
          ) : (
            <span className="crumb-text" data-testid="shared-by">
              Được chia sẻ bởi {personName(owner) || 'người khác'}
            </span>
          )}
        </nav>

        <div className="doc-head">
          <h1 id={titleId} data-testid="note-title">
            {noteTitle(note)}
          </h1>
          <div className="doc-actions">
            {hasToc && (
              <span className="toc-toggle">
                <IconButton label={tocOn ? 'Ẩn mục lục' : 'Hiện mục lục'} pressed={tocOn} testId="toc-toggle" onClick={props.onToggleToc}>
                  <ListTree size={18} strokeWidth={1.8} aria-hidden="true" />
                </IconButton>
              </span>
            )}
            <IconButton label={pinned ? 'Bỏ ghim' : 'Ghim ghi chú'} pressed={pinned} testId="note-pin" onClick={props.onPin}>
              <Pin size={18} strokeWidth={1.8} aria-hidden="true" />
            </IconButton>
            <IconButton label="Sao chép liên kết" testId="note-copy-link" onClick={props.onCopyLink}>
              <Link2 size={18} strokeWidth={1.8} aria-hidden="true" />
            </IconButton>
            {mine && (
              <IconButton
                label={note.visibility === 'shared' ? 'Chia sẻ (đang chia sẻ cho người / phòng)' : note.visibility === 'public' ? 'Chia sẻ (đang công khai)' : 'Chia sẻ'}
                on={note.visibility !== 'private'}
                testId="note-share"
                onClick={props.onShare}
              >
                <Share2 size={18} strokeWidth={1.8} aria-hidden="true" />
              </IconButton>
            )}
            {canEdit && (
              <IconButton label="Sửa ghi chú" testId="note-edit" onClick={props.onEdit}>
                <Pencil size={18} strokeWidth={1.8} aria-hidden="true" />
              </IconButton>
            )}
            {mine && (
              <IconButton label="Xoá ghi chú" testId="note-delete" danger onClick={props.onDelete}>
                <Trash2 size={18} strokeWidth={1.8} aria-hidden="true" />
              </IconButton>
            )}
          </div>
        </div>

        <div className="doc-meta">
          {owner && (
            <span className="m" data-testid="note-owner">
              <Avatar person={owner} />
              {personName(owner) || 'Không rõ tên'}
            </span>
          )}
          <span className="m vis" data-visibility={note.visibility} data-testid="note-visibility">
            {VISIBILITY_ICON[note.visibility]}
            {VISIBILITY_LABEL[note.visibility]}
          </span>
          {note.updated != null && (
            <span className="m" title={dateTimeText(note.updated)}>
              <Clock size={13} strokeWidth={2} aria-hidden="true" />
              Cập nhật {shortStamp(note.updated, now)}
              {changedBy ? ` bởi ${changedBy}` : ''}
            </span>
          )}
          <span className="m fmt">{FORMAT_LABEL[note.content.format]}</span>
        </div>

        {note.tags.length > 0 && (
          <div className="tags" data-testid="note-tags">
            {note.tags.map(t => (
              <span className="tag" key={t.id}>
                #{t.name || t.id}
              </span>
            ))}
          </div>
        )}

        <hr className="doc-rule" />

        {html ? (
          // sanitised for display (DOMPurify): no scripts, event handlers, inline styles, forms or frames
          <div className="v-html prose" ref={proseRef} data-testid="note-content" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <p className="muted" data-testid="note-empty">
            Ghi chú này chưa có nội dung.
          </p>
        )}
      </article>

      {hasToc && tocOn && (
        <aside className="toc" aria-label="Mục lục" data-testid="toc">
          <p className="toc-title">Trên trang này</p>
          <ul>
            {headings.map((h, i) => (
              <li key={i}>
                <button type="button" data-level={h.level} aria-current={i === active ? 'location' : undefined} onClick={() => goTo(i)}>
                  {h.text}
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
