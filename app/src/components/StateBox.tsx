import { CircleAlert, ClipboardCheck, LoaderCircle, LogIn } from 'lucide-react';
import { LOGIN_URL, TASKS_LOADING, type LoadingText } from '../config';

/** The loading box of every window (same look in Công việc, Ghi chú, Cài đặt and the desktop's loading frame). */
export function LoadingState({ text = TASKS_LOADING, testId = 'app-loading' }: { text?: LoadingText; testId?: string }) {
  return (
    <div className="empty" data-testid={testId} role="status" aria-live="polite">
      <div className="empty-icon">
        <LoaderCircle size={22} strokeWidth={1.8} aria-hidden="true" />
      </div>
      <p className="empty-title">{text.title}</p>
      <p className="empty-sub">{text.sub}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="empty" data-testid="app-error" role="alert">
      <div className="empty-icon" data-tone="red">
        <CircleAlert size={22} strokeWidth={1.8} aria-hidden="true" />
      </div>
      <p className="empty-title">Không tải được công việc</p>
      <p className="empty-sub">{message}</p>
      <button className="btn-ghost" type="button" data-testid="app-retry" onClick={onRetry}>
        Thử lại
      </button>
    </div>
  );
}

export function SessionExpiredState() {
  return (
    <div className="empty" data-testid="session-expired" role="alert">
      <div className="empty-icon">
        <LogIn size={22} strokeWidth={1.8} aria-hidden="true" />
      </div>
      <p className="empty-title">Phiên đăng nhập đã hết hạn</p>
      <p className="empty-sub">Đăng nhập lại Cogover rồi mở lại trang này để tiếp tục.</p>
      <a className="btn-primary empty-action" href={LOGIN_URL} target="_top">
        Đăng nhập lại
      </a>
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  sub: string;
  onReset?: () => void;
}

export function EmptyState({ title, sub, onReset }: EmptyStateProps) {
  return (
    <div className="empty" data-testid="empty-state">
      <div className="empty-icon">
        <ClipboardCheck size={22} strokeWidth={1.8} aria-hidden="true" />
      </div>
      <p className="empty-title">{title}</p>
      <p className="empty-sub">{sub}</p>
      {onReset && (
        <button className="btn-ghost" type="button" data-testid="empty-reset" onClick={onReset}>
          Đặt lại bộ lọc
        </button>
      )}
    </div>
  );
}
