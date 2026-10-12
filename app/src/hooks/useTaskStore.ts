import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, errorMessage, isSessionExpired } from '../api/client';
import type { TaskApi } from '../api/tasks';
import { matchesRoles } from '../domain/filters';
import { applyPatch, isDone, patchApplied, patchToFields, snapshotFor } from '../domain/task';
import { htmlToText } from '../domain/text';
import type { StatusFlow } from '../domain/statusFlow';
import type { Person, RoleFilter, Task, TaskInput, TaskPatch } from '../domain/types';

export type LoadState = 'loading' | 'ready' | 'error' | 'expired';

export interface DoneState {
  /** First page requested at least once. */
  started: boolean;
  loading: boolean;
  /** The server has no more pages. */
  exhausted: boolean;
  error: string;
}

const INITIAL_DONE: DoneState = { started: false, loading: false, exhausted: false, error: '' };

export interface TaskStore {
  load: LoadState;
  error: string;
  me: Person | null;
  /** The status workflow (transition rule); null = every status allowed. */
  statusFlow: StatusFlow | null;
  /** Loaded tasks: every open task in scope + the done pages loaded so far. */
  tasks: Task[];
  /** Number of done tasks for the ticked roles on the server (kept in step with local changes). */
  doneTotal: number;
  done: DoneState;
  reload: () => void;
  /** "Làm mới": loads again while the list stays on screen; a failure is told by a toast. */
  refresh: () => Promise<void>;
  loadMoreDone: () => Promise<void>;
  /** Partial update. Optimistic by default (rolled back on failure). Rejects with the API error. */
  updateTask: (id: string, patch: TaskPatch, opts?: { optimistic?: boolean }) => Promise<void>;
  createTask: (input: TaskInput) => Promise<Task>;
  /** Reads one record by id (deep links). */
  fetchTask: (id: string) => Promise<Task | null>;
  /** Puts a task fetched separately (deep link) into the local list. */
  adoptTask: (task: Task) => void;
  /** Hides the task now and deletes it on the server after 5 s unless undone. */
  /** Deletes on the server right away (after the user confirmed); removes it locally on success. */
  deleteTask: (id: string) => Promise<Task>;
  expire: () => void;
}

/**
 * Server state of "my tasks". Open tasks are loaded for every role; done tasks are counted and
 * paged on the server for the ticked `roles` only. Changing `roles` drops the loaded done pages,
 * recounts, and ignores any answer that belonged to the previous selection.
 */
export function useTaskStore(api: TaskApi, notify: (message: string) => void, roles: readonly RoleFilter[] = ['assignee', 'reporter', 'cc']): TaskStore {
  const [load, setLoad] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const [me, setMe] = useState<Person | null>(null);
  const [statusFlow, setStatusFlow] = useState<StatusFlow | null>(null);
  const [tasks, setTasksState] = useState<Task[]>([]);
  const [doneTotal, setDoneTotalState] = useState(0);
  const [done, setDone] = useState<DoneState>(INITIAL_DONE);

  // refs mirror state so async callbacks always see the latest values
  const tasksRef = useRef<Task[]>([]);
  const doneTotalRef = useRef(0);
  const doneRef = useRef({ cursor: [] as unknown[], loading: false, exhausted: false });
  const generation = useRef(0);
  /** Bumped on reload and on every roles change: done-task answers from an older value are dropped. */
  const doneGen = useRef(0);
  const rolesRef = useRef<readonly RoleFilter[]>(roles);
  const meRef = useRef<Person | null>(null);
  const queues = useRef(new Map<string, Promise<unknown>>());
  const notifyRef = useRef(notify);
  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);

  const setTasks = useCallback((fn: (prev: Task[]) => Task[]) => {
    tasksRef.current = fn(tasksRef.current);
    setTasksState(tasksRef.current);
  }, []);
  const setDoneTotal = useCallback((fn: (prev: number) => number) => {
    doneTotalRef.current = Math.max(0, fn(doneTotalRef.current));
    setDoneTotalState(doneTotalRef.current);
  }, []);
  /** 1 when the task counts in "Đã xong" for the ticked roles. */
  const countsAsDone = (t: Task | undefined | null) =>
    t && isDone(t) && matchesRoles(t, rolesRef.current, meRef.current?.id ?? null) ? 1 : 0;

  const expire = useCallback(() => setLoad('expired'), []);

  /** Runs writes to the same record one after another, so an undo never overtakes the change it undoes. */
  const enqueue = useCallback(<T,>(id: string, job: () => Promise<T>): Promise<T> => {
    const prev = queues.current.get(id) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(job);
    queues.current.set(id, next);
    next
      .finally(() => {
        if (queues.current.get(id) === next) queues.current.delete(id);
      })
      .catch(() => undefined);
    return next;
  }, []);

  const reload = useCallback(async () => {
    const gen = ++generation.current;
    const dg = ++doneGen.current;
    setLoad('loading');
    setError('');
    doneRef.current = { cursor: [], loading: false, exhausted: false };
    setDone(INITIAL_DONE);
    try {
      const [mePerson, open, doneCount, flow] = await Promise.all([
        api.getMe(),
        api.listOpenTasks(),
        api.countDoneTasks(rolesRef.current),
        api.getStatusFlow().catch(() => null),
      ]);
      if (gen !== generation.current) return;
      meRef.current = mePerson;
      setMe(mePerson);
      setStatusFlow(flow);
      setTasks(() => open);
      // the roles may have changed meanwhile: that change already started its own count
      if (dg === doneGen.current) setDoneTotal(() => doneCount);
      setLoad('ready');
    } catch (e) {
      if (gen !== generation.current) return;
      if (isSessionExpired(e)) {
        setLoad('expired');
        return;
      }
      setError(errorMessage(e));
      setLoad('error');
    }
  }, [api, setTasks, setDoneTotal]);

  const refresh = useCallback(async () => {
    const gen = ++generation.current;
    try {
      const [mePerson, open, doneCount, flow] = await Promise.all([
        api.getMe(),
        api.listOpenTasks(),
        api.countDoneTasks(rolesRef.current),
        api.getStatusFlow().catch(() => null),
      ]);
      if (gen !== generation.current) return;
      // the done pages start again (the view loads the first one when it shows done tasks)
      ++doneGen.current;
      doneRef.current = { cursor: [], loading: false, exhausted: false };
      setDone(INITIAL_DONE);
      meRef.current = mePerson;
      setMe(mePerson);
      setStatusFlow(flow);
      setTasks(() => open);
      setDoneTotal(() => doneCount);
      setError('');
      setLoad('ready');
    } catch (e) {
      if (gen !== generation.current) return;
      if (isSessionExpired(e)) setLoad('expired');
      else notifyRef.current(`Không làm mới được: ${errorMessage(e)}`);
    }
  }, [api, setTasks, setDoneTotal]);

  // roles changed: forget the done pages of the old selection, recount, and let the view reload them
  const rolesKey = roles.join(',');
  const appliedRoles = useRef(rolesKey);
  useEffect(() => {
    rolesRef.current = rolesKey ? (rolesKey.split(',') as RoleFilter[]) : [];
    if (appliedRoles.current === rolesKey) return;
    appliedRoles.current = rolesKey;
    const dg = ++doneGen.current;
    doneRef.current = { cursor: [], loading: false, exhausted: false };
    setDone(INITIAL_DONE);
    setTasks(prev => (prev.some(isDone) ? prev.filter(t => !isDone(t)) : prev));
    setDoneTotal(() => 0);
    api
      .countDoneTasks(rolesRef.current)
      .then(n => {
        if (dg === doneGen.current) setDoneTotal(() => n);
      })
      .catch(e => {
        if (dg !== doneGen.current) return;
        if (isSessionExpired(e)) setLoad('expired');
        else notifyRef.current(`Không đếm được việc đã xong: ${errorMessage(e)}`);
      });
  }, [rolesKey, api, setTasks, setDoneTotal]);

  useEffect(() => {
    void reload();
    return () => {
      generation.current++;
    };
  }, [reload]);

  const loadMoreDone = useCallback(async () => {
    const d = doneRef.current;
    if (d.loading || d.exhausted) return;
    if (rolesRef.current.length === 0) {
      // nothing ticked: nothing to load
      d.exhausted = true;
      setDone({ started: true, loading: false, exhausted: true, error: '' });
      return;
    }
    d.loading = true;
    const dg = doneGen.current;
    setDone(s => ({ ...s, started: true, loading: true, error: '' }));
    try {
      const page = await api.listDoneTasks(rolesRef.current, d.cursor);
      if (dg !== doneGen.current) return; // answer for an older roles selection or load
      d.cursor = page.searchAfter;
      d.exhausted = page.last;
      d.loading = false;
      const known = new Set(tasksRef.current.map(t => t.id));
      const fresh = page.rows.filter(t => !known.has(t.id));
      if (fresh.length) setTasks(prev => [...prev, ...fresh]);
      setDoneTotal(() => page.total);
      setDone({ started: true, loading: false, exhausted: d.exhausted, error: '' });
    } catch (e) {
      if (dg !== doneGen.current) return;
      d.loading = false;
      if (isSessionExpired(e)) {
        setLoad('expired');
        return;
      }
      const msg = errorMessage(e);
      setDone(s => ({ ...s, loading: false, error: msg }));
      notifyRef.current(`Không tải được việc đã xong: ${msg}`);
    }
  }, [api, setTasks, setDoneTotal]);

  const applyLocal = useCallback(
    (id: string, patch: TaskPatch) => {
      setTasks(prev => prev.map(t => (t.id === id ? applyPatch(t, patch, Date.now()) : t)));
    },
    [setTasks],
  );

  const updateTask = useCallback(
    async (id: string, patch: TaskPatch, opts: { optimistic?: boolean } = {}) => {
      const optimistic = opts.optimistic ?? true;
      const current = tasksRef.current.find(t => t.id === id);
      if (!current) throw new ApiError('Không tìm thấy công việc này trong danh sách.');
      const back = snapshotFor(current, patch);
      const delta = countsAsDone(applyPatch(current, patch)) - countsAsDone(current);
      if (optimistic) {
        applyLocal(id, patch);
        if (delta) setDoneTotal(n => n + delta);
      }
      try {
        await enqueue(id, () => api.updateTask(id, patchToFields(patch)));
        if (!optimistic) {
          const latest = tasksRef.current.find(t => t.id === id);
          applyLocal(id, patch);
          const d = latest ? countsAsDone(applyPatch(latest, patch)) - countsAsDone(latest) : 0;
          if (d) setDoneTotal(n => n + d);
        }
      } catch (e) {
        if (optimistic) {
          const latest = tasksRef.current.find(t => t.id === id);
          if (latest && patchApplied(latest, patch)) {
            setTasks(prev => prev.map(t => (t.id === id ? applyPatch(t, back) : t)));
            if (delta) setDoneTotal(n => n - delta);
          }
        }
        if (isSessionExpired(e)) setLoad('expired');
        throw e;
      }
    },
    [api, applyLocal, enqueue, setDoneTotal, setTasks],
  );

  const createTask = useCallback(
    async (input: TaskInput) => {
      const fields = {
        subject: input.subject,
        description: input.description,
        due_date: input.dueDate,
        priority: input.priority,
        status: input.status,
        reporter: input.reporter.id,
        assignee: input.assignee.id,
        // followers only when picked: without `ccs` the Workspace applies its default followers (CONTRACT §4)
        ...(input.ccs?.length ? { ccs: input.ccs.map(p => p.id) } : {}),
        // only when there are files (an empty list is refused)
        ...(input.attachments.length ? { attachment_files: input.attachments.map(a => a.meta) } : {}),
        ...(input.descImages.length ? { _attachments: input.descImages } : {}),
      };
      let id: string;
      try {
        id = await api.createTask(fields);
      } catch (e) {
        if (isSessionExpired(e)) setLoad('expired');
        throw e;
      }
      let task: Task | null = null;
      try {
        // read the record back for name, created and full lookups
        task = await api.getTask(id);
      } catch (e) {
        if (isSessionExpired(e)) setLoad('expired');
      }
      if (!task) {
        const now = Date.now();
        task = {
          id,
          code: '',
          subject: input.subject,
          description: input.description,
          descText: htmlToText(input.description),
          dueDate: input.dueDate,
          priority: input.priority,
          status: input.status,
          reporter: input.reporter,
          assignee: input.assignee,
          ccs: input.ccs ?? [],
          attachments: input.attachments,
          descImages: input.descImages,
          created: now,
          updated: now,
        };
      }
      const created = task;
      setTasks(prev => [created, ...prev.filter(t => t.id !== id)]);
      if (countsAsDone(created)) setDoneTotal(n => n + 1);
      return created;
    },
    [api, setTasks, setDoneTotal],
  );

  const fetchTask = useCallback(
    async (id: string) => {
      try {
        return await api.getTask(id);
      } catch (e) {
        if (isSessionExpired(e)) setLoad('expired');
        throw e;
      }
    },
    [api],
  );

  const adoptTask = useCallback(
    (task: Task) => {
      setTasks(prev => (prev.some(t => t.id === task.id) ? prev : [...prev, task]));
    },
    [setTasks],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      const task = tasksRef.current.find(t => t.id === id);
      if (!task) throw new ApiError('Không tìm thấy công việc này trong danh sách.');
      try {
        const res = await enqueue(id, () => api.deleteTasks([id]));
        if (res.notDeleted.includes(id)) throw new ApiError('Máy chủ từ chối xoá công việc này.');
      } catch (e) {
        if (isSessionExpired(e)) setLoad('expired');
        throw e;
      }
      const latest = tasksRef.current.find(t => t.id === id) ?? task;
      setTasks(prev => prev.filter(t => t.id !== id));
      if (countsAsDone(latest)) setDoneTotal(n => n - 1);
      return latest;
    },
    [api, enqueue, setTasks, setDoneTotal],
  );

  return {
    load,
    error,
    me,
    statusFlow,
    tasks,
    doneTotal,
    done,
    reload: () => void reload(),
    refresh,
    loadMoreDone,
    updateTask,
    createTask,
    fetchTask,
    adoptTask,
    deleteTask,
    expire,
  };
}
