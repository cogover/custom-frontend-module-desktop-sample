import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, isSessionExpired } from '../api/client';
import type { Person } from '../domain/types';
import type { NotesApi } from './api';
import { applyShare, isOwner, noteFields, shareFields, sharedWithMe } from './domain';
import { contentText } from './markdown';
import type { Folder, Note, NoteDraft, Pin, Ref, ShareEntry, Visibility } from './types';

export type NotesLoad = 'loading' | 'ready' | 'error' | 'expired';

interface Data {
  me: Person | null;
  folders: Folder[];
  /** Mine + shared with me + any note opened by link; one entry per id. */
  notes: Note[];
  myDepts: string[];
  pins: Pin[];
  tags: Ref[];
}

const EMPTY: Data = { me: null, folders: [], notes: [], myDepts: [], pins: [], tags: [] };

/** Mine first, then shared ones that are not mine (a note can come back from both queries). */
function mergeNotes(mine: Note[], shared: Note[], meId: string): Note[] {
  const out = [...mine];
  for (const n of shared) if (!isOwner(n, meId) && !out.some(x => x.id === n.id)) out.push(n);
  return out;
}

/**
 * Data of the notes window (CONTRACT §9): loads me, my folders / notes / pins, the tags and the notes shared
 * with me (personally or through a department); every write goes to the server first, then the list.
 */
export function useNotesStore(api: NotesApi) {
  const [load, setLoad] = useState<NotesLoad>('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState<Data>(EMPTY);
  const latest = useRef(data);
  latest.current = data;
  const run = useRef(0);

  const expire = useCallback(() => setLoad('expired'), []);
  /** Rethrows after flagging an expired session (the caller shows the other errors). */
  const guard = useCallback(
    (e: unknown): never => {
      if (isSessionExpired(e)) expire();
      throw e;
    },
    [expire],
  );

  const reload = useCallback(async () => {
    const id = ++run.current;
    setLoad('loading');
    setError('');
    try {
      const me = await api.getMe();
      const [folders, mine, pins, tags, myDepts] = await Promise.all([
        api.listFolders(),
        api.listMyNotes(),
        api.listPins(),
        api.listTags(),
        api.listMyDepartments(),
      ]);
      // notes shared with me: a failure here leaves my own notes usable
      const shared = await api.listSharedNotes(myDepts).catch(e => {
        if (isSessionExpired(e)) throw e;
        return [] as Note[];
      });
      if (id !== run.current) return;
      const notes = mergeNotes(mine, shared.filter(n => sharedWithMe(n, me.id, myDepts)), me.id);
      setData({ me, folders, notes, myDepts, pins, tags });
      setLoad('ready');
    } catch (e) {
      if (id !== run.current) return;
      if (isSessionExpired(e)) {
        setLoad('expired');
        return;
      }
      setError(errorMessage(e));
      setLoad('error');
    }
  }, [api]);

  useEffect(() => {
    void reload();
    return () => {
      run.current++;
    };
  }, [reload]);

  const patchNote = (id: string, fn: (n: Note) => Note) => setData(d => ({ ...d, notes: d.notes.map(n => (n.id === id ? fn(n) : n)) }));

  // ---- folders ----
  const createFolder = useCallback(
    async (name: string, parentId: string | null): Promise<Folder> => {
      const me = latest.current.me!;
      const id = await api.createFolder(name, parentId, me.id).catch(guard);
      const folder: Folder = { id, name, parentId, ownerId: me.id };
      setData(d => ({ ...d, folders: [...d.folders, folder] }));
      return folder;
    },
    [api, guard],
  );

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      await api.renameFolder(id, name).catch(guard);
      setData(d => ({ ...d, folders: d.folders.map(f => (f.id === id ? { ...f, name } : f)) }));
    },
    [api, guard],
  );

  const moveFolder = useCallback(
    async (id: string, parentId: string | null) => {
      await api.moveFolder(id, parentId).catch(guard);
      setData(d => ({ ...d, folders: d.folders.map(f => (f.id === id ? { ...f, parentId } : f)) }));
    },
    [api, guard],
  );

  const deleteFolder = useCallback(
    async (id: string) => {
      await api.deleteFolder(id).catch(guard);
      setData(d => ({ ...d, folders: d.folders.filter(f => f.id !== id) }));
    },
    [api, guard],
  );

  // ---- notes ----
  const createNote = useCallback(
    async (draft: NoteDraft): Promise<Note> => {
      const me = latest.current.me!;
      const id = await api.createNote({ ...noteFields(draft), owner: me.id, visibility: 'private' }).catch(guard);
      const now = Date.now();
      const local: Note = {
        id,
        title: draft.title.trim(),
        folderId: draft.folderId,
        owner: me,
        content: draft.content,
        text: contentText(draft.content),
        visibility: 'private',
        viewers: [],
        editors: [],
        viewerDepts: [],
        editorDepts: [],
        tags: draft.tags,
        created: now,
        updated: now,
        updatedBy: me,
      };
      // the stored version (server-side defaults); what was typed when it cannot be read back
      const back = await api.getNote(id).catch(() => null);
      const note = back ?? local;
      setData(d => ({ ...d, notes: [note, ...d.notes.filter(n => n.id !== id)] }));
      return note;
    },
    [api, guard],
  );

  const saveNote = useCallback(
    async (id: string, draft: NoteDraft): Promise<Note> => {
      await api.updateNote(id, noteFields(draft)).catch(guard);
      const me = latest.current.me;
      let saved: Note | null = null;
      patchNote(id, n => {
        saved = { ...n, title: draft.title.trim(), folderId: draft.folderId, content: draft.content, text: contentText(draft.content), tags: draft.tags, updated: Date.now(), updatedBy: me };
        return saved;
      });
      return saved ?? latest.current.notes.find(n => n.id === id)!;
    },
    [api, guard],
  );

  /** Drops a note into a folder (null = top level): only `folder` is written. */
  const moveNote = useCallback(
    async (id: string, folderId: string | null) => {
      await api.updateNote(id, { folder: folderId }).catch(guard);
      const me = latest.current.me;
      patchNote(id, n => ({ ...n, folderId, updated: Date.now(), updatedBy: me }));
    },
    [api, guard],
  );

  const shareNote = useCallback(
    async (id: string, visibility: Visibility, entries: readonly ShareEntry[]) => {
      await api.updateNote(id, shareFields(visibility, entries)).catch(guard);
      patchNote(id, n => applyShare(n, visibility, entries));
    },
    [api, guard],
  );

  const deleteNote = useCallback(
    async (id: string) => {
      await api.deleteNote(id).catch(guard);
      // its pins are deleted with it on the server (reference lookup)
      setData(d => ({ ...d, notes: d.notes.filter(n => n.id !== id), pins: d.pins.filter(p => p.noteId !== id) }));
    },
    [api, guard],
  );

  /** A note not in the lists (opened by link: public, or shared after the list was loaded). */
  const fetchNote = useCallback(
    async (id: string): Promise<Note | null> => {
      const known = latest.current.notes.find(n => n.id === id);
      if (known) return known;
      const note = await api.getNote(id).catch(guard);
      if (note) setData(d => (d.notes.some(n => n.id === id) ? d : { ...d, notes: [...d.notes, note] }));
      return note;
    },
    [api, guard],
  );

  // ---- pins, tags ----
  const pin = useCallback(
    async (noteId: string) => {
      const { me, pins } = latest.current;
      if (!me || pins.some(p => p.noteId === noteId)) return;
      const order = pins.reduce((m, p) => Math.max(m, p.order), 0) + 1;
      const id = await api.createPin(noteId, order, me.id).catch(guard);
      setData(d => ({ ...d, pins: [...d.pins, { id, noteId, order }] }));
    },
    [api, guard],
  );

  const unpin = useCallback(
    async (noteId: string) => {
      const found = latest.current.pins.filter(p => p.noteId === noteId);
      for (const p of found) await api.deletePin(p.id).catch(guard);
      setData(d => ({ ...d, pins: d.pins.filter(p => p.noteId !== noteId) }));
    },
    [api, guard],
  );

  const createTag = useCallback(
    async (name: string): Promise<Ref> => {
      const existing = latest.current.tags.find(t => t.name.toLowerCase() === name.trim().toLowerCase());
      if (existing) return existing;
      const id = await api.createTag(name.trim()).catch(guard);
      const tag = { id, name: name.trim() };
      setData(d => ({ ...d, tags: [...d.tags, tag].sort((a, b) => a.name.localeCompare(b.name, 'vi')) }));
      return tag;
    },
    [api, guard],
  );

  return {
    load,
    error,
    ...data,
    reload,
    expire,
    createFolder,
    renameFolder,
    moveFolder,
    deleteFolder,
    createNote,
    saveNote,
    moveNote,
    shareNote,
    deleteNote,
    fetchNote,
    pin,
    unpin,
    createTag,
  };
}

export type NotesStore = ReturnType<typeof useNotesStore>;
