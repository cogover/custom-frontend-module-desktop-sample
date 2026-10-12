import { ChevronLeft, Moon, NotebookPen, Plus, Search, Sun } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { errorMessage, isSessionExpired } from '../api/client';
import { SideResizer, SideToggle } from '../components/SideRail';
import { ErrorState, LoadingState, SessionExpiredState } from '../components/StateBox';
import { Toast } from '../components/Toast';
import { NOTES_APP, searchFromUrl, useWindowUrl } from '../desktop/url';
import { WindowControls, type WindowApi } from '../desktop/WindowControls';
import { readStorage, writeStorage } from '../domain/storage';
import { fold } from '../domain/text';
import type { Person } from '../domain/types';
import { useNow } from '../hooks/useNow';
import { useSideRail } from '../hooks/useSideRail';
import { useTheme } from '../hooks/useTheme';
import { useToast } from '../hooks/useToast';
import { notesApi, type NotesApi } from './api';
import {
  buildTree,
  canEditNote,
  canMoveFolder,
  canMoveNote,
  filterGroups,
  filterTree,
  folderIsEmpty,
  folderOptions,
  folderPath,
  groupByOwner,
  isOwner,
  noteTitle,
  parseScope,
  sharedWithMe,
} from './domain';
import { NoteEditor } from './NoteEditor';
import { NotesConfirm, type ConfirmAsk } from './NotesConfirm';
import { NOTES_LOADING, NOTES_SIDE_DEFAULT, NOTES_STORAGE } from './notesConfig';
import { NotesSidebar } from './NotesSidebar';
import { NoteView } from './NoteView';
import { ShareDialog } from './ShareDialog';
import type { DragItem } from './treeDrag';
import type { Folder, Note, NoteDraft, Ref, Scope, ShareEntry, Visibility } from './types';
import { useNotesStore } from './useNotesStore';
import './notes.css';

type Route = { view: 'none' } | { view: 'note'; id: string } | { view: 'edit'; id: string } | { view: 'new'; folderId: string | null };

const HASH_NOTE = /^#\/note\/([^/?#]+)/;

export function noteIdFromHash(hash: string = window.location.hash): string | null {
  const m = HASH_NOTE.exec(hash);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

const setNoteHash = (id: string) => window.history.replaceState(window.history.state, '', `#/note/${encodeURIComponent(id)}`);
const clearNoteHash = () => {
  if (noteIdFromHash()) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
};

const loadExpanded = (): Set<string> => {
  try {
    const v = JSON.parse(readStorage(NOTES_STORAGE.expanded) ?? '[]');
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
};

export interface NotesAppProps {
  api?: NotesApi;
  /** Set when the notes run as a window of the desktop (Desktop.tsx). */
  win?: WindowApi;
}

/**
 * "Ghi chú" — the second app of the SPA (CONTRACT §9): my folders and notes, the notes others share with me,
 * a note's page (view / edit) and its sharing, on the four `notes_*` objects of the Workspace.
 */
export default function NotesApp({ api = notesApi, win }: NotesAppProps) {
  const store = useNotesStore(api);
  const { load, me, folders, notes, myDepts, pins, tags } = store;
  const { theme, toggle: toggleTheme } = useTheme();
  const { toast, show: showToast, hide: hideToast } = useToast();
  const now = useNow();
  const hidden = Boolean(win?.hidden);
  const rail = useSideRail(!hidden, { storageKey: NOTES_STORAGE.side, defaultWidth: NOTES_SIDE_DEFAULT });
  const sideId = useId();
  const boardRef = useRef<HTMLElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [scope, setScopeState] = useState<Scope>(() => parseScope(readStorage(NOTES_STORAGE.scope)));
  const [queryRaw, setQueryRaw] = useState(() => (win ? searchFromUrl(NOTES_APP) : ''));
  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded);
  const [tocOn, setTocOn] = useState(() => readStorage(NOTES_STORAGE.toc) === '1');
  const [route, setRoute] = useState<Route>(() => {
    const id = noteIdFromHash();
    return id ? { view: 'note', id } : { view: 'none' };
  });
  const [pane, setPane] = useState<'tree' | 'note'>(() => (noteIdFromHash() ? 'note' : 'tree'));
  const [shareId, setShareId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAsk | null>(null);
  const [directory, setDirectory] = useState<{ people: Person[]; departments: Ref[]; error: string; started: boolean }>({ people: [], departments: [], error: '', started: false });

  const meId = me?.id ?? null;
  const query = fold(queryRaw.trim());
  const latest = useRef({ route, hidden, dialog: false });
  latest.current = { route, hidden, dialog: shareId !== null || confirm !== null };

  // ---- derived lists ----
  const myNotes = useMemo(() => notes.filter(n => isOwner(n, meId)), [notes, meId]);
  const sharedNotes = useMemo(() => notes.filter(n => sharedWithMe(n, meId, myDepts)), [notes, meId, myDepts]);
  const tree = useMemo(() => buildTree(folders, myNotes), [folders, myNotes]);
  const shownTree = useMemo(() => filterTree(tree, query), [tree, query]);
  const groups = useMemo(() => filterGroups(groupByOwner(sharedNotes), query), [sharedNotes, query]);
  const counts: Record<Scope, number> = { mine: myNotes.length, shared: sharedNotes.length, all: myNotes.length + sharedNotes.length };
  const inScope = useCallback(
    (n: Note) => (scope === 'mine' ? isOwner(n, meId) : scope === 'shared' ? sharedWithMe(n, meId, myDepts) : isOwner(n, meId) || sharedWithMe(n, meId, myDepts)),
    [scope, meId, myDepts],
  );
  const pinned = useMemo(
    () =>
      [...pins]
        .sort((a, b) => a.order - b.order)
        .map(p => notes.find(n => n.id === p.noteId))
        .filter((n): n is Note => !!n && inScope(n)),
    [pins, notes, inScope],
  );

  const current = route.view === 'note' || route.view === 'edit' ? (notes.find(n => n.id === route.id) ?? null) : null;
  const activeFolderId = current && isOwner(current, meId) ? current.folderId : route.view === 'new' ? route.folderId : null;

  // ---- persisted view state ----
  const setScope = (s: Scope) => {
    setScopeState(s);
    writeStorage(NOTES_STORAGE.scope, s);
  };
  const saveExpanded = (next: Set<string>) => {
    setExpanded(next);
    writeStorage(NOTES_STORAGE.expanded, JSON.stringify([...next]));
  };
  const toggleFolder = (id: string, open?: boolean) => {
    const next = new Set(expanded);
    const willOpen = open ?? !next.has(id);
    if (willOpen) next.add(id);
    else next.delete(id);
    saveExpanded(next);
  };
  const expandTo = useCallback(
    (folderId: string | null, includeSelf = true) => {
      const path = folderPath(folders, folderId);
      if (!path.length) return;
      setExpanded(prev => {
        const next = new Set(prev);
        path.forEach((f, i) => {
          if (includeSelf || i < path.length - 1) next.add(f.id);
        });
        writeStorage(NOTES_STORAGE.expanded, JSON.stringify([...next]));
        return next;
      });
    },
    [folders],
  );

  // ---- route ↔ #/note/<id>, ?app=, ?q= ----
  useEffect(() => {
    if (route.view === 'note' || route.view === 'edit') setNoteHash(route.id);
    else if (!latest.current.hidden) clearNoteHash();
  }, [route]);
  // while in front, the URL holds this window (`?app=ghi-chu`, the search, the open note): a refresh comes back here
  useWindowUrl(Boolean(win) && !hidden, NOTES_APP, queryRaw, route.view === 'note' || route.view === 'edit' ? `#/note/${encodeURIComponent(route.id)}` : '');

  useEffect(() => {
    const onHash = () => {
      const id = noteIdFromHash();
      if (!id) return; // a task link (#/task/…) belongs to Công việc
      const r = latest.current.route;
      if ((r.view === 'note' || r.view === 'edit') && r.id === id) return;
      setRoute({ view: 'note', id });
      setPane('note');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // a link to a note that is not in my lists (public, or shared since the lists were loaded)
  const routeId = route.view === 'note' || route.view === 'edit' ? route.id : null;
  const known = routeId ? notes.some(n => n.id === routeId) : true;
  const fetchNote = store.fetchNote;
  useEffect(() => {
    if (load !== 'ready' || !routeId || known) return;
    let alive = true;
    fetchNote(routeId).then(
      n => {
        if (!alive || n) return;
        showToast('Không tìm thấy ghi chú này hoặc bạn không có quyền xem.');
        setRoute({ view: 'none' });
        setPane('tree');
      },
      e => {
        if (!alive || isSessionExpired(e)) return;
        showToast(`Không mở được ghi chú: ${errorMessage(e)}`);
        setRoute({ view: 'none' });
      },
    );
    return () => {
      alive = false;
    };
  }, [load, routeId, known, fetchNote, showToast]);

  // the open note's folders unfold once the data is there
  const openedFolder = current && isOwner(current, meId) ? current.folderId : null;
  useEffect(() => {
    if (openedFolder) expandTo(openedFolder);
  }, [openedFolder, expandTo]);

  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
  }, [route]);

  // ---- actions ----
  const fail = useCallback(
    (prefix: string) => (e: unknown) => {
      if (!isSessionExpired(e)) showToast(`${prefix}: ${errorMessage(e)}`);
    },
    [showToast],
  );

  const openNote = useCallback((n: Note) => {
    setRoute({ view: 'note', id: n.id });
    setPane('note');
  }, []);

  const newNote = useCallback(
    (folderId: string | null) => {
      if (!latest.current.dialog) {
        setRoute({ view: 'new', folderId });
        setPane('note');
      }
    },
    [],
  );

  const saveNew = async (draft: NoteDraft) => {
    const note = await store.createNote(draft);
    if (draft.folderId) expandTo(draft.folderId);
    setRoute({ view: 'note', id: note.id });
    showToast(`Đã tạo “${noteTitle(note)}”`);
  };

  const saveEdit = async (id: string, draft: NoteDraft) => {
    const note = await store.saveNote(id, draft);
    if (draft.folderId) expandTo(draft.folderId);
    setRoute({ view: 'note', id });
    showToast(`Đã lưu “${noteTitle(note)}”`);
  };

  const askDeleteNote = (n: Note) =>
    setConfirm({
      title: 'Xoá ghi chú?',
      text: `“${noteTitle(n)}” sẽ bị xoá vĩnh viễn khỏi Cogover, cả với những người được chia sẻ.`,
      okLabel: 'Xoá',
      run: () =>
        store.deleteNote(n.id).then(
          () => {
            setRoute({ view: 'none' });
            setPane('tree');
            showToast(`Đã xoá “${noteTitle(n)}”`);
          },
          fail(`Không xoá được “${noteTitle(n)}”`),
        ),
    });

  const togglePin = (n: Note) => {
    const on = pins.some(p => p.noteId === n.id);
    (on ? store.unpin(n.id) : store.pin(n.id)).then(() => showToast(on ? 'Đã bỏ ghim' : 'Đã ghim ghi chú'), fail(on ? 'Không bỏ ghim được' : 'Không ghim được'));
  };

  const copyLink = async (n: Note) => {
    const url = `${window.location.origin}${window.location.pathname}#/note/${encodeURIComponent(n.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Đã sao chép liên kết');
    } catch {
      showToast(`Liên kết: ${url}`);
    }
  };

  const needDirectory = useCallback(() => {
    setDirectory(d => {
      if (d.started) return d;
      Promise.all([api.listPeople(), api.listDepartments()]).then(
        ([people, departments]) => setDirectory(x => ({ ...x, people, departments, error: '' })),
        e => {
          if (isSessionExpired(e)) store.expire();
          setDirectory(x => ({ ...x, error: errorMessage(e), started: false }));
        },
      );
      return { ...d, started: true, error: '' };
    });
  }, [api, store]);

  const saveShare = async (n: Note, visibility: Visibility, entries: ShareEntry[]) => {
    await store.shareNote(n.id, visibility, entries);
    setShareId(null);
    showToast(visibility === 'private' ? 'Ghi chú đang ở chế độ riêng tư' : visibility === 'public' ? 'Ai có liên kết trong Workspace đều xem được' : 'Đã cập nhật chia sẻ');
  };

  const createFolder = async (name: string, parentId: string | null): Promise<Folder> => {
    try {
      const f = await store.createFolder(name, parentId);
      if (parentId) expandTo(parentId);
      if (scope === 'shared') setScope('all');
      showToast(`Đã tạo thư mục “${name}”`);
      return f;
    } catch (e) {
      fail('Không tạo được thư mục')(e);
      throw e;
    }
  };

  const renameFolder = async (f: Folder, name: string) => {
    try {
      await store.renameFolder(f.id, name);
      showToast(`Đã đổi tên thành “${name}”`);
    } catch (e) {
      fail('Không đổi được tên thư mục')(e);
      throw e;
    }
  };

  // ---- drag and drop in the tree (CONTRACT §9.3) ----
  const canDrop = (item: DragItem, folderId: string | null) =>
    item.kind === 'folder' ? canMoveFolder(folders, item.id, folderId) : canMoveNote(myNotes.find(n => n.id === item.id), folderId);

  const drop = async (item: DragItem, folderId: string | null) => {
    if (!canDrop(item, folderId)) return;
    const where = folderId ? `vào “${folders.find(f => f.id === folderId)?.name ?? ''}”` : 'ra thư mục gốc';
    try {
      if (item.kind === 'folder') await store.moveFolder(item.id, folderId);
      else await store.moveNote(item.id, folderId);
      if (folderId) expandTo(folderId);
      showToast(item.kind === 'folder' ? `Đã chuyển thư mục “${item.label}” ${where}` : `Đã chuyển “${item.label}” ${where}`);
    } catch (e) {
      fail(item.kind === 'folder' ? 'Không chuyển được thư mục' : 'Không chuyển được ghi chú')(e);
    }
  };

  const askDeleteFolder = (f: Folder) => {
    if (!folderIsEmpty(f.id, folders, myNotes)) {
      showToast(`“${f.name}” còn ghi chú hoặc thư mục con: chuyển hoặc xoá chúng trước.`);
      return;
    }
    setConfirm({
      title: 'Xoá thư mục?',
      text: `Thư mục trống “${f.name}” sẽ bị xoá.`,
      okLabel: 'Xoá',
      run: () => store.deleteFolder(f.id).then(() => showToast(`Đã xoá thư mục “${f.name}”`), fail('Không xoá được thư mục')),
    });
  };

  const revealFolder = (folderId: string) => {
    expandTo(folderId);
    if (scope === 'shared') setScope('all');
    setQueryRaw('');
    setPane('tree');
    window.setTimeout(() => {
      const row = document.querySelector<HTMLElement>(`.notes-side [data-kind="folder"][data-id="${CSS.escape(folderId)}"]`);
      row?.focus({ preventScroll: true });
      row?.querySelector('.row')?.scrollIntoView?.({ block: 'nearest' });
    }, 0);
  };

  // ---- keyboard: "/" search, "n" new note (outside fields, no dialog, window in front) ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const l = latest.current;
      if (l.hidden || l.dialog || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
      if (el?.closest('[role="menu"], [role="listbox"], [role="dialog"], [role="alertdialog"]')) return;
      if (e.key === '/') {
        e.preventDefault();
        if (!rail.desktop) setPane('tree');
        searchRef.current?.focus();
      } else if ((e.key === 'n' || e.key === 'N') && l.route.view !== 'new' && l.route.view !== 'edit') {
        e.preventDefault();
        newNote(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [newNote, rail.desktop]);

  // ---- render ----
  const ready = load === 'ready';
  const titleControls = (
    <WindowControls win={win}>
      <SideToggle hidden={rail.hidden} sideId={sideId} onToggle={rail.toggle} />
    </WindowControls>
  );
  const shareNote = shareId ? (notes.find(n => n.id === shareId) ?? null) : null;
  const dark = theme === 'dark';
  const themeLabel = dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối';

  let main;
  if (load === 'loading') {
    main = <LoadingState text={NOTES_LOADING} testId="notes-loading" />;
  } else if (load === 'error') main = <ErrorState message={store.error} onRetry={() => void store.reload()} />;
  else if (load === 'expired') main = <SessionExpiredState />;
  else if (route.view === 'new') {
    main = (
      <NoteEditor
        key={`new-${route.folderId ?? ''}`}
        mode="new"
        initial={{ title: '', folderId: route.folderId, content: { format: 2, value: '' }, tags: [] }}
        folders={folderOptions(tree)}
        tags={tags}
        onCreateTag={store.createTag}
        onCreateFolder={createFolder}
        onSave={saveNew}
        onCancel={() => setRoute({ view: 'none' })}
      />
    );
  } else if (current && route.view === 'edit') {
    const mine = isOwner(current, meId);
    main = (
      <NoteEditor
        key={`edit-${current.id}`}
        mode="edit"
        initial={{ title: current.title, folderId: current.folderId, content: current.content, tags: current.tags }}
        folders={mine ? folderOptions(tree) : null}
        tags={tags}
        onCreateTag={store.createTag}
        onCreateFolder={createFolder}
        onSave={d => saveEdit(current.id, mine ? d : { ...d, folderId: current.folderId })}
        onCancel={() => setRoute({ view: 'note', id: current.id })}
      />
    );
  } else if (current) {
    const mine = isOwner(current, meId);
    main = (
      <NoteView
        key={current.id}
        note={current}
        path={mine ? folderPath(folders, current.folderId) : []}
        mine={mine}
        canEdit={canEditNote(current, meId, myDepts)}
        pinned={pins.some(p => p.noteId === current.id)}
        tocOn={tocOn}
        now={now}
        scroller={scrollerRef}
        onToggleToc={() =>
          setTocOn(on => {
            writeStorage(NOTES_STORAGE.toc, on ? '0' : '1');
            return !on;
          })
        }
        onPin={() => togglePin(current)}
        onCopyLink={() => void copyLink(current)}
        onShare={() => setShareId(current.id)}
        onEdit={() => setRoute({ view: 'edit', id: current.id })}
        onDelete={() => askDeleteNote(current)}
        onRevealFolder={revealFolder}
      />
    );
  } else if (routeId) {
    main = (
      <div className="empty" role="status" data-testid="note-opening">
        <p className="empty-title">Đang mở ghi chú…</p>
      </div>
    );
  } else {
    main = (
      <div className="empty notes-welcome" data-testid="notes-welcome">
        <div className="empty-icon notes-empty-icon">
          <NotebookPen size={22} strokeWidth={1.8} aria-hidden="true" />
        </div>
        <p className="empty-title">Chọn một ghi chú ở cột trái</p>
        <p className="empty-sub">Hoặc tạo ghi chú mới. Ghi chú mặc định là riêng tư, bạn có thể chia sẻ cho người, phòng ban hoặc cả Workspace.</p>
        <button type="button" className="btn-primary empty-action" onClick={() => newNote(activeFolderId)}>
          <Plus size={15} strokeWidth={2.2} aria-hidden="true" />
          Ghi chú mới
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="page notes-app" hidden={hidden} data-testid="notes-app">
        <main
          className="board notes-board"
          ref={boardRef}
          data-side={rail.hidden ? 'hidden' : undefined}
          data-pane={pane}
          style={{ '--side-w': `${rail.width}px` } as CSSProperties}
        >
          {!rail.hidden &&
            (ready ? (
              <NotesSidebar
                id={sideId}
                windowControls={titleControls}
                scope={scope}
                onScope={setScope}
                counts={counts}
                pinned={pinned}
                tree={shownTree}
                groups={groups}
                query={query}
                currentId={current?.id ?? null}
                expanded={expanded}
                onToggleFolder={toggleFolder}
                onExpandAll={() => saveExpanded(new Set(folders.map(f => f.id)))}
                onCollapseAll={() => saveExpanded(new Set())}
                onOpen={openNote}
                onNewNote={newNote}
                onCreateFolder={createFolder}
                onRenameFolder={renameFolder}
                onDeleteFolder={askDeleteFolder}
                canDrop={canDrop}
                onDrop={(item, folderId) => void drop(item, folderId)}
                activeFolderId={activeFolderId}
                totals={{ notes: myNotes.length + sharedNotes.length, folders: folders.length }}
              />
            ) : (
              <aside className="side has-traffic notes-side" id={sideId}>
                {titleControls}
                <h1 className="brand">
                  <span className="logo notes-logo">
                    <NotebookPen size={18} strokeWidth={2.4} aria-hidden="true" />
                  </span>
                  Ghi chú
                </h1>
              </aside>
            ))}
          {!rail.hidden && rail.desktop && (
            <SideResizer width={rail.width} sideId={sideId} board={boardRef} onWidth={rail.setWidth} defaultWidth={rail.defaultWidth} />
          )}

          <div className="content notes-content">
            <header className="topbar">
              {rail.hidden && <div className="title-ctl">{titleControls}</div>}
              <button type="button" className="icon-btn notes-back" aria-label="Về danh sách ghi chú" data-testid="notes-back" onClick={() => setPane('tree')}>
                <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
              </button>
              <label className="search">
                <Search size={18} strokeWidth={1.8} aria-hidden="true" />
                <input
                  ref={searchRef}
                  type="search"
                  placeholder="Tìm theo tiêu đề, nội dung hoặc thẻ…"
                  aria-label="Tìm ghi chú"
                  autoComplete="off"
                  data-testid="notes-search"
                  value={queryRaw}
                  onChange={e => {
                    setQueryRaw(e.target.value);
                    setPane('tree');
                  }}
                />
              </label>
              <button className="theme-btn" type="button" aria-label={themeLabel} title={themeLabel} data-testid="notes-theme" onClick={toggleTheme}>
                {dark ? <Sun size={19} strokeWidth={1.8} aria-hidden="true" /> : <Moon size={19} strokeWidth={1.8} aria-hidden="true" />}
              </button>
              <button className="btn-primary" type="button" aria-label="Ghi chú mới" data-testid="notes-new" disabled={!ready} onClick={() => newNote(activeFolderId)}>
                <Plus size={15} strokeWidth={2.2} aria-hidden="true" />
                <span>
                  <span className="btn-long">Ghi chú </span>mới
                </span>
              </button>
            </header>
            <div className="scroller notes-scroller" ref={scrollerRef}>
              {main}
            </div>
          </div>
        </main>
      </div>

      <ShareDialog
        note={shareNote}
        me={me}
        people={directory.people}
        departments={directory.departments}
        directoryError={directory.error}
        onNeedDirectory={needDirectory}
        onCopyLink={n => void copyLink(n)}
        onSave={saveShare}
        onClose={() => setShareId(null)}
      />
      <NotesConfirm ask={confirm} onClose={() => setConfirm(null)} />
      <Toast toast={toast} onHide={hideToast} />
    </>
  );
}
