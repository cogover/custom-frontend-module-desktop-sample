import { Building2, Globe, Link2, Lock, UserPlus, Users, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { errorMessage, isSessionExpired } from '../api/client';
import { Avatar } from '../components/Person';
import { FIELD_H } from '../components/fields';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { personName } from '../domain/people';
import { fold } from '../domain/text';
import { cn } from '../lib/utils';
import type { Person } from '../domain/types';
import { VISIBILITY_LABEL, noteTitle, shareEntries } from './domain';
import type { Note, Ref, ShareEntry, ShareRole, Visibility } from './types';

const VISIBILITY_HINT: Record<Visibility, string> = {
  private: 'Chỉ bạn xem và sửa được. Danh sách bên dưới được giữ lại nhưng không có hiệu lực.',
  shared: 'Những người và phòng bên dưới xem được; ai có quyền “Có thể sửa” thì sửa được.',
  public: 'Mọi người đã đăng nhập Workspace và có liên kết đều xem được. Chỉ bạn sửa được.',
};
const VISIBILITY_ICON: Record<Visibility, ReactNode> = {
  private: <Lock size={20} strokeWidth={1.8} aria-hidden="true" />,
  shared: <Users size={20} strokeWidth={1.8} aria-hidden="true" />,
  public: <Globe size={20} strokeWidth={1.8} aria-hidden="true" />,
};
const VISIBILITIES: Visibility[] = ['private', 'shared', 'public'];
const ROLE_LABEL: Record<ShareRole, string> = { view: 'Có thể xem', edit: 'Có thể sửa' };

export interface ShareDialogProps {
  note: Note | null;
  me: Person | null;
  people: Person[];
  departments: Ref[];
  /** Loads the personnel and department lists (once). */
  onNeedDirectory: () => void;
  directoryError: string;
  onCopyLink: (note: Note) => void;
  /** Saves `visibility` + the four lists; the dialog closes when it resolves. */
  onSave: (note: Note, visibility: Visibility, entries: ShareEntry[]) => Promise<void>;
  onClose: () => void;
}

/**
 * "Chia sẻ" of a note (owner only, CONTRACT §9.5): private / shared with people or departments (each may view
 * or edit) / public in the Workspace. A press outside never closes it (as the popups of Công việc).
 */
export function ShareDialog({ note, me, people, departments, onNeedDirectory, directoryError, onCopyLink, onSave, onClose }: ShareDialogProps) {
  const open = note !== null;
  const titleId = useId();
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [entries, setEntries] = useState<ShareEntry[]>([]);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!note) return;
    setVisibility(note.visibility);
    setEntries(shareEntries(note));
    setError('');
    setBusy(false);
    onNeedDirectory();
  }, [note, onNeedDirectory]);

  const q = fold(query.trim());
  const taken = useMemo(() => new Set(entries.map(e => `${e.kind}:${e.id}`)), [entries]);
  const personOptions = useMemo(
    () => people.filter(p => p.id !== note?.owner?.id && !taken.has(`person:${p.id}`) && fold(personName(p)).includes(q)).slice(0, 30),
    [people, note, taken, q],
  );
  const deptOptions = useMemo(() => departments.filter(d => !taken.has(`department:${d.id}`) && fold(d.name).includes(q)).slice(0, 30), [departments, taken, q]);

  const add = (e: ShareEntry) => {
    setEntries(list => [...list, e]);
    setQuery('');
    setAdding(false);
  };
  const setRole = (e: ShareEntry, role: ShareRole) => setEntries(list => list.map(x => (x.kind === e.kind && x.id === e.id ? { ...x, role } : x)));
  const remove = (e: ShareEntry) => setEntries(list => list.filter(x => !(x.kind === e.kind && x.id === e.id)));
  const listsOn = visibility === 'shared';

  const save = async () => {
    if (!note || busy) return;
    setBusy(true);
    setError('');
    try {
      await onSave(note, visibility, entries);
    } catch (e) {
      if (!isSessionExpired(e)) setError(`Không lưu được: ${errorMessage(e)}`);
      setBusy(false);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={o => {
        if (!o && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <div className="scrim">
          <Dialog.Content className="sheet share-sheet" data-testid="share-dialog" aria-describedby={undefined} onInteractOutside={e => e.preventDefault()}>
            {note && (
              <>
                <div className="sheet-head">
                  <Dialog.Title asChild>
                    <h2>Chia sẻ “{noteTitle(note)}”</h2>
                  </Dialog.Title>
                  <Dialog.Close asChild>
                    <button className="icon-btn" type="button" aria-label="Đóng" title="Đóng" data-testid="share-close" disabled={busy}>
                      <X size={18} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </Dialog.Close>
                </div>

                <div className="sheet-body share-body">
                  <fieldset className="field vis-group">
                    <legend>Ai xem được</legend>
                    {VISIBILITIES.map(v => (
                      <label className="vis-option" key={v} data-checked={visibility === v || undefined}>
                        <input type="radio" name={`${titleId}-vis`} value={v} checked={visibility === v} onChange={() => setVisibility(v)} data-testid={`share-vis-${v}`} />
                        <span className="vis-icon">{VISIBILITY_ICON[v]}</span>
                        <span className="vis-text">
                          <span className="vis-label">{VISIBILITY_LABEL[v]}</span>
                          <span className="vis-hint">{VISIBILITY_HINT[v]}</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>

                  <div className="field share-people" data-disabled={!listsOn || undefined}>
                    <div className="share-people-head">
                      <span className="field-label">Người và phòng được chia sẻ</span>
                      <Popover
                        open={adding}
                        onOpenChange={o => {
                          setAdding(o);
                          if (o) onNeedDirectory();
                          else setQuery('');
                        }}
                      >
                        <PopoverTrigger asChild>
                          <button type="button" className="btn-ghost share-add" data-testid="share-add" disabled={!listsOn}>
                            <UserPlus size={15} strokeWidth={2} aria-hidden="true" />
                            Thêm người / phòng
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-0" align="end">
                          <Command shouldFilter={false}>
                            <CommandInput placeholder="Tìm theo tên người hoặc phòng…" value={query} onValueChange={setQuery} data-testid="share-search" />
                            <CommandList>
                              <CommandEmpty>{directoryError ? `Không tải được danh sách: ${directoryError}` : people.length || departments.length ? 'Không tìm thấy' : 'Đang tải…'}</CommandEmpty>
                              {personOptions.length > 0 && (
                                <CommandGroup heading="Nhân sự">
                                  {personOptions.map(p => (
                                    <CommandItem
                                      key={p.id}
                                      value={`p:${p.id}`}
                                      data-testid="share-option-person"
                                      onSelect={() => add({ kind: 'person', id: p.id, name: personName(p) || p.id, person: p, role: 'view' })}
                                    >
                                      <Avatar person={p} />
                                      {personName(p) || p.id}
                                      {p.id === me?.id ? ' (bạn)' : ''}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              )}
                              {deptOptions.length > 0 && (
                                <CommandGroup heading="Phòng ban">
                                  {deptOptions.map(d => (
                                    <CommandItem key={d.id} value={`d:${d.id}`} data-testid="share-option-department" onSelect={() => add({ kind: 'department', id: d.id, name: d.name, role: 'view' })}>
                                      <Building2 size={16} strokeWidth={1.8} aria-hidden="true" />
                                      {d.name}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              )}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                    {entries.length ? (
                      <ul className="share-list" data-testid="share-list">
                        {entries.map(e => (
                          <li key={`${e.kind}:${e.id}`} data-testid="share-entry" data-kind={e.kind}>
                            {e.kind === 'person' && e.person ? (
                              <Avatar person={e.person} />
                            ) : (
                              <span className="dept-icon" aria-hidden="true">
                                <Building2 size={15} strokeWidth={1.8} />
                              </span>
                            )}
                            <span className="who">
                              {e.name}
                              {e.kind === 'department' && <small> · phòng</small>}
                            </span>
                            <Select value={e.role} disabled={!listsOn} onValueChange={v => setRole(e, v as ShareRole)}>
                              <SelectTrigger className={cn('share-role w-auto', FIELD_H.sm)} aria-label={`Quyền của ${e.name}`} data-testid="share-role" data-value={e.role}>
                                <SelectValue>{ROLE_LABEL[e.role]}</SelectValue>
                              </SelectTrigger>
                              <SelectContent align="end">
                                <SelectItem value="view">{ROLE_LABEL.view}</SelectItem>
                                <SelectItem value="edit">{ROLE_LABEL.edit}</SelectItem>
                              </SelectContent>
                            </Select>
                            <button type="button" className="icon-btn" aria-label={`Bỏ ${e.name}`} title="Bỏ khỏi danh sách" onClick={() => remove(e)} data-testid="share-remove">
                              <X size={15} strokeWidth={2} aria-hidden="true" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted share-none">Chưa chia sẻ cho ai.</p>
                    )}
                  </div>
                  {error && (
                    <p className="err" role="alert" data-testid="share-error">
                      {error}
                    </p>
                  )}
                </div>

                <div className="sheet-foot share-foot">
                  <button type="button" className="btn-ghost share-copy" data-testid="share-copy" onClick={() => onCopyLink(note)}>
                    <Link2 size={15} strokeWidth={2} aria-hidden="true" />
                    Sao chép liên kết
                  </button>
                  <Dialog.Close asChild>
                    <button type="button" className="btn-ghost" data-testid="share-cancel" disabled={busy}>
                      Huỷ
                    </button>
                  </Dialog.Close>
                  <button type="button" className="btn-primary" data-testid="share-save" disabled={busy} onClick={() => void save()}>
                    {busy ? 'Đang lưu…' : 'Lưu'}
                  </button>
                </div>
              </>
            )}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
