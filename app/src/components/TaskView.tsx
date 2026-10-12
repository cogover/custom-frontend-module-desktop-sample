import { Calendar, Flag } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { defaultDue, longDate, shortDateTime, vnDateTimeToMs, vnIsoDate, vnTime } from '../domain/dates';
import { dueRelative } from '../domain/filters';
import { sanitizeDescription } from '../domain/sanitize';
import { PRIORITY_ORDER, priorityMeta, statusMeta } from '../domain/status';
import { statusChoices, type StatusFlow } from '../domain/statusFlow';
import { isDone } from '../domain/task';
import type { Person, PrioritySlug, Role, Task, TaskPatch } from '../domain/types';
import type { PeopleDirectory } from '../hooks/usePeople';
import { cn } from '../lib/utils';
import { AttachmentLinks } from './Attachments';
import { DatePicker } from './DatePicker';
import { FIELD_H } from './fields';
import { PeoplePicker } from './PeoplePicker';
import { PeopleStack, PersonLabel } from './Person';
import { PersonPicker } from './PersonPicker';
import { PriorityLabel } from './PriorityLabel';
import { StatusLabel, StatusOptions } from './StatusOptions';
import { TimeSelect } from './TimeSelect';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

/** Saves one property right away from the detail view (CONTRACT §5.3d). */
export interface QuickEdit {
  me: Person;
  directory: PeopleDirectory;
  /** The status workflow: only the allowed next statuses are offered (null = all). */
  statusFlow?: StatusFlow | null;
  onStatus: (task: Task, status: string) => void;
  onChange: (task: Task, patch: TaskPatch) => void;
}

interface TaskViewProps {
  task: Task;
  roles: Role[];
  readOnly: boolean;
  now: number;
  /** When given (and the task is not read-only) the properties are controls that save at once. */
  quick?: QuickEdit;
  /** Shown under the description (the activities timeline). */
  children?: ReactNode;
}

/** The properties as controls: each change is saved right away by the caller. */
function QuickProps({ task, quick, now }: { task: Task; quick: QuickEdit; now: number }) {
  const uid = useId();
  const [statusOpen, setStatusOpen] = useState(false);
  const [prioOpen, setPrioOpen] = useState(false);
  const fallback = defaultDue(now);
  const date = task.dueDate != null ? vnIsoDate(task.dueDate) : '';
  const time = task.dueDate != null ? vnTime(task.dueDate) : fallback.time;
  const rel = dueRelative(task, now);
  const saveDue = (d: string, t: string) => {
    const ms = vnDateTimeToMs(d, t);
    if (ms !== null && ms !== task.dueDate) quick.onChange(task, { dueDate: ms });
  };
  const ids = { reporter: `${uid}-reporter`, assignee: `${uid}-assignee`, ccs: `${uid}-ccs`, due: `${uid}-due` };
  return (
    <div className="f-props v-props v-quick">
      <div className="v-row" data-group="task">
        <span className="f-label">Trạng thái</span>
        <div className="f-line">
          <span className="v-item">
            <Select value={task.status} open={statusOpen} onOpenChange={setStatusOpen} onValueChange={v => quick.onStatus(task, v)}>
              <SelectTrigger data-testid="view-status" aria-label="Trạng thái" className={cn('w-fit min-w-40', FIELD_H.compact)}>
                <SelectValue>
                  <StatusLabel status={task.status} />
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {statusOpen && <StatusOptions current={task.status} allowed={quick.statusFlow ? statusChoices(quick.statusFlow, task.status) : undefined} />}
              </SelectContent>
            </Select>
          </span>
          <div className="f-group">
            <span className="f-label">Mức ưu tiên</span>
            <span className="v-item">
              <Select
                value={task.priority || undefined}
                open={prioOpen}
                onOpenChange={setPrioOpen}
                onValueChange={v => v !== task.priority && quick.onChange(task, { priority: v as PrioritySlug })}
              >
                <SelectTrigger data-testid="view-priority" aria-label="Mức ưu tiên" className={cn('w-fit min-w-36', FIELD_H.compact)}>
                  <SelectValue placeholder="Chưa chọn">{task.priority ? <PriorityLabel priority={task.priority} /> : undefined}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {prioOpen &&
                    PRIORITY_ORDER.map(p => (
                      <SelectItem key={p} value={p}>
                        <PriorityLabel priority={p} />
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </span>
          </div>
          <div className="f-group">
            <span className="f-label" id={ids.due}>
              Hạn chót
            </span>
            <span className="v-item">
              <span className="due-inputs" role="group" aria-labelledby={ids.due}>
                <DatePicker value={date} onChange={d => saveDue(d, time)} testId="view-due-date" label="Ngày hạn chót" size="compact" />
                <TimeSelect value={time} onChange={t => saveDue(date || fallback.date, t)} testId="view-due-time" />
              </span>
              {rel.text && <span className={`due-chip ${rel.cls}`.trim()}>{rel.text}</span>}
            </span>
          </div>
        </div>
      </div>
      <div className="v-row" data-group="people">
        <span className="f-label" id={ids.reporter}>
          Người giao
        </span>
        <div className="f-line">
          <span className="v-item v-person">
            {task.reporter ? (
              <PersonPicker
                label="Người giao"
                labelId={ids.reporter}
                value={task.reporter}
                me={quick.me}
                directory={quick.directory}
                testId="view-reporter"
                onChange={p => p.id !== task.reporter?.id && quick.onChange(task, { reporter: p })}
              />
            ) : (
              <PersonLabel person={null} empty="Chưa có người giao" />
            )}
          </span>
          <div className="f-group">
            <span className="f-label" id={ids.assignee}>
              Người được giao
            </span>
            <span className="v-item v-person">
              {task.assignee ? (
                <PersonPicker
                  label="Người được giao"
                  labelId={ids.assignee}
                  value={task.assignee}
                  me={quick.me}
                  directory={quick.directory}
                  testId="view-assignee"
                  onChange={p => p.id !== task.assignee?.id && quick.onChange(task, { assignee: p })}
                />
              ) : (
                <PersonLabel person={null} empty="Chưa có người được giao" />
              )}
            </span>
          </div>
          <div className="f-group">
            <span className="f-label" id={ids.ccs}>
              Người theo dõi
            </span>
            <span className="v-item">
              <PeoplePicker
                label="Người theo dõi"
                labelId={ids.ccs}
                value={task.ccs}
                me={quick.me}
                directory={quick.directory}
                testId="view-ccs"
                onChange={people => quick.onChange(task, { ccs: people })}
              />
            </span>
          </div>
        </div>
      </div>
      {task.attachments.length > 0 && (
        <div className="v-row" data-group="files">
          <span className="f-label">Đính kèm</span>
          <div className="f-line v-files">
            <AttachmentLinks files={task.attachments} />
          </div>
        </div>
      )}
    </div>
  );
}

/** The properties as text (read-only tasks, or when no quick edit is offered). */
function StaticProps({ task, now }: { task: Task; now: number }) {
  const st = statusMeta(task.status);
  const pr = priorityMeta(task.priority);
  const rel = dueRelative(task, now);
  return (
    <div className="f-props v-props">
      <div className="v-row" data-group="task">
        <span className="f-label">Trạng thái</span>
        <div className="f-line">
          <span className="v-item">
            <span className="vchip" data-tone={st.tone}>
              <span className="vdot" />
              {st.label}
            </span>
          </span>
          <div className="f-group">
            <span className="f-label">Mức ưu tiên</span>
            <span className="v-item">
              {task.priority ? (
                <span className="prio" data-tone={pr.tone}>
                  <Flag size={14} strokeWidth={1.8} aria-hidden="true" />
                  {pr.label}
                </span>
              ) : (
                <span className="muted">—</span>
              )}
            </span>
          </div>
          <div className="f-group">
            <span className="f-label">Hạn chót</span>
            <span className="v-item">
              {task.dueDate != null ? (
                <>
                  <span className="v-due" title={`${longDate(task.dueDate)}, ${vnTime(task.dueDate)}`} data-testid="view-due">
                    <Calendar size={14} strokeWidth={1.8} aria-hidden="true" />
                    {shortDateTime(task.dueDate)}
                  </span>
                  {rel.text && <span className={`due-chip ${rel.cls}`.trim()}>{rel.text}</span>}
                </>
              ) : (
                <span className="muted">Không có hạn</span>
              )}
            </span>
          </div>
        </div>
      </div>
      <div className="v-row" data-group="people">
        <span className="f-label">Người giao</span>
        <div className="f-line">
          <span className="v-item">
            <PersonLabel person={task.reporter} empty="Chưa có người giao" role="Người giao" />
          </span>
          <div className="f-group">
            <span className="f-label">Người được giao</span>
            <span className="v-item">
              <PersonLabel person={task.assignee} empty="Chưa có người được giao" role="Người được giao" />
            </span>
          </div>
          <div className="f-group">
            <span className="f-label">Người theo dõi</span>
            <span className="v-item">
              {task.ccs.length ? <PeopleStack people={task.ccs} role="Người theo dõi" /> : <span className="muted">Không có</span>}
            </span>
          </div>
        </div>
      </div>
      {task.attachments.length > 0 && (
        <div className="v-row" data-group="files">
          <span className="f-label">Đính kèm</span>
          <div className="f-line v-files">
            <AttachmentLinks files={task.attachments} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Detail popup. The properties use the same two-row grid as the create/edit form (labels on the left,
 * the first label column shared by both rows), so switching view ↔ edit does not move things around:
 *   1) Trạng thái · Mức ưu tiên · Hạn chót   2) Người giao · Người được giao · Người theo dõi
 */
export function TaskView({ task, roles, readOnly, now, quick, children }: TaskViewProps) {
  const html = useMemo(() => sanitizeDescription(task.description), [task.description]);
  const hasDesc = Boolean(html) && (Boolean(task.descText) || /<img\b/i.test(html));

  return (
    <div className="view-pane" data-testid="task-view">
      {readOnly && (
        <p className="v-note" role="note">
          {roles.includes('cc') ? 'Bạn chỉ theo dõi công việc này' : 'Bạn không được giao công việc này — chỉ xem'}
        </p>
      )}
      {/* the task name is the popup's title (accessible name of the dialog) */}
      <Dialog.Title asChild>
        <h2 className={`v-title${isDone(task) ? ' done' : ''}`}>{task.subject}</h2>
      </Dialog.Title>
      {quick && !readOnly ? <QuickProps task={task} quick={quick} now={now} /> : <StaticProps task={task} now={now} />}
      <section className="v-desc">
        <h3>Mô tả</h3>
        {hasDesc ? (
          // sanitised with DOMPurify (no scripts, event handlers or inline styles; links open in a new tab)
          <div className="v-html" data-testid="task-desc" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <p className="muted">{readOnly ? 'Chưa có mô tả.' : 'Chưa có mô tả. Bấm “Sửa” để thêm.'}</p>
        )}
      </section>
      {children}
    </div>
  );
}
