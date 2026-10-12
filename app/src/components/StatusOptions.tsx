import { STATUS_ORDER, isKnownStatus, statusMeta } from '../domain/status';
import { SelectItem } from './ui/select';

/** What the status trigger shows (passed to SelectValue so the closed Select needs no items). */
export function StatusLabel({ status }: { status: string }) {
  const meta = statusMeta(status);
  return (
    <>
      <span className="status-dot" data-tone={meta.tone} aria-hidden="true" />
      {meta.label}
    </>
  );
}

/**
 * The statuses as Select items, each with its colour dot: the 7 of them (plus an unknown current slug), or
 * only `allowed` when the status workflow limits the choice (CONTRACT §4 "Quy trình trạng thái").
 */
export function StatusOptions({ current, allowed }: { current: string; allowed?: readonly string[] }) {
  const slugs = allowed ?? (isKnownStatus(current) || !current ? STATUS_ORDER : [current, ...STATUS_ORDER]);
  return (
    <>
      {slugs.map(s => {
        const meta = statusMeta(s);
        return (
          <SelectItem key={s} value={s}>
            <span className="status-dot" data-tone={meta.tone} aria-hidden="true" />
            {meta.label}
          </SelectItem>
        );
      })}
    </>
  );
}
