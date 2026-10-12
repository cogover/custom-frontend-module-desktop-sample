import { AlertDialog } from 'radix-ui';
import { useState } from 'react';

export interface ConfirmAsk {
  title: string;
  text: string;
  okLabel: string;
  /** Runs the action; the box closes afterwards (success or error). */
  run: () => Promise<void>;
}

/** "Xoá …?" of the notes window (note, folder): "Huỷ" has the focus, Esc only closes this box. */
export function NotesConfirm({ ask, onClose }: { ask: ConfirmAsk | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialog.Root
      open={ask !== null}
      onOpenChange={o => {
        if (!o && !busy) onClose();
      }}
    >
      <AlertDialog.Portal>
        <div className="scrim confirm-scrim">
          <AlertDialog.Content className="sheet confirm-sheet" data-testid="notes-confirm">
            <AlertDialog.Title asChild>
              <h2>{ask?.title}</h2>
            </AlertDialog.Title>
            <AlertDialog.Description className="confirm-text">{ask?.text}</AlertDialog.Description>
            <div className="sheet-foot">
              <AlertDialog.Cancel asChild>
                <button className="btn-ghost" type="button" data-testid="notes-confirm-cancel" disabled={busy}>
                  Huỷ
                </button>
              </AlertDialog.Cancel>
              <button
                className="btn-danger"
                type="button"
                data-testid="notes-confirm-ok"
                disabled={busy}
                onClick={async () => {
                  if (!ask) return;
                  setBusy(true);
                  try {
                    await ask.run();
                  } finally {
                    setBusy(false);
                    onClose();
                  }
                }}
              >
                {busy ? 'Đang xoá…' : ask?.okLabel}
              </button>
            </div>
          </AlertDialog.Content>
        </div>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
