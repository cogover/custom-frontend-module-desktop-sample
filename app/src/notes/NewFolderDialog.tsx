import { X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { errorMessage, isSessionExpired } from '../api/client';
import { FolderSelect, type FolderOption } from './FolderSelect';

export interface NewFolderDialogProps {
  open: boolean;
  /** My folders, indented, for "Nằm trong". */
  folders: FolderOption[];
  /** Where the new folder goes at first (the folder picked in the editor), null = top level. */
  parentId: string | null;
  onCreate: (name: string, parentId: string | null) => Promise<{ id: string }>;
  /** Closed: with the new folder's id when one was created. */
  onClose: (createdId: string | null) => void;
}

const NAME_MAX = 255;

/** "Thư mục mới" from the note editor's folder list (CONTRACT §9.3): a name and the folder it goes in. */
export function NewFolderDialog({ open, folders, parentId, onCreate, onClose }: NewFolderDialogProps) {
  const id = useId();
  const [name, setName] = useState('');
  const [parent, setParent] = useState<string | null>(parentId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName('');
    setParent(parentId);
    setError('');
  }, [open, parentId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Nhập tên thư mục');
      document.getElementById(`${id}-name`)?.focus();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const folder = await onCreate(trimmed, parent);
      onClose(folder.id);
    } catch (err) {
      if (!isSessionExpired(err)) setError(`Không tạo được thư mục: ${errorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={o => {
        if (!o && !busy) onClose(null);
      }}
    >
      <Dialog.Portal>
        <div className="scrim confirm-scrim">
          <Dialog.Content className="sheet confirm-sheet folder-sheet" data-testid="new-folder-dialog" aria-describedby={undefined}>
            <form onSubmit={submit} noValidate>
              <div className="sheet-head">
                <Dialog.Title asChild>
                  <h2>Thư mục mới</h2>
                </Dialog.Title>
                <Dialog.Close asChild>
                  <button type="button" className="icon-btn" aria-label="Đóng" disabled={busy}>
                    <X size={18} strokeWidth={2} aria-hidden="true" />
                  </button>
                </Dialog.Close>
              </div>
              <div className="folder-fields">
                <div className="field">
                  <label htmlFor={`${id}-name`}>Tên thư mục</label>
                  <input
                    id={`${id}-name`}
                    className="input"
                    data-testid="new-folder-name"
                    maxLength={NAME_MAX}
                    placeholder="VD: Biên bản họp"
                    autoFocus
                    aria-invalid={Boolean(error && !name.trim()) || undefined}
                    value={name}
                    onChange={e => setName(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`${id}-parent`}>Nằm trong</label>
                  <FolderSelect
                    id={`${id}-parent`}
                    testId="new-folder-parent"
                    value={parent}
                    onChange={setParent}
                    folders={folders}
                    noneLabel="Không (thư mục gốc)"
                  />
                </div>
                {error && (
                  <p className="err" role="alert" data-testid="new-folder-error">
                    {error}
                  </p>
                )}
              </div>
              <div className="sheet-foot">
                <Dialog.Close asChild>
                  <button type="button" className="btn-ghost" disabled={busy}>
                    Huỷ
                  </button>
                </Dialog.Close>
                <button type="submit" className="btn-primary" data-testid="new-folder-create" disabled={busy}>
                  {busy ? 'Đang tạo…' : 'Tạo thư mục'}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
