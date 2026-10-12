import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { errorMessage, isSessionExpired } from './api/client';
import { taskApi, type TaskApi } from './api/tasks';
import { ConfirmDelete } from './components/ConfirmDelete';
import { ConfirmFollow, type FollowAnswer, type FollowQuestion } from './components/ConfirmFollow';
import { ListBar } from './components/ListBar';
import { Sidebar } from './components/Sidebar';
import { SideResizer, SideToggle } from './components/SideRail';
import { SELF_APP, appOfHash, searchFromUrl, useWindowUrl } from './desktop/url';
import { WindowControls, type WindowApi } from './desktop/WindowControls';
import { EmptyState, ErrorState, LoadingState, SessionExpiredState } from './components/StateBox';
import { ActivityPanel, type ActivitiesApi } from './components/Activities';
import { TaskDialog, type DialogMode } from './components/TaskDialog';
import { PEOPLE_ERROR, type FormValues } from './components/TaskForm';
import { TaskItem } from './components/TaskItem';
import { Toast } from './components/Toast';
import { Topbar } from './components/Topbar';
import { LEAVE_DELAY_MS } from './config';
import {
  countTasks,
  loadedDoneCount,
  matchesDue,
  matchesQuick,
  matchesRoles,
  matchesView,
  matchesPeople,
  peopleChips,
  peopleFilterActive,
  togglePersonRel,
  type PeopleFilter,
  selectVisible,
  type MatchContext,
} from './domain/filters';
import { sameAttachments } from './domain/attachments';
import { mergeInlineMetas } from './domain/inlineImages';
import { DEFAULT_PRIORITY, REOPEN_STATUS, TICK_STATUS, isDoneStatus, statusMeta } from './domain/status';
import { canMove, moveRefused, statusChoices } from './domain/statusFlow';
import { applyPatch, canEdit, handOverFollower, isDone, isEmptyPatch, peopleChangeAllowed, rolesOf } from './domain/task';
import { fold } from './domain/text';
import type { Task, TaskPatch } from './domain/types';
import {
  QUICK,
  SORTS,
  filtersNarrowed,
  loadView,
  normalizeRoles,
  resetFilters,
  saveView,
  sortDirLabel,
  type ViewState,
} from './domain/view';
import { useNow } from './hooks/useNow';
import { prefetchEditorWhenIdle } from './rte/loadEditor';
import { usePeople } from './hooks/usePeople';
import { useSideRail } from './hooks/useSideRail';
import { useTaskStore } from './hooks/useTaskStore';
import { useColumns } from './hooks/useColumns';
import { columnsStyle } from './domain/columns';
import { ColumnsMenu } from './components/ColumnsMenu';
import { ListHead } from './components/ListHead';
import { useTheme } from './hooks/useTheme';
import { useToast } from './hooks/useToast';

type DialogState = { mode: 'create' } | { mode: 'view' | 'edit'; taskId: string; fallback?: Task };

const HASH_TASK = /^#\/task\/([^/?#]+)/;

export function taskIdFromHash(hash: string = window.location.hash): string | null {
  const m = HASH_TASK.exec(hash);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

function setTaskHash(id: string) {
  window.history.replaceState(window.history.state, '', `#/task/${encodeURIComponent(id)}`);
}

function clearHash() {
  if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
}

export interface AppProps {
  api?: TaskApi;
  /** Set when the app runs as a window of the desktop (Desktop.tsx): macOS buttons, minimise, full window. */
  win?: WindowApi;
}

export default function App({ api = taskApi, win }: AppProps) {
  const { toast, show: showToast, hide: hideToast } = useToast();
  const [view, setViewState] = useState<ViewState>(loadView);
  const store = useTaskStore(api, showToast, view.roles);
  const { load, me, statusFlow, tasks, doneTotal, done, loadMoreDone, updateTask, createTask, fetchTask, adoptTask, deleteTask, expire } =
    store;
  const directory = usePeople(api, expire);
  const [columns, setColumns] = useColumns();
  const colsLook = useMemo(() => columnsStyle(columns), [columns]);
  const { theme, toggle: toggleTheme } = useTheme();
  const now = useNow();

  // a refresh keeps the search of the window (`?q=`, CONTRACT §9.1)
  const [queryRaw, setQueryRaw] = useState(() => (win ? searchFromUrl(SELF_APP) : ''));
  const [frozen, setFrozen] = useState<ReadonlyMap<string, Task>>(() => new Map());
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [revealId, setRevealId] = useState<string | null>(null);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const prevStatus = useRef(new Map<string, string>());
  const leaveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const meId = me?.id ?? null;
  const query = fold(queryRaw.trim());
  const ctx: MatchContext = useMemo(() => ({ view, query, meId, now }), [view, query, meId, now]);

  // latest values for timers and async callbacks
  const hidden = Boolean(win?.hidden);
  // left rail on desktop: width (drag) and hidden (button / ⌘\), CONTRACT §5 1d; no shortcut while minimised
  const rail = useSideRail(!hidden);
  const sideId = useId();
  const boardRef = useRef<HTMLElement>(null);
  const latest = useRef({ ctx, tasks, dialog, statusFlow, hidden });
  useEffect(() => {
    latest.current = { ctx, tasks, dialog, statusFlow, hidden };
  });

  // the status workflow (CONTRACT §4 "Quy trình trạng thái"): the choices of each status, cached so the
  // memoised cards keep the same array between renders; undefined = every status (no rule)
  const choicesFor = useMemo(() => {
    const cache = new Map<string, string[]>();
    return (status: string) => {
      if (!statusFlow) return undefined;
      if (!cache.has(status)) cache.set(status, statusChoices(statusFlow, status));
      return cache.get(status);
    };
  }, [statusFlow]);

  const setView = useCallback((patch: Partial<ViewState> | ((v: ViewState) => ViewState)) => {
    setViewState(v => (typeof patch === 'function' ? patch(v) : { ...v, ...patch }));
  }, []);

  // remember the view; jump back to the top of the list whenever it changes
  const firstView = useRef(true);
  useEffect(() => {
    saveView(view);
    if (firstView.current) {
      firstView.current = false;
      return;
    }
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
  }, [view]);

  useEffect(() => {
    const timers = leaveTimers.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
    };
  }, []);

  // people ticked on the chips of the list bar (not saved: a quick, temporary narrowing of the list)
  const [people, setPeople] = useState<PeopleFilter>({});
  const base = useMemo(() => selectVisible(tasks, ctx, frozen), [tasks, ctx, frozen]);
  const peopleOn = peopleFilterActive(people);
  const visible = useMemo(() => (peopleOn ? base.filter(t => matchesPeople(frozen.get(t.id) ?? t, people)) : base), [base, people, peopleOn, frozen]);
  const counts = countTasks(tasks, doneTotal, view.roles, meId);
  const loadedDone = loadedDoneCount(tasks, view.roles, meId);

  // done tasks are only fetched when the quick filter shows them
  useEffect(() => {
    if (load === 'ready' && view.quick !== 'open' && !done.started) void loadMoreDone();
  }, [load, view.quick, done.started, loadMoreDone]);

  // ---- dialog & hash route ----
  const dialogTask: Task | null =
    dialog && dialog.mode !== 'create' ? (tasks.find(t => t.id === dialog.taskId) ?? dialog.fallback ?? null) : null;

  // while in front, the URL holds this window: `?app=cong-viec`, the search, the open task
  const taskHash = dialog && dialog.mode !== 'create' ? `#/task/${encodeURIComponent(dialog.taskId)}` : '';
  useWindowUrl(Boolean(win) && !hidden, SELF_APP, queryRaw, taskHash);

  const closeDialog = useCallback(() => {
    setDialog(null);
    clearHash();
  }, []);

  const openTask = useCallback((task: Task) => {
    setDialog({ mode: 'view', taskId: task.id });
    setTaskHash(task.id);
  }, []);

  const openCreate = useCallback(() => {
    if (latest.current.ctx.meId) setDialog({ mode: 'create' });
  }, []);

  // a deleted task cannot stay open
  useEffect(() => {
    if (dialog && dialog.mode !== 'create' && !dialogTask) closeDialog();
  }, [dialog, dialogTask, closeDialog]);

  useEffect(() => {
    if (load === 'expired') setDialog(null);
  }, [load]);

  const openFromHash = useCallback(async () => {
    const id = taskIdFromHash();
    const current = latest.current.dialog;
    if (!id) {
      if (appOfHash(window.location.hash)) return; // a note link: the open task stays for when Công việc is back
      if (current && current.mode !== 'create') setDialog(null);
      return;
    }
    if (current && current.mode !== 'create' && current.taskId === id) return;
    if (latest.current.tasks.some(t => t.id === id)) {
      setDialog({ mode: 'view', taskId: id });
      return;
    }
    try {
      const t = await fetchTask(id);
      if (!t) {
        showToast('Không tìm thấy công việc này hoặc bạn không có quyền xem.');
        clearHash();
        return;
      }
      if (rolesOf(t, latest.current.ctx.meId).length > 0) {
        adoptTask(t);
        setDialog({ mode: 'view', taskId: id });
      } else {
        setDialog({ mode: 'view', taskId: id, fallback: t });
      }
    } catch (e) {
      if (isSessionExpired(e)) return;
      showToast(`Không mở được công việc: ${errorMessage(e)}`);
      clearHash();
    }
  }, [fetchTask, adoptTask, showToast]);

  useEffect(() => {
    if (load !== 'ready') return;
    void openFromHash();
    const onHash = () => void openFromHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [load, openFromHash]);

  // ---- writes ----
  const reportError = useCallback(
    (prefix: string) => (e: unknown) => {
      if (!isSessionExpired(e)) showToast(`${prefix}: ${errorMessage(e)}`);
    },
    [showToast],
  );

  const setStatusTo = useCallback(
    (id: string, status: string, failPrefix: string) => {
      updateTask(id, { status }).catch(reportError(failPrefix));
    },
    [updateTask, reportError],
  );

  const changeStatus = useCallback(
    (task: Task, next: string) => {
      const before = task.status;
      if (before === next) return;
      if (!canMove(latest.current.statusFlow, before, next)) {
        showToast(moveRefused(before, next));
        return;
      }
      if (!isDoneStatus(before) && isDoneStatus(next)) prevStatus.current.set(task.id, before);
      // keep the row where it was for a moment, then let it leave (or move) in the current view
      setFrozen(m => (m.has(task.id) ? m : new Map(m).set(task.id, task)));
      clearTimeout(leaveTimers.current.get(task.id));
      leaveTimers.current.set(
        task.id,
        setTimeout(() => {
          leaveTimers.current.delete(task.id);
          setFrozen(m => {
            if (!m.has(task.id)) return m;
            const n = new Map(m);
            n.delete(task.id);
            return n;
          });
          const cur = latest.current.tasks.find(t => t.id === task.id);
          if (!cur || cur.status !== next || matchesView(cur, latest.current.ctx)) return;
          const msg = next === TICK_STATUS ? `Đã xong “${cur.subject}”` : `Đã chuyển “${cur.subject}” sang ${statusMeta(next).label}`;
          // Hoàn tác only when the workflow has the way back (the server refuses it otherwise)
          if (!canMove(latest.current.statusFlow, next, before)) {
            showToast(msg);
            return;
          }
          showToast(msg, {
            label: 'Hoàn tác',
            run: () => {
              setStatusTo(task.id, before, `Không hoàn tác được “${cur.subject}”`);
              setRevealId(task.id);
            },
          });
        }, LEAVE_DELAY_MS),
      );
      setStatusTo(task.id, next, `Không lưu được trạng thái “${task.subject}”`);
    },
    [setStatusTo, showToast],
  );

  /** Where the checkbox takes a task: done → resolved; undone → the status it had before, else new. */
  const toggleTarget = useCallback((task: Task) => {
    if (!isDone(task)) return TICK_STATUS;
    const prev = prevStatus.current.get(task.id);
    return prev && !isDoneStatus(prev) ? prev : REOPEN_STATUS;
  }, []);

  const toggleDone = useCallback(
    (task: Task, checked: boolean) => {
      const to = checked ? TICK_STATUS : toggleTarget(task);
      if (!canMove(latest.current.statusFlow, task.status, to)) {
        showToast(moveRefused(task.status, to));
        return;
      }
      changeStatus(task, to);
    },
    [changeStatus, toggleTarget, showToast],
  );

  // the timeline under the description of the open task (CONTRACT §5.3c)
  const meIdForMentions = me?.id ?? null;
  const activitiesApi: ActivitiesApi = useMemo(
    () => ({
      list: api.listActivities,
      create: api.createNote,
      update: api.updateNote,
      remove: api.deleteNote,
      uploadImage: api.uploadNoteImage,
      searchPeople: (query: string, signal: AbortSignal) => api.searchPeople(query, meIdForMentions, signal),
    }),
    [api, meIdForMentions],
  );
  const renderActivities = useCallback(
    (task: Task) =>
      me ? <ActivityPanel taskId={task.id} me={me} now={now} api={activitiesApi} onNoteAdded={() => showToast('Đã thêm ghi chú')} onToast={showToast} /> : null,
    [me, now, activitiesApi, showToast],
  );

  // handing a task over asks whether the replaced assignee keeps following it (CONTRACT §5.3g); resolves with
  // the patch to save (plus `ccs` when they follow) or null when the change is cancelled
  const [followAsk, setFollowAsk] = useState<(FollowQuestion & { answer: (a: FollowAnswer) => void }) | null>(null);
  const withFollower = useCallback((task: Task, patch: TaskPatch): Promise<TaskPatch | null> => {
    const person = handOverFollower(task, patch);
    if (!person || !patch.assignee) return Promise.resolve(patch);
    const meId = latest.current.ctx.meId;
    const after = applyPatch(task, patch);
    const to = patch.assignee;
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null; // the form's "Lưu"
    return new Promise(resolve => {
      let done = false;
      const answer = (a: FollowAnswer) => {
        if (done) return;
        done = true;
        setFollowAsk(null);
        resolve(a === 'cancel' ? null : a === 'add' ? { ...patch, ccs: [...task.ccs, person] } : patch);
      };
      const ask = { subject: task.subject, person, to, isMe: person.id === meId, losesAccess: person.id === meId && rolesOf(after, meId).length === 0, returnTo, answer };
      // asked once the list the person was picked in has closed and put the focus back on its button (Radix does
      // that in a timer queued when the list unmounts, after this one): the box then returns the focus there
      window.setTimeout(() => window.setTimeout(() => setFollowAsk(ask), 0), 0);
    });
  }, []);

  // quick edit in the detail view (CONTRACT §5.3d): saved at once; I must stay the reporter or the assignee,
  // or hand over a task assigned to me
  const quickChange = useCallback(
    async (task: Task, patch: TaskPatch) => {
      const meId = latest.current.ctx.meId;
      if ((patch.reporter || patch.assignee) && !peopleChangeAllowed(task, patch, meId)) {
        showToast(PEOPLE_ERROR);
        return;
      }
      const next = await withFollower(task, patch);
      if (!next) return;
      const gone = rolesOf(applyPatch(task, next), meId).length === 0;
      updateTask(task.id, next).then(
        () => showToast(gone ? `Đã giao “${task.subject}”. Việc này không còn trong danh sách của bạn.` : 'Đã lưu'),
        reportError(`Không lưu được “${task.subject}”`),
      );
    },
    [updateTask, showToast, reportError, withFollower],
  );

  // status from the detail view: the card's flow (a done task leaving the list offers Hoàn tác), plus the
  // "Đã lưu" every quick edit shows (CONTRACT §5.3d)
  const quickStatus = useCallback(
    (task: Task, next: string) => {
      if (task.status === next) return;
      const allowed = canMove(latest.current.statusFlow, task.status, next);
      changeStatus(task, next); // refuses (with its own toast) what the workflow does not allow
      if (allowed) showToast('Đã lưu');
    },
    [changeStatus, showToast],
  );

  const rename = useCallback(
    (task: Task, subject: string) => {
      updateTask(task.id, { subject }).catch(reportError(`Không đổi được tên “${task.subject}”`));
    },
    [updateTask, reportError],
  );

  // deleting always asks first (AlertDialog); the API is called right after the confirmation
  const [confirmTask, setConfirmTask] = useState<Task | null>(null);
  // a quick title edit is open somewhere in the list: a click on a card then only ends it (AC12),
  // so the cards show the default arrow instead of the hand / I-beam (`.tasks.is-editing`)
  const [titleEdits, setTitleEdits] = useState(0);
  const onTitleEditing = useCallback((on: boolean) => setTitleEdits(n => Math.max(0, n + (on ? 1 : -1))), []);
  const requestDelete = useCallback((task: Task) => setConfirmTask(task), []);
  const confirmDelete = useCallback(
    async (task: Task) => {
      try {
        const removed = await deleteTask(task.id);
        const d = latest.current.dialog;
        if (d && d.mode !== 'create' && d.taskId === task.id) closeDialog();
        showToast(`Đã xoá “${removed.subject}”`);
      } catch (e) {
        if (!isSessionExpired(e)) showToast(`Không xoá được “${task.subject}”: ${errorMessage(e)}`);
      } finally {
        setConfirmTask(null);
      }
    },
    [deleteTask, closeDialog, showToast],
  );

  const createFromForm = useCallback(
    async (values: FormValues) => {
      const task = await createTask({
        subject: values.subject,
        description: values.descHtml ?? '',
        attachments: values.attachments,
        descImages: values.descImages.map(i => i.meta),
        dueDate: values.dueDate,
        priority: values.priority || DEFAULT_PRIORITY,
        status: values.status,
        reporter: values.reporter,
        assignee: values.assignee,
        ccs: values.ccs,
      });
      // open the view up just enough to show the new task
      const c = latest.current.ctx;
      if (!matchesView(task, c)) {
        setQueryRaw('');
        setView(v => ({
          ...v,
          quick: matchesQuick(task, v.quick) ? v.quick : isDone(task) ? 'done' : 'open',
          due: matchesDue(task, v.due, v.from, v.to, Date.now()) ? v.due : 'all',
          // tick the roles of the new task when none of the ticked ones match it
          roles: matchesRoles(task, v.roles, c.meId) ? v.roles : normalizeRoles([...v.roles, ...rolesOf(task, c.meId)]),
        }));
      }
      closeDialog();
      setRevealId(task.id);
      showToast(`Đã tạo “${task.subject}”`);
    },
    [createTask, setView, closeDialog, showToast],
  );

  const saveFromForm = useCallback(
    async (task: Task, values: FormValues) => {
      const patch: TaskPatch = {};
      if (values.subject !== task.subject) patch.subject = values.subject;
      if (values.descHtml !== null) patch.description = values.descHtml; // null: unsupported or unchanged
      // pictures pasted into the description: `_attachments` = the task's own (read again: someone may have
      // added pictures on Cogover since the list was loaded) + the new ones
      if (values.descImages.length) {
        const fresh = await fetchTask(task.id).catch(() => null);
        patch.descImages = mergeInlineMetas((fresh ?? task).descImages, values.descImages);
      }
      if (!sameAttachments(values.attachments, task.attachments)) patch.attachments = values.attachments; // the whole list
      if (values.dueDate !== task.dueDate) patch.dueDate = values.dueDate;
      if (values.priority && values.priority !== task.priority) patch.priority = values.priority;
      if (values.status !== task.status) patch.status = values.status;
      if (values.reporter.id !== task.reporter?.id) patch.reporter = values.reporter;
      if (values.assignee.id !== task.assignee?.id) patch.assignee = values.assignee;
      const asked = await withFollower(task, patch);
      if (!asked) return; // "Huỷ": stay in the form
      Object.assign(patch, asked);

      if (!isEmptyPatch(patch)) {
        if (patch.status && !isDoneStatus(task.status) && isDoneStatus(patch.status)) prevStatus.current.set(task.id, task.status);
        await updateTask(task.id, patch, { optimistic: false });
      }
      setDialog(d => (d && d.mode === 'edit' && d.taskId === task.id ? { ...d, mode: 'view' } : d));
      const saved = applyPatch(task, patch);
      const c = latest.current.ctx;
      showToast(
        rolesOf(saved, c.meId).length === 0
          ? `Đã lưu “${saved.subject}”. Việc này không còn trong danh sách của bạn.`
          : matchesView(saved, c)
            ? `Đã lưu “${saved.subject}”`
            : `Đã lưu “${saved.subject}”. Việc này không còn khớp bộ lọc hiện tại.`,
      );
    },
    [updateTask, fetchTask, showToast, withFollower],
  );

  // ---- keyboard shortcuts (outside text fields, no dialog open) ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (latest.current.dialog || latest.current.hidden || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
      // menus, pickers and their triggers own their keys (Select typeahead, calendar arrows, help menu Esc)
      if (el?.closest('[data-slot], [role="listbox"], [role="menu"], [role="alertdialog"], [data-testid="help-menu"]')) return;
      if (e.key === 'n' || e.key === 'N') {
        if (!latest.current.ctx.meId) return;
        e.preventDefault();
        openCreate();
      } else if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        toggleTheme();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openCreate, toggleTheme]);

  // scroll a task back into view after create / undo
  useEffect(() => {
    if (!revealId) return;
    const el = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="task-item"]')).find(
      n => n.dataset.taskId === revealId,
    );
    if (el) {
      el.scrollIntoView?.({ block: 'nearest' });
      setRevealId(null);
    }
  }, [revealId, visible]);

  // ---- render ----
  const ready = load === 'ready';
  // the description editor (Plate) is its own chunk: fetch it once the list is on screen and the browser is idle
  useEffect(() => {
    if (ready) prefetchEditorWhenIdle();
  }, [ready]);
  const raw = queryRaw.trim();
  const countText = ready
    ? `${visible.length} việc${query ? ` khớp “${raw}”` : ''} · ${SORTS[view.sortBy].label}: ${sortDirLabel(view)}`
    : '';
  const showDoneInfo = ready && view.quick !== 'open' && (counts.done > 0 || done.started);
  const hasMoreDone = !done.exhausted && loadedDone < counts.done;
  const waitingForDone = view.quick === 'done' && !done.started;
  const firstDoneLoading = view.quick !== 'open' && done.loading && visible.length === 0;

  let empty: { title: string; sub: string; reset: boolean } | null = null;
  if (ready && view.roles.length === 0) {
    empty = { title: 'Chưa chọn vai trò nào', sub: 'Tick ít nhất một mục trong Vai trò để xem công việc.', reset: true };
  } else if (ready && visible.length === 0 && !firstDoneLoading && !waitingForDone) {
    if (query) empty = { title: `Không có việc nào khớp “${raw}”`, sub: 'Thử từ khoá khác hoặc xoá nội dung ô tìm kiếm.', reset: false };
    else if (peopleOn)
      empty = { title: 'Không có việc nào khớp người đã chọn', sub: 'Bỏ tick trên các chip người ở trên, hoặc đặt lại bộ lọc.', reset: true };
    else if (filtersNarrowed(view))
      empty = { title: 'Không có việc nào khớp bộ lọc', sub: 'Chọn khoảng hạn chót, vai trò hoặc mức ưu tiên khác, hoặc đặt lại bộ lọc.', reset: true };
    else empty = { title: QUICK[view.quick].empty[0], sub: QUICK[view.quick].empty[1], reset: false };
  }

  const titleControls = (
    <WindowControls win={win}>
      <SideToggle hidden={rail.hidden} sideId={sideId} onToggle={rail.toggle} />
    </WindowControls>
  );

  const dialogMode: DialogMode | null = dialog ? dialog.mode : null;
  const dialogRoles = dialogTask ? rolesOf(dialogTask, meId) : [];
  const dialogReadOnly = dialogTask ? !canEdit(dialogTask, meId) : false;

  return (
    <>
      <div className="page" hidden={hidden}>
        <main className="board" ref={boardRef} data-side={rail.hidden ? 'hidden' : undefined} style={{ '--side-w': `${rail.width}px` } as CSSProperties}>
          {!rail.hidden && (
            <Sidebar id={sideId} view={view} counts={counts} onChange={setView} onReset={() => setView(resetFilters)} windowControls={titleControls} />
          )}
          {!rail.hidden && rail.desktop && <SideResizer width={rail.width} sideId={sideId} board={boardRef} onWidth={rail.setWidth} />}

          <div className="content">
            <Topbar
              query={queryRaw}
              onQuery={setQueryRaw}
              searchRef={searchRef}
              theme={theme}
              onToggleTheme={toggleTheme}
              onCreate={openCreate}
              lead={rail.hidden ? titleControls : undefined}
            />
            <ListBar
              title={QUICK[view.quick].label}
              countText={countText}
              reporters={ready ? peopleChips(base, people) : null}
              people={people}
              onPersonRel={(person, rel, on) => setPeople(f => togglePersonRel(f, person, rel, on))}
              onPersonClear={person => setPeople(({ [person.id]: _gone, ...rest }) => rest)}
              onRefresh={ready ? store.refresh : undefined}
              tools={<ColumnsMenu columns={columns} onChange={setColumns} />}
            />
            {ready && visible.length > 0 && (
              <ListHead columns={columns} onChange={setColumns} />
            )}
            <div className="scroller" ref={scrollerRef}>
              {load === 'loading' && <LoadingState />}
              {load === 'error' && <ErrorState message={store.error} onRetry={store.reload} />}
              {load === 'expired' && <SessionExpiredState />}
              {ready && (
                <>
                  <ul
                    className={['tasks', titleEdits > 0 && 'is-editing', view.quick === 'done' && 'only-done'].filter(Boolean).join(' ')}
                    aria-labelledby="list-title"
                    style={colsLook.style}
                    data-hide={colsLook.hide}
                  >
                    {visible.map(t => (
                      <TaskItem
                        key={t.id}
                        task={t}
                        readOnly={!canEdit(t, meId)}
                        now={now}
                        onToggle={toggleDone}
                        onStatus={changeStatus}
                        onRename={rename}
                        onOpen={openTask}
                        onEditing={onTitleEditing}
                        statusChoices={choicesFor(t.status)}
                        toggleBlocked={canMove(statusFlow, t.status, toggleTarget(t)) ? undefined : moveRefused(t.status, toggleTarget(t))}
                      />
                    ))}
                  </ul>
                  {empty && (
                    <EmptyState title={empty.title} sub={empty.sub} onReset={
                        empty.reset
                          ? () => {
                              setView(resetFilters);
                              setPeople({});
                            }
                          : undefined
                      } />
                  )}
                  {showDoneInfo && (
                    <div className="done-more">
                      <p className="done-progress" data-testid="done-progress" aria-live="polite">
                        Đã tải {Math.min(loadedDone, counts.done)}/{counts.done} việc đã xong
                        {done.loading ? ' · đang tải…' : ''}
                      </p>
                      {hasMoreDone && (
                        <button
                          className="btn-ghost"
                          type="button"
                          data-testid="load-more"
                          disabled={done.loading}
                          onClick={() => void loadMoreDone()}
                        >
                          {done.loading ? 'Đang tải…' : 'Tải thêm'}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </main>
      </div>

      <TaskDialog
        mode={dialogMode}
        task={dialogTask}
        me={me}
        roles={dialogRoles}
        readOnly={dialogReadOnly}
        now={now}
        directory={directory}
        onClose={closeDialog}
        onEdit={() => setDialog(d => (d && d.mode === 'view' && !dialogReadOnly ? { ...d, mode: 'edit' } : d))}
        onCancelEdit={() => setDialog(d => (d && d.mode === 'edit' ? { ...d, mode: 'view' } : d))}
        onDelete={requestDelete}
        confirming={confirmTask !== null || followAsk !== null}
        onCreate={createFromForm}
        onSave={saveFromForm}
        onUpload={api.uploadFile}
        onUploadImage={api.uploadInlineImage}
        onQuickStatus={quickStatus}
        onQuickChange={quickChange}
        activities={renderActivities}
        statusFlow={statusFlow}
      />

      <ConfirmDelete task={confirmTask} onCancel={() => setConfirmTask(null)} onConfirm={confirmDelete} />
      <ConfirmFollow ask={followAsk} onAnswer={a => followAsk?.answer(a)} />

      <Toast toast={toast} onHide={hideToast} />
    </>
  );
}
