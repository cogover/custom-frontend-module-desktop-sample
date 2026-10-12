import { AlertDialog } from 'radix-ui';
import { useState } from 'react';
import type { Task } from '../domain/types';
import { useConfirmLayer } from '../hooks/useConfirmLayer';

interface ConfirmDeleteProps {
  /** Task waiting for confirmation; null = closed. */
  task: Task | null;
  onCancel: () => void;
  /** Deletes on the server; the parent closes the box afterwards (success or error). */
  onConfirm: (task: Task) => Promise<void>;
}

/** "Xoá công việc?" — Radix AlertDialog; "Huỷ" has the focus; Esc only closes this box (never the popup under it). */
export function ConfirmDelete({ task, onCancel, onConfirm }: ConfirmDeleteProps) {
  const [busy, setBusy] = useState(false);
  const open = task !== null;
  // Esc only closes this box; focus goes back to the trash icon / "Xoá công việc" (see useConfirmLayer)
  const restoreFocus = useConfirmLayer(open, busy, onCancel);
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={o => {
        if (!o && !busy) onCancel();
      }}
    >
      <AlertDialog.Portal>
        {/* plain scrim (no Overlay / react-remove-scroll), same as the task popup */}
        <div className="scrim confirm-scrim">
          <AlertDialog.Content
            className="sheet confirm-sheet"
            data-testid="confirm-delete"
            onCloseAutoFocus={restoreFocus}
          >
            <AlertDialog.Title asChild>
              <h2>Xoá công việc?</h2>
            </AlertDialog.Title>
            <AlertDialog.Description className="confirm-text">
              “{task?.subject}” sẽ bị xoá vĩnh viễn khỏi Cogover.
            </AlertDialog.Description>
            <div className="sheet-foot">
              <AlertDialog.Cancel asChild>
                <button className="btn-ghost" type="button" data-testid="confirm-delete-cancel" disabled={busy}>
                  Huỷ
                </button>
              </AlertDialog.Cancel>
              <button
                className="btn-danger"
                type="button"
                data-testid="confirm-delete-ok"
                disabled={busy}
                onClick={async () => {
                  if (!task) return;
                  setBusy(true);
                  try {
                    await onConfirm(task);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? 'Đang xoá…' : 'Xoá'}
              </button>
            </div>
          </AlertDialog.Content>
        </div>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
