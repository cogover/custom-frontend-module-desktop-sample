import type { ToastState } from '../hooks/useToast';

interface ToastProps {
  toast: ToastState | null;
  onHide: () => void;
}

/** Always in the DOM so screen readers announce changes (role=status, polite). */
export function Toast({ toast, onHide }: ToastProps) {
  return (
    <div className="toast" data-testid="toast" role="status" aria-live="polite" hidden={!toast}>
      <span className="toast-msg">{toast?.message}</span>
      {toast?.action && (
        <button
          type="button"
          data-testid="toast-undo"
          onClick={() => {
            toast.action?.run();
            onHide();
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}
