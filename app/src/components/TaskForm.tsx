import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { errorMessage } from '../api/client';
import { defaultDue, vnDateTimeToMs, vnIsoDate, vnTime } from '../domain/dates';
import { DEFAULT_PRIORITY, DEFAULT_STATUS, PRIORITY_ORDER } from '../domain/status';
import { peopleChangeAllowed } from '../domain/task';
import type { Person, PrioritySlug, Task } from '../domain/types';
import type { PeopleDirectory } from '../hooks/usePeople';
import { cn } from '../lib/utils';
import type { Attachment } from '../domain/attachments';
import type { InlineImage } from '../domain/inlineImages';
import { createChoices, statusChoices, type StatusFlow } from '../domain/statusFlow';
import { AttachButton, AttachmentChips, AttachmentErrors, useAttachmentUploads } from './Attachments';
import { DatePicker } from './DatePicker';
import { DescriptionField, type DescriptionApi } from './DescriptionField';
import { FIELD_H } from './fields';
import { PeoplePicker } from './PeoplePicker';
import { PersonPicker } from './PersonPicker';
import { PriorityLabel } from './PriorityLabel';
import { StatusLabel, StatusOptions } from './StatusOptions';
import { TimeSelect } from './TimeSelect';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

export interface FormValues {
  subject: string;
  /** Clean, sanitised description HTML ('' = empty); null = leave `description` alone (unsupported or unchanged). */
  descHtml: string | null;
  dueDate: number;
  priority: PrioritySlug | '';
  status: string;
  reporter: Person;
  assignee: Person;
  /** Followers picked when creating ([] = not sent: the Workspace adds its default followers); not in the edit form. */
  ccs: Person[];
  /** Uploaded files to keep (the task's own minus removed, plus new ones). */
  attachments: Attachment[];
  /** Pictures pasted into the description in this form (their FILE_METADATA goes to `_attachments`). */
  descImages: InlineImage[];
}

interface TaskFormProps {
  formId: string;
  mode: 'create' | 'edit';
  task: Task | null;
  me: Person;
  now: number;
  directory: PeopleDirectory;
  titleRef: RefObject<HTMLInputElement | null>;
  saving: boolean;
  /** The popup's footer: files on the left, Huỷ and Lưu/Tạo on the right are rendered into it. */
  footer: HTMLElement | null;
  upload: (file: File, signal: AbortSignal) => Promise<Attachment>;
  /** Uploads a picture pasted into the description (to `_attachments`). */
  uploadImage?: (file: File, signal: AbortSignal) => Promise<InlineImage>;
  /** The status workflow (transition rule): which statuses a new / this task may take. */
  statusFlow?: StatusFlow | null;
  onCancel: () => void;
  onSubmit: (values: FormValues) => Promise<void>;
}

const SUBJECT_MAX = 255;
export const PEOPLE_ERROR = 'Bạn cần là người giao hoặc người được giao';

export function TaskForm({ formId, mode, task, me, now, directory, titleRef, saving, footer, upload, uploadImage, statusFlow = null, onCancel, onSubmit }: TaskFormProps) {
  const uid = useId();
  const editing = mode === 'edit' && task !== null;
  const [initialDue] = useState(() =>
    editing && task.dueDate != null ? { date: vnIsoDate(task.dueDate), time: vnTime(task.dueDate) } : defaultDue(now),
  );
  const [subject, setSubject] = useState(editing ? task.subject : '');
  const desc = useRef<DescriptionApi>(null);
  const files = useAttachmentUploads(editing ? task.attachments : [], upload);
  const { addFiles } = files;
  const [dropping, setDropping] = useState(false);

  // files dropped anywhere on the popup are attached (taken before the description editor sees them)
  useEffect(() => {
    const sheet = footer?.closest<HTMLElement>('.sheet');
    if (!sheet) return;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      setDropping(true);
    };
    const leave = (e: DragEvent) => {
      if (!e.relatedTarget || !sheet.contains(e.relatedTarget as Node)) setDropping(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      setDropping(false);
      if (e.dataTransfer?.files.length) addFiles(e.dataTransfer.files);
    };
    sheet.addEventListener('dragover', over, true);
    sheet.addEventListener('dragleave', leave, true);
    sheet.addEventListener('drop', drop, true);
    return () => {
      sheet.removeEventListener('dragover', over, true);
      sheet.removeEventListener('dragleave', leave, true);
      sheet.removeEventListener('drop', drop, true);
    };
  }, [footer, addFiles]);
  useEffect(() => {
    footer?.closest('.sheet')?.classList.toggle('drop-target', dropping);
  }, [footer, dropping]);
  const [dueDate, setDueDate] = useState(initialDue.date);
  const [dueTime, setDueTime] = useState(initialDue.time);
  const [priority, setPriority] = useState<PrioritySlug | ''>(editing ? task.priority : DEFAULT_PRIORITY);
  // a new task starts in a status the workflow allows; an existing one may stay or take a next step
  const [statusList] = useState(() => (editing ? statusChoices(statusFlow, task.status) : createChoices(statusFlow)));
  const [status, setStatus] = useState(() => (editing ? task.status : statusList.includes(DEFAULT_STATUS) ? DEFAULT_STATUS : statusList[0]));
  const [reporter, setReporter] = useState<Person>((editing && task.reporter) || me);
  const [assignee, setAssignee] = useState<Person>((editing && task.assignee) || me);
  const [ccs, setCcs] = useState<Person[]>([]);
  const [titleErr, setTitleErr] = useState(false);
  const [dueErr, setDueErr] = useState(false);
  const [peopleErr, setPeopleErr] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [filesBlocked, setFilesBlocked] = useState(false);
  const [imagesBusy, setImagesBusy] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [prioOpen, setPrioOpen] = useState(false);

  const ids = {
    title: `${uid}-title`,
    titleErr: `${uid}-title-err`,
    status: `${uid}-status`,
    prio: `${uid}-prio`,
    reporter: `${uid}-reporter-label`,
    assignee: `${uid}-assignee-label`,
    ccs: `${uid}-ccs-label`,
    due: `${uid}-due-label`,
    date: `${uid}-date`,
    time: `${uid}-time`,
    dueErr: `${uid}-due-err`,
    peopleErr: `${uid}-people-err`,
  };

  const pickPerson = (set: (p: Person) => void) => (p: Person) => {
    set(p);
    setPeopleErr(false);
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving || files.uploading || imagesBusy) return;
    const trimmed = subject.trim();
    const due = vnDateTimeToMs(dueDate, dueTime);
    // editing a task assigned to me, I may hand it over (asked afterwards whether I keep following it)
    const peopleOk = editing ? peopleChangeAllowed(task, { reporter, assignee }, me.id) : reporter.id === me.id || assignee.id === me.id;
    setTitleErr(!trimmed);
    setDueErr(due === null);
    setPeopleErr(!peopleOk);
    setFormErr('');
    if (!trimmed) {
      titleRef.current?.focus();
      return;
    }
    if (due === null) {
      document.getElementById(dueDate ? ids.time : ids.date)?.focus();
      return;
    }
    if (!peopleOk) return;
    setFilesBlocked(files.failed.length > 0);
    if (files.failed.length) {
      // saving now would silently drop them: the user removes them (×) or picks them again first
      footer?.querySelector<HTMLElement>('[data-testid="attach-chip"][data-state="error"] [data-testid="attach-remove"]')?.focus();
      return;
    }
    try {
      const descHtml = desc.current ? desc.current.read() : editing ? null : '';
      const descImages = desc.current ? desc.current.images() : [];
      await onSubmit({ subject: trimmed, descHtml, dueDate: due, priority, status, reporter, assignee, ccs, attachments: files.attachments, descImages });
    } catch (err) {
      setFormErr(errorMessage(err));
    }
  };

  return (
    <form className="edit-pane" id={formId} data-testid="task-form" noValidate onSubmit={submit}>
      <div className="field">
        <label htmlFor={ids.title}>Tên công việc</label>
        <Input
          ref={titleRef}
          className={cn(FIELD_H.default, 'text-sm')}
          id={ids.title}
          data-testid="field-title"
          maxLength={SUBJECT_MAX}
          placeholder="VD: Thiết kế màn hình Hồ sơ"
          autoComplete="off"
          value={subject}
          aria-invalid={titleErr ? 'true' : undefined}
          aria-describedby={titleErr ? ids.titleErr : undefined}
          onChange={e => {
            setSubject(e.target.value);
            if (e.target.value.trim()) setTitleErr(false);
          }}
        />
        {titleErr && (
          <p className="err" id={ids.titleErr} data-testid="field-title-error">
            Nhập tên công việc để lưu.
          </p>
        )}
      </div>

      {/* properties in two rows, labels beside the fields (one column with labels above when narrow):
          1) status · priority · deadline   2) reporter · assignee   3) followers (new task only) */}
      <div className="f-props">
        <label className="f-label" htmlFor={ids.status}>
          Trạng thái
        </label>
        <div className="f-line">
          <div className="f-control">
            <Select value={status} onValueChange={setStatus} open={statusOpen} onOpenChange={setStatusOpen}>
              <SelectTrigger id={ids.status} data-testid="field-status" className={cn('w-fit min-w-40', FIELD_H.compact)}>
                <SelectValue>
                  <StatusLabel status={status} />
                </SelectValue>
              </SelectTrigger>
              <SelectContent>{statusOpen && <StatusOptions current={status} allowed={statusFlow ? statusList : undefined} />}</SelectContent>
            </Select>
          </div>
          <div className="f-group">
            <label className="f-label" htmlFor={ids.prio}>
              Mức ưu tiên
            </label>
            <div className="f-control">
              <Select value={priority || undefined} onValueChange={v => setPriority(v as PrioritySlug)} open={prioOpen} onOpenChange={setPrioOpen}>
                <SelectTrigger id={ids.prio} data-testid="field-priority" className={cn('w-fit min-w-36', FIELD_H.compact)}>
                  <SelectValue placeholder="Chưa chọn">{priority ? <PriorityLabel priority={priority} /> : undefined}</SelectValue>
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
            </div>
          </div>
          <div className="f-group">
            <span className="f-label" id={ids.due}>
              Hạn chót
            </span>
            <div className="f-control">
              <div className="due-inputs" role="group" aria-labelledby={ids.due}>
                <DatePicker
                  id={ids.date}
                  label="Ngày hạn chót"
                  testId="field-due-date"
                  size="compact"
                  value={dueDate}
                  invalid={dueErr && !dueDate}
                  describedBy={dueErr ? ids.dueErr : undefined}
                  onChange={v => {
                    setDueDate(v);
                    setDueErr(false);
                  }}
                />
                <TimeSelect
                  id={ids.time}
                  testId="field-due-time"
                  value={dueTime}
                  invalid={dueErr && !!dueDate}
                  describedBy={dueErr ? ids.dueErr : undefined}
                  onChange={v => {
                    setDueTime(v);
                    setDueErr(false);
                  }}
                />
              </div>
              {dueErr && (
                <p className="err" id={ids.dueErr} data-testid="field-due-error">
                  Chọn ngày và giờ hạn chót.
                </p>
              )}
            </div>
          </div>
        </div>

        <span className="f-label" id={ids.reporter}>
          Người giao
        </span>
        <div className={cn('f-line f-pair', !editing && 'f-trio')}>
          <div className="f-control">
            <PersonPicker
              label="Người giao"
              labelId={ids.reporter}
              value={reporter}
              me={me}
              directory={directory}
              onChange={pickPerson(setReporter)}
              testId="field-reporter"
              invalid={peopleErr}
              describedBy={peopleErr ? ids.peopleErr : undefined}
            />
          </div>
          <span className="f-label" id={ids.assignee}>
            Người được giao
          </span>
          <div className="f-control">
            <PersonPicker
              label="Người được giao"
              labelId={ids.assignee}
              value={assignee}
              me={me}
              directory={directory}
              onChange={pickPerson(setAssignee)}
              testId="field-assignee"
              invalid={peopleErr}
              describedBy={peopleErr ? ids.peopleErr : undefined}
            />
            {peopleErr && (
              <p className="err" id={ids.peopleErr} data-testid="field-people-error" role="alert">
                {PEOPLE_ERROR}
              </p>
            )}
          </div>
          {/* followers of an existing task are changed in the detail popup (saved at once) */}
          {!editing && (
            <>
              <span className="f-label f-ccs-label" id={ids.ccs}>
                Người theo dõi
              </span>
              <div className="f-control f-ccs">
                <PeoplePicker
                  label="Người theo dõi"
                  labelId={ids.ccs}
                  value={ccs}
                  me={me}
                  directory={directory}
                  onChange={setCcs}
                  testId="field-ccs"
                  emptyLabel="Mặc định của Workspace"
                />
              </div>
            </>
          )}
        </div>
      </div>

      <DescriptionField
        editing={editing}
        initialHtml={editing ? task.description : ''}
        apiRef={desc}
        uploadImage={uploadImage}
        onImagesBusy={setImagesBusy}
      />

      {filesBlocked && files.failed.length > 0 && (
        <p className="err form-err" role="alert" data-testid="form-error">
          Còn {files.failed.length} file chưa tải lên được. Bỏ file lỗi (bấm ×) rồi lưu lại.
        </p>
      )}
      {formErr && (
        <p className="err form-err" role="alert" data-testid="form-error">
          {formErr}
        </p>
      )}

      {footer &&
        createPortal(
          <>
            <div className="foot-files">
              <AttachButton onFiles={addFiles} disabled={saving} />
              <AttachmentChips items={files.items} onRemove={files.remove} disabled={saving} />
              <AttachmentErrors items={files.failed} />
              {files.note && (
                <p className="attach-note" role="status" data-testid="attach-note">
                  {files.note}
                </p>
              )}
            </div>
            <button className="btn-ghost" type="button" data-testid="form-cancel" disabled={saving} onClick={onCancel}>
              Huỷ
            </button>
            <button className="btn-primary" type="submit" form={formId} data-testid="form-submit" disabled={saving || files.uploading || imagesBusy}>
              {saving
                ? mode === 'create'
                  ? 'Đang tạo…'
                  : 'Đang lưu…'
                : files.uploading
                  ? 'Đang tải file…'
                  : imagesBusy
                    ? 'Đang tải ảnh…'
                    : mode === 'create'
                      ? 'Tạo công việc'
                      : 'Lưu'}
            </button>
          </>,
          footer,
        )}
    </form>
  );
}
