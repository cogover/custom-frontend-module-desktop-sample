import { AlertDialog } from 'radix-ui';
import { useRef } from 'react';
import { personName } from '../domain/people';
import type { Person } from '../domain/types';
import { useConfirmLayer } from '../hooks/useConfirmLayer';

/** add = also save the replaced assignee in `ccs`; skip = hand over only; cancel = keep the old assignee. */
export type FollowAnswer = 'add' | 'skip' | 'cancel';

export interface FollowQuestion {
  subject: string;
  /** The assignee being replaced. */
  person: Person;
  /** The new assignee. */
  to: Person;
  /** The replaced assignee is me. */
  isMe: boolean;
  /** Without following, I am no longer the reporter, the assignee or a follower: the task leaves my list. */
  losesAccess: boolean;
  /** Where the focus was when the question was asked (the form's "Lưu"): back there if nothing else had it. */
  returnTo?: HTMLElement | null;
}

const nameOf = (p: Person) => personName(p) || p.id;

/**
 * "Thêm vào người theo dõi?" when a task is handed over to someone else (CONTRACT §5.3g): the replaced
 * assignee may keep following it. "Thêm vào theo dõi" has the focus; Esc / "Huỷ" keep the old assignee.
 */
export function ConfirmFollow({ ask, onAnswer }: { ask: FollowQuestion | null; onAnswer: (a: FollowAnswer) => void }) {
  const open = ask !== null;
  const yes = useRef<HTMLButtonElement>(null);
  const restoreFocus = useConfirmLayer(open, false, () => onAnswer('cancel'), ask?.returnTo);
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={o => {
        if (!o) onAnswer('cancel');
      }}
    >
      <AlertDialog.Portal>
        <div className="scrim confirm-scrim">
          <AlertDialog.Content
            className="sheet confirm-sheet"
            data-testid="confirm-follow"
            onOpenAutoFocus={e => {
              e.preventDefault();
              yes.current?.focus();
            }}
            onCloseAutoFocus={restoreFocus}
          >
            <AlertDialog.Title asChild>
              <h2>Thêm vào người theo dõi?</h2>
            </AlertDialog.Title>
            {ask && (
              <AlertDialog.Description className="confirm-text">
                {ask.isMe ? (
                  <>
                    Bạn giao “{ask.subject}” cho {nameOf(ask.to)}. Thêm bạn vào người theo dõi để vẫn thấy công việc này?
                    {ask.losesAccess && ' Nếu không, công việc sẽ không còn trong danh sách của bạn.'}
                  </>
                ) : (
                  <>
                    “{ask.subject}” được giao lại cho {nameOf(ask.to)}. Thêm {nameOf(ask.person)} (người được giao trước) vào người theo dõi?
                  </>
                )}
              </AlertDialog.Description>
            )}
            <div className="sheet-foot">
              <AlertDialog.Cancel asChild>
                <button className="btn-ghost" type="button" data-testid="confirm-follow-cancel">
                  Huỷ
                </button>
              </AlertDialog.Cancel>
              <button className="btn-ghost" type="button" data-testid="confirm-follow-no" onClick={() => onAnswer('skip')}>
                Không
              </button>
              <button ref={yes} className="btn-primary" type="button" data-testid="confirm-follow-yes" onClick={() => onAnswer('add')}>
                Thêm vào theo dõi
              </button>
            </div>
          </AlertDialog.Content>
        </div>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
