import {
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  FileText,
  Folder as FolderIcon,
  FolderOpen,
  FolderPlus,
  Layers,
  MoreHorizontal,
  NotebookPen,
  Pin as PinIcon,
  User,
  Users,
} from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { personName } from '../domain/people';
import { Avatar } from '../components/Person';
import { SCOPES, noteTitle, type FolderNode, type NotesTree, type SharedGroup } from './domain';
import { Highlight } from './Highlight';
import { ROOT_DROP, useTreeDrag, type DragItem } from './treeDrag';
import type { Folder, Note, Scope } from './types';

const SCOPE_ICON: Record<Scope, ReactNode> = {
  mine: <User size={18} strokeWidth={1.8} aria-hidden="true" />,
  shared: <Users size={18} strokeWidth={1.8} aria-hidden="true" />,
  all: <Layers size={18} strokeWidth={1.8} aria-hidden="true" />,
};

/** Inline name box of the tree: a new folder, or a folder being renamed. */
type Editing = { mode: 'new'; parentId: string | null } | { mode: 'rename'; id: string };

export interface NotesSidebarProps {
  id: string;
  windowControls: ReactNode;
  scope: Scope;
  onScope: (s: Scope) => void;
  counts: Record<Scope, number>;
  pinned: Note[];
  tree: NotesTree;
  groups: SharedGroup[];
  /** Folded search text ('' = no search: folders follow `expanded`). */
  query: string;
  currentId: string | null;
  expanded: ReadonlySet<string>;
  onToggleFolder: (id: string, open?: boolean) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onOpen: (note: Note) => void;
  onNewNote: (folderId: string | null) => void;
  /** Resolves once saved (the tree then shows the folder); rejects to keep the box open. */
  onCreateFolder: (name: string, parentId: string | null) => Promise<Folder>;
  onRenameFolder: (folder: Folder, name: string) => Promise<void>;
  onDeleteFolder: (folder: Folder) => void;
  /** Folder of the open note. */
  activeFolderId: string | null;
  /** Drag and drop in the tree: may `item` go into `folderId` (null = top level)? */
  canDrop?: (item: DragItem, folderId: string | null) => boolean;
  onDrop?: (item: DragItem, folderId: string | null) => void;
  totals: { notes: number; folders: number };
}

/** Rows of the tree in display order (for ↑/↓ and the roving tab stop). */
const treeItems = (root: HTMLElement | null) => Array.from(root?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []);

function NameBox({ initial, label, onCommit, onCancel }: { initial: string; label: string; onCommit: (name: string) => Promise<unknown>; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const done = useRef(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const commit = async () => {
    if (done.current || busy) return;
    const name = value.trim();
    if (!name || name === initial) {
      done.current = true;
      onCancel();
      return;
    }
    setBusy(true);
    try {
      await onCommit(name);
      done.current = true;
    } catch {
      setBusy(false); // the error toast is shown by the caller; the box stays for another try
      ref.current?.focus();
    }
  };
  return (
    <input
      ref={ref}
      className="name-input"
      data-testid="folder-name-input"
      aria-label={label}
      placeholder="Tên thư mục"
      maxLength={255}
      value={value}
      disabled={busy}
      onChange={e => setValue(e.target.value)}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          void commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          done.current = true;
          onCancel();
        }
      }}
      onBlur={() => void commit()}
    />
  );
}

function FolderMenu({ folder, onNewNote, onNewFolder, onRename, onDelete }: { folder: Folder; onNewNote: () => void; onNewFolder: () => void; onRename: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="tree-more"
          tabIndex={-1}
          aria-label={`Thao tác với thư mục “${folder.name}”`}
          data-testid="folder-menu"
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
        >
          <MoreHorizontal size={15} strokeWidth={2} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu-pop" align="start" sideOffset={4} collisionPadding={12} data-testid="folder-menu-list">
          <DropdownMenu.Item className="menu-item" onSelect={onNewNote}>
            Ghi chú mới trong thư mục này
          </DropdownMenu.Item>
          <DropdownMenu.Item className="menu-item" onSelect={onNewFolder}>
            Thư mục con mới
          </DropdownMenu.Item>
          <DropdownMenu.Item className="menu-item" onSelect={onRename}>
            Đổi tên
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="menu-sep" />
          <DropdownMenu.Item className="menu-item menu-danger" onSelect={onDelete}>
            Xoá thư mục
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * Left rail of the notes window (CONTRACT §9.2): quick filter, pinned notes, my folder tree (folder → sub-folder
 * → … → note, keyboard like a file tree) and the notes others shared with me, grouped by owner.
 */
export function NotesSidebar(props: NotesSidebarProps) {
  const { scope, tree, groups, query, currentId, expanded, onToggleFolder, onOpen } = props;
  const treeRef = useRef<HTMLUListElement>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const railRef = useRef<HTMLElement>(null);
  const { drag, start: startDrag } = useTreeDrag({
    canDrop: (item, folderId) => props.canDrop?.(item, folderId) ?? false,
    onDrop: (item, folderId) => props.onDrop?.(item, folderId),
    onHoverFolder: id => onToggleFolder(id, true),
    scroller: () => railRef.current,
  });
  const dropMark = (id: string) => (drag?.target === id ? (drag.ok ? 'ok' : 'no') : undefined);
  const draggable = Boolean(props.onDrop);
  const isOpen = (id: string) => !!query || expanded.has(id) || (editing?.mode === 'new' && editing.parentId === id);

  // the roving tab stop: the focused row, else the open note, else the first row
  useEffect(() => {
    const items = treeItems(treeRef.current);
    const stop = items.find(el => el.dataset.id === focusId) ?? items.find(el => el.dataset.id === currentId) ?? items[0];
    for (const el of items) el.tabIndex = el === stop ? 0 : -1;
  });

  const focusRow = (el: HTMLElement | undefined) => {
    if (!el) return;
    setFocusId(el.dataset.id ?? null);
    el.focus({ preventScroll: true });
    el.querySelector('.row')?.scrollIntoView?.({ block: 'nearest' });
  };

  const onTreeKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('[role="treeitem"]');
    if (!li || (e.target as HTMLElement).closest('input')) return;
    const items = treeItems(treeRef.current);
    const i = items.indexOf(li);
    const id = li.dataset.id!;
    const isFolder = li.dataset.kind === 'folder';
    const open = li.getAttribute('aria-expanded') === 'true';
    let to: HTMLElement | undefined;
    switch (e.key) {
      case 'ArrowDown':
        to = items[i + 1];
        break;
      case 'ArrowUp':
        to = items[i - 1];
        break;
      case 'Home':
        to = items[0];
        break;
      case 'End':
        to = items[items.length - 1];
        break;
      case 'ArrowRight':
        if (isFolder && !open) {
          e.preventDefault();
          onToggleFolder(id, true);
          return;
        }
        if (isFolder) to = li.querySelector<HTMLElement>('[role="treeitem"]') ?? undefined;
        break;
      case 'ArrowLeft':
        if (isFolder && open && !query) {
          e.preventDefault();
          onToggleFolder(id, false);
          return;
        }
        to = li.parentElement?.closest<HTMLElement>('[role="treeitem"]') ?? undefined;
        break;
      case 'Enter':
      case ' ': {
        e.preventDefault();
        if (isFolder) onToggleFolder(id);
        else {
          const note = findNote(tree, id);
          if (note) onOpen(note);
        }
        return;
      }
      case 'F2':
        if (isFolder) {
          e.preventDefault();
          setEditing({ mode: 'rename', id });
        }
        return;
      default:
        return;
    }
    e.preventDefault();
    focusRow(to);
  };

  const startNewFolder = (parentId: string | null) => {
    if (parentId) onToggleFolder(parentId, true);
    setEditing({ mode: 'new', parentId });
  };

  const newFolderBox = (parentId: string | null, lvl: number) =>
    editing?.mode === 'new' && editing.parentId === parentId ? (
      <li role="none" className="tree-edit" style={{ '--lvl': lvl } as CSSProperties}>
        <div className="row folder">
          <FolderIcon className="ico" size={16} strokeWidth={1.8} aria-hidden="true" />
          <NameBox
            initial=""
            label="Tên thư mục mới"
            onCancel={() => setEditing(null)}
            onCommit={async name => {
              const f = await props.onCreateFolder(name, parentId);
              setEditing(null);
              setFocusId(f.id);
            }}
          />
        </div>
      </li>
    ) : null;

  const folderRow = (node: FolderNode, lvl: number): ReactNode => {
    const f = node.folder;
    const open = isOpen(f.id);
    const renaming = editing?.mode === 'rename' && editing.id === f.id;
    return (
      <li
        key={f.id}
        role="treeitem"
        aria-level={lvl + 1}
        aria-expanded={open}
        aria-label={f.name}
        data-id={f.id}
        data-kind="folder"
        data-testid="folder-item"
        tabIndex={-1}
        style={{ '--lvl': lvl } as CSSProperties}
      >
        <div
          className="row folder"
          data-drop={draggable ? f.id : undefined}
          data-drop-target={dropMark(f.id)}
          data-dragging={drag?.item.id === f.id || undefined}
          onPointerDown={draggable && !renaming ? e => startDrag(e, { kind: 'folder', id: f.id, label: f.name }) : undefined}
          onMouseDown={e => {
            if (!(e.target as HTMLElement).closest('input, button')) e.preventDefault(); // no focus scroll of the whole sub-tree
          }}
          onClick={e => {
            if ((e.target as HTMLElement).closest('input, button')) return;
            setFocusId(f.id);
            onToggleFolder(f.id);
          }}
          onDoubleClick={e => {
            if (!(e.target as HTMLElement).closest('input, button')) setEditing({ mode: 'rename', id: f.id });
          }}
        >
          <ChevronRight className="chev" size={14} strokeWidth={2} aria-hidden="true" />
          {open ? <FolderOpen className="ico" size={16} strokeWidth={1.8} aria-hidden="true" /> : <FolderIcon className="ico" size={16} strokeWidth={1.8} aria-hidden="true" />}
          {renaming ? (
            <NameBox
              initial={f.name}
              label={`Đổi tên thư mục “${f.name}”`}
              onCancel={() => setEditing(null)}
              onCommit={async name => {
                await props.onRenameFolder(f, name);
                setEditing(null);
              }}
            />
          ) : (
            <span className="name">
              <Highlight text={f.name} query={query} />
            </span>
          )}
          {node.count > 0 && !renaming && (
            <span className="cnt" aria-label={`${node.count} ghi chú`}>
              {node.count}
            </span>
          )}
          {!renaming && (
            <FolderMenu
              folder={f}
              onNewNote={() => props.onNewNote(f.id)}
              onNewFolder={() => startNewFolder(f.id)}
              onRename={() => setEditing({ mode: 'rename', id: f.id })}
              onDelete={() => props.onDeleteFolder(f)}
            />
          )}
        </div>
        {open && (
          <ul role="group">
            {newFolderBox(f.id, lvl + 1)}
            {node.folders.map(c => folderRow(c, lvl + 1))}
            {node.notes.map(n => noteRow(n, lvl + 1))}
            {!node.folders.length && !node.notes.length && editing?.mode !== 'new' && (
              <li role="none" className="tree-hint" style={{ '--lvl': lvl + 1 } as CSSProperties}>
                Chưa có ghi chú
              </li>
            )}
          </ul>
        )}
      </li>
    );
  };

  const noteRow = (n: Note, lvl: number): ReactNode => (
    <li
      key={n.id}
      role="treeitem"
      aria-level={lvl + 1}
      aria-selected={n.id === currentId}
      aria-label={noteTitle(n)}
      data-id={n.id}
      data-kind="note"
      data-testid="note-item"
      tabIndex={-1}
      style={{ '--lvl': lvl } as CSSProperties}
    >
      <div
        className="row note"
        data-dragging={drag?.item.id === n.id || undefined}
        onPointerDown={draggable ? e => startDrag(e, { kind: 'note', id: n.id, label: noteTitle(n) }) : undefined}
        onMouseDown={e => e.preventDefault()}
        onClick={() => {
          setFocusId(n.id);
          onOpen(n);
        }}
      >
        <FileText size={16} strokeWidth={1.8} aria-hidden="true" />
        <span className="name">
          <Highlight text={noteTitle(n)} query={query} />
        </span>
        {props.pinned.some(p => p.id === n.id) && (
          <span className="pin" title="Đã ghim">
            <PinIcon size={12} strokeWidth={2} aria-hidden="true" />
          </span>
        )}
      </div>
    </li>
  );

  const treeEmpty = !tree.folders.length && !tree.notes.length && editing?.mode !== 'new';

  return (
    <aside className="side has-traffic notes-side" id={props.id} ref={railRef} data-dragging={drag ? 'true' : undefined}>
      {props.windowControls}
      <h1 className="brand">
        <span className="logo notes-logo">
          <NotebookPen size={18} strokeWidth={2.4} aria-hidden="true" />
        </span>
        Ghi chú
      </h1>

      <nav className="quick" aria-label="Bộ lọc nhanh">
        <p className="side-label">Bộ lọc nhanh</p>
        {SCOPES.map(s => (
          <button key={s.id} type="button" className="qf" aria-pressed={scope === s.id} data-testid={`scope-${s.id}`} onClick={() => props.onScope(s.id)}>
            {SCOPE_ICON[s.id]}
            {s.label}
            <span className="count" data-testid={`scope-count-${s.id}`}>
              {props.counts[s.id]}
            </span>
          </button>
        ))}
      </nav>

      {props.pinned.length > 0 && (
        <section className="notes-pins" aria-labelledby={`${props.id}-pins`}>
          <p className="side-label" id={`${props.id}-pins`}>
            Đã ghim
          </p>
          <ul>
            {props.pinned.map(n => (
              <li key={n.id}>
                <button type="button" className="qf pin-item" aria-current={n.id === currentId ? 'page' : undefined} data-testid="pinned-note" onClick={() => onOpen(n)}>
                  <PinIcon size={16} strokeWidth={1.8} aria-hidden="true" />
                  <span className="label">{noteTitle(n)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {scope !== 'shared' && (
        <section className="notes-tree-sec" aria-labelledby={`${props.id}-tree`}>
          <div className="side-head">
            <p className="side-label" id={`${props.id}-tree`}>
              Thư mục
            </p>
            {drag && (
              <div className="tree-root-drop" data-drop={ROOT_DROP} data-drop-target={dropMark(ROOT_DROP)} data-testid="tree-root-drop">
                Thả vào đây để đưa ra thư mục gốc
              </div>
            )}
            <div className="side-tools">
              <button
                type="button"
                className="mini-btn"
                aria-label="Tạo thư mục"
                title="Tạo thư mục ở thư mục gốc (thư mục con: menu ⋯ của thư mục)"
                data-testid="new-folder"
                onClick={() => startNewFolder(null)}
              >
                <FolderPlus size={15} strokeWidth={1.8} aria-hidden="true" />
              </button>
              <button type="button" className="mini-btn" aria-label="Mở rộng tất cả" title="Mở rộng tất cả" data-testid="expand-all" onClick={props.onExpandAll}>
                <ChevronsUpDown size={15} strokeWidth={1.8} aria-hidden="true" />
              </button>
              <button type="button" className="mini-btn" aria-label="Thu gọn tất cả" title="Thu gọn tất cả" data-testid="collapse-all" onClick={props.onCollapseAll}>
                <ChevronsDownUp size={15} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
          </div>
          <ul className="tree" role="tree" aria-labelledby={`${props.id}-tree`} ref={treeRef} onKeyDown={onTreeKey} data-testid="notes-tree">
            {newFolderBox(null, 0)}
            {tree.folders.map(n => folderRow(n, 0))}
            {tree.notes.map(n => noteRow(n, 0))}
          </ul>
          {treeEmpty && (
            <p className="tree-empty" data-testid="tree-empty">
              {query ? 'Không có ghi chú nào của bạn khớp tìm kiếm.' : 'Chưa có thư mục hay ghi chú nào. Bấm “Ghi chú mới” để bắt đầu.'}
            </p>
          )}
        </section>
      )}

      {scope !== 'mine' && (
        <section className="notes-shared" aria-labelledby={`${props.id}-shared`} data-testid="shared-section">
          <p className="side-label" id={`${props.id}-shared`}>
            Được chia sẻ
          </p>
          {groups.map(g => (
            <div className="shared-group" key={g.key} data-testid="shared-group">
              <p className="shared-owner">
                {g.owner && <Avatar person={g.owner} />}
                <span>{personName(g.owner) || 'Không rõ người chia sẻ'}</span>
              </p>
              <ul>
                {g.notes.map(n => (
                  <li key={n.id}>
                    <button type="button" className="row note shared-note" aria-current={n.id === currentId ? 'page' : undefined} data-testid="shared-note" data-id={n.id} onClick={() => onOpen(n)}>
                      <FileText size={16} strokeWidth={1.8} aria-hidden="true" />
                      <span className="name">
                        <Highlight text={noteTitle(n)} query={query} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {!groups.length && (
            <p className="tree-empty" data-testid="shared-empty">
              {query ? 'Không có ghi chú được chia sẻ nào khớp tìm kiếm.' : 'Chưa có ai chia sẻ ghi chú với bạn.'}
            </p>
          )}
        </section>
      )}

      <p className="side-foot" data-testid="notes-totals">
        {props.totals.notes} ghi chú · {props.totals.folders} thư mục
      </p>
      {drag &&
        createPortal(
          <div className="drag-ghost" style={{ left: drag.x + 14, top: drag.y + 10 }} data-ok={drag.ok || undefined} data-testid="drag-ghost" aria-hidden="true">
            {drag.item.kind === 'folder' ? <FolderIcon size={15} strokeWidth={1.8} /> : <FileText size={15} strokeWidth={1.8} />}
            <span>{drag.item.label}</span>
          </div>,
          document.body,
        )}
    </aside>
  );
}

function findNote(tree: NotesTree, id: string): Note | undefined {
  const inNodes = (nodes: FolderNode[]): Note | undefined => {
    for (const n of nodes) {
      const hit = n.notes.find(x => x.id === id) ?? inNodes(n.folders);
      if (hit) return hit;
    }
    return undefined;
  };
  return tree.notes.find(n => n.id === id) ?? inNodes(tree.folders);
}
