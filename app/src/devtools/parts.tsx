import { Copy } from 'lucide-react';
import type { ReactNode } from 'react';

/** One half of a tool: a heading with its buttons, and the editor / result filling the rest. */
export function Pane({ title, actions, children, testId }: { title: string; actions?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section className="dt-pane" aria-label={title} data-testid={testId}>
      <div className="dt-pane-head">
        <h3 className="dt-pane-title">{title}</h3>
        <div className="dt-actions">{actions}</div>
      </div>
      {children}
    </section>
  );
}

export function ToolButton({ children, onClick, testId, disabled }: { children: ReactNode; onClick: () => void; testId?: string; disabled?: boolean }) {
  return (
    <button type="button" className="btn-ghost dt-btn" data-testid={testId} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

/** Copies `text` and tells so with a toast; disabled while there is nothing to copy. */
export function CopyButton({ text, notify, testId, label = 'Sao chép' }: { text: string; notify: (message: string) => void; testId?: string; label?: string }) {
  return (
    <ToolButton
      testId={testId}
      disabled={!text}
      onClick={() => {
        void (async () => {
          try {
            await navigator.clipboard.writeText(text);
            notify('Đã sao chép');
          } catch {
            notify('Trình duyệt không cho sao chép — hãy chọn và sao chép bằng tay.');
          }
        })();
      }}
    >
      <Copy size={14} strokeWidth={1.9} aria-hidden="true" />
      {label}
    </ToolButton>
  );
}

/** Two or three exclusive choices as a segmented control (`aria-pressed`). */
export function Segmented<T extends string>({ value, options, onChange, label, testId }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void; label: string; testId: string }) {
  return (
    <div className="dir dt-seg" role="group" aria-label={label} data-testid={testId} data-value={value}>
      {options.map(o => (
        <button key={o.value} type="button" aria-pressed={o.value === value} data-testid={`${testId}-${o.value}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export interface ToolProps {
  notify: (message: string) => void;
}
