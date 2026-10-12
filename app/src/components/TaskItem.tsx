import { Calendar, Check, Flag } from 'lucide-react';
import { memo, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { dueInfo } from '../domain/filters';
import { priorityMeta, statusMeta } from '../domain/status';
import { isDone } from '../domain/task';
import type { Task } from '../domain/types';
import { personName } from '../domain/people';
import { Avatar } from './Person';
import { StatusLabel, StatusOptions } from './StatusOptions';
import { HoverCard, HoverCardContent, HoverCardTrigger } from './ui/hover-card';
import { Input } from './ui/input';
import { Select, SelectContent, SelectTrigger, SelectValue } from './ui/select';

export interface TaskItemProps {
  task: Task;
  readOnly: boolean;
  now: number;
  onToggle: (task: Task, checked: boolean) => void;
  onStatus: (task: Task, status: string) => void;
  onRename: (task: Task, subject: string) => void;
  onOpen: (task: Task) => void;
  /** Called with true when the quick title editor opens and false when it closes. */
  onEditing?: (on: boolean) => void;
  /** Statuses the select offers (the workflow's next steps); all when not given. */
  statusChoices?: readonly string[];
  /** Why ticking / unticking is not possible here (the workflow); undefined when it is. */
  toggleBlocked?: string;
}

const SUBJECT_MAX = 255;

const PERSON_CELL = {
  reporter: { label: 'Người giao', none: 'Chưa có người giao', testId: 'task-reporter' },
  assignee: { label: 'Giao cho', none: 'Chưa giao cho ai', testId: 'task-assignee' },
} as const;

/** The hover cards of the card meta open at once and close quickly (shadcn Hover Card, CONTRACT §5 "Người"). */
const HOVER = { openDelay: 0, closeDelay: 100 } as const;

/**
 * "Người giao" / "Giao cho" cell: avatar only in the column layout (name in the accessible name and in a hover
 * card); when the meta row wraps (≤980px), the role, the avatar and the name.
 */
function PersonCell({ person, role }: { person: Task['reporter']; role: keyof typeof PERSON_CELL }) {
  const c = PERSON_CELL[role];
  const name = person ? personName(person) || 'Không rõ tên' : null;
  return (
    <HoverCard {...HOVER}>
      <HoverCardTrigger asChild>
        <span className={person ? 'person' : 'person none'} data-col={role} role="img" aria-label={name ? `${c.label}: ${name}` : c.none} data-testid={c.testId}>
          <span className="prole" aria-hidden="true">
            {c.label}
          </span>
          {person ? (
            <Avatar person={person} />
          ) : (
            <span className="pshort" aria-hidden="true">
              —
            </span>
          )}
          <span className="pname">{name ?? 'Chưa có'}</span>
        </span>
      </HoverCardTrigger>
      <HoverCardContent className="hover-info w-auto max-w-72 p-3" data-testid={`${c.testId}-card`}>
        {person ? (
          <div className="hc-person">
            <Avatar person={person} />
            <div>
              <p className="hc-title">{name}</p>
              <p className="hc-sub">{c.label}</p>
            </div>
          </div>
        ) : (
          <p className="hc-sub">{c.none}</p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

/** Priority cell: the coloured flag only; its label in the accessible name and in a hover card. */
function PriorityCell({ priority }: { priority: string }) {
  const pr = priorityMeta(priority);
  return (
    <HoverCard {...HOVER}>
      <HoverCardTrigger asChild>
        <span className="prio" data-col="priority" data-tone={pr.tone} data-testid="task-priority" role="img" aria-label={`Ưu tiên: ${pr.label}`}>
          <Flag size={14} strokeWidth={1.8} aria-hidden="true" />
          <span className="prio-label" aria-hidden="true">
            {pr.label}
          </span>
        </span>
      </HoverCardTrigger>
      <HoverCardContent className="hover-info w-auto p-3" data-testid="task-priority-card">
        <p className="hc-sub">Mức ưu tiên</p>
        <span className="prio" data-tone={pr.tone}>
          <Flag size={14} strokeWidth={1.8} aria-hidden="true" />
          {pr.label}
        </span>
      </HoverCardContent>
    </HoverCard>
  );
}

/**
 * A press outside the title editor only ends the edit (saved on blur): the click that follows it must
 * not also open a card's popup. That one native click is remembered here and ignored by the cards.
 */
let clickEndingEdit: Event | null = null;

function swallowClickAfterThisPress() {
  const remember = (e: Event) => {
    clickEndingEdit = e;
  };
  document.addEventListener('click', remember, { capture: true, once: true });
  // no click (e.g. the press became a text selection drag): forget it so a later click still works
  document.addEventListener(
    'pointerup',
    () => setTimeout(() => document.removeEventListener('click', remember, { capture: true }), 0),
    { capture: true, once: true },
  );
}

function TitleEditor({ task, onDone }: { task: Task; onDone: (value: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
    const onPress = (e: PointerEvent) => {
      if (e.target !== el) swallowClickAfterThisPress();
    };
    document.addEventListener('pointerdown', onPress, true);
    return () => document.removeEventListener('pointerdown', onPress, true);
  }, []);
  const finish = (keep: boolean) => {
    if (finished.current) return;
    finished.current = true;
    onDone(keep ? (ref.current?.value ?? '') : null);
  };
  return (
    <Input
      ref={ref}
      className="title-edit h-auto"
      data-testid="title-edit"
      defaultValue={task.subject}
      maxLength={SUBJECT_MAX}
      aria-label="Sửa tên công việc"
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
    />
  );
}

function TaskItemInner({ task, readOnly, now, onToggle, onStatus, onRename, onOpen, onEditing, statusChoices, toggleBlocked }: TaskItemProps) {
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing || !onEditing) return;
    onEditing(true);
    return () => onEditing(false);
  }, [editing, onEditing]);
  // items are only rendered while the menu is open: a closed Radix Select otherwise renders all of them
  const [statusOpen, setStatusOpen] = useState(false);
  const done = isDone(task);
  const st = statusMeta(task.status);
  const due = dueInfo(task, now);
  const titleId = `t-${task.id}`;

  // click on the card's empty space opens the detail popup; controls and the title text keep their own behaviour
  const handleClick = (e: MouseEvent<HTMLLIElement>) => {
    const target = e.target as Element;
    // React bubbles events from portals (the status menu) through the card: only real card clicks count
    if (!e.currentTarget.contains(target)) return;
    if (e.nativeEvent === clickEndingEdit) {
      // this click only ended a title edit (on this card or another one); the next click opens
      clickEndingEdit = null;
      return;
    }
    if (target.closest('.check, .status, .title-edit')) return;
    if (!readOnly && target.closest('.ttext')) return; // the title text is for double-click renaming
    if (String(window.getSelection?.() ?? '')) return; // the user was selecting text
    onOpen(task);
  };

  const handleKey = (e: KeyboardEvent<HTMLLIElement>) => {
    if (!e.currentTarget.contains(e.target as Node)) return;
    if (e.key === 'Enter' && e.target === e.currentTarget) {
      e.preventDefault();
      onOpen(task);
    }
  };

  const startEdit = () => {
    if (readOnly) return;
    window.getSelection?.()?.removeAllRanges();
    setEditing(true);
  };

  const endEdit = (value: string | null) => {
    setEditing(false);
    const next = value?.trim() ?? '';
    if (value !== null && next && next !== task.subject) onRename(task, next);
  };

  return (
    <li
      className={`task${done ? ' done' : ''}`}
      tabIndex={0}
      data-testid="task-item"
      data-task-id={task.id}
      data-status={task.status}
      data-readonly={readOnly ? 'true' : 'false'}
      onClick={handleClick}
      onKeyDown={handleKey}
    >
      <label
        className="check"
        title={readOnly ? 'Bạn chỉ theo dõi công việc này' : (toggleBlocked ?? (done ? 'Đánh dấu chưa xong' : 'Đánh dấu hoàn thành'))}
      >
        <input
          type="checkbox"
          data-testid="task-checkbox"
          checked={done}
          disabled={readOnly || Boolean(toggleBlocked)}
          aria-labelledby={titleId}
          onChange={e => onToggle(task, e.target.checked)}
        />
        <span className="box">
          <Check aria-hidden="true" />
        </span>
      </label>
      {/* the code is a link to the task (Ctrl/Cmd/middle click: new tab; a plain click opens the popup like the card) */}
      <a
        className="code"
        data-col="code"
        data-testid="task-code"
        href={`#/task/${task.id}`}
        tabIndex={-1}
        onClick={e => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) e.stopPropagation();
          else e.preventDefault();
        }}
      >
        {task.code}
      </a>
      <div className="main" data-col="main">
        <p className="title">
          {editing ? (
            <TitleEditor task={task} onDone={endEdit} />
          ) : (
            <span className="ttext" id={titleId} data-testid="task-title" onDoubleClick={startEdit}>
              {task.subject}
            </span>
          )}
          {readOnly && (
            <span className="role-tag" data-testid="task-role" title="Bạn chỉ theo dõi công việc này">
              Theo dõi
            </span>
          )}
        </p>
        {task.descText && (
          <p className="desc" title={task.descText}>
            {task.descText}
          </p>
        )}
      </div>
      <div className="meta">
        <Select value={task.status} disabled={readOnly} open={statusOpen} onOpenChange={setStatusOpen} onValueChange={v => onStatus(task, v)}>
          <SelectTrigger
            className="status status-trigger"
            data-col="status"
            data-tone={st.tone}
            data-testid="task-status"
            aria-label={`Trạng thái của “${task.subject}”`}
          >
            <SelectValue>
              <StatusLabel status={task.status} />
            </SelectValue>
          </SelectTrigger>
          <SelectContent>{statusOpen && <StatusOptions current={task.status} allowed={statusChoices} />}</SelectContent>
        </Select>
        <PersonCell person={task.reporter} role="reporter" />
        <PersonCell person={task.assignee} role="assignee" />
        <PriorityCell priority={task.priority} />
        <span className={`due ${due.cls}`.trim()} data-col="due" title={due.title} data-testid="task-due">
          <Calendar size={14} strokeWidth={1.8} aria-hidden="true" />
          <span className="due-text">{due.text}</span>
        </span>
      </div>
    </li>
  );
}

export const TaskItem = memo(TaskItemInner);
