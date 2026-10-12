/**
 * The workflow of the task status (Cogover transition rule on field `status`, CONTRACT §4 "Quy trình trạng
 * thái"): from each status only some others may follow, and a new task may only start in some. The server
 * refuses any other change (r: 48 / "is not in transition rule"); the UI offers the allowed ones only.
 * Undo is not a way back: a reverse step must be a flow of its own (checked on the Workspace).
 */
import { STATUS_ORDER, statusMeta } from './status';

export interface StatusFlow {
  /** Statuses a new task may be created in (flows from `_initial`). */
  initial: string[];
  /** status → statuses it may move to. */
  next: Record<string, string[]>;
}

const INITIAL = '_initial';
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/**
 * Active rules of the status field → one workflow (flows of several rules add up); null when no rule
 * applies (every status is allowed). Rules limited to some records (`shouldFilterRecord`) are left to the
 * server: the UI cannot tell which records they cover.
 */
export function parseStatusFlow(rules: unknown, statusFieldId: string): StatusFlow | null {
  const list = Array.isArray(rules) ? rules : rules && typeof rules === 'object' ? [rules] : [];
  const initial = new Set<string>();
  const next = new Map<string, Set<string>>();
  let found = false;
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const rule = raw as Record<string, unknown>;
    if (Number(rule.status) !== 1 || str(rule.objectFieldId) !== statusFieldId || rule.shouldFilterRecord === true) continue;
    const flows = Array.isArray(rule.flows) ? rule.flows : [];
    for (const f of flows) {
      if (!f || typeof f !== 'object') continue;
      const from = str((f as Record<string, unknown>).originValue).trim();
      const to = str((f as Record<string, unknown>).targetValue).trim();
      if (!from || !to || to === INITIAL) continue;
      found = true;
      if (from === INITIAL) initial.add(to);
      else {
        if (!next.has(from)) next.set(from, new Set());
        next.get(from)!.add(to);
      }
    }
  }
  if (!found) return null;
  const ordered = (set: Iterable<string>) => sortStatuses([...set]);
  return { initial: ordered(initial), next: Object.fromEntries([...next].map(([k, v]) => [k, ordered(v)])) };
}

/** In the order of the status list (unknown slugs last, as given). */
function sortStatuses(list: string[]): string[] {
  const rank = (s: string) => {
    const i = (STATUS_ORDER as readonly string[]).indexOf(s);
    return i < 0 ? STATUS_ORDER.length : i;
  };
  return [...new Set(list)].sort((a, b) => rank(a) - rank(b));
}

/** May a task in `from` be moved to `to`? (Staying is always fine.) */
export function canMove(flow: StatusFlow | null, from: string, to: string): boolean {
  if (!flow || from === to) return true;
  return (flow.next[from] ?? []).includes(to);
}

/** Choices for a task currently in `current`: itself, then where it may go (all statuses without a rule). */
export function statusChoices(flow: StatusFlow | null, current: string): string[] {
  if (!flow) return [...STATUS_ORDER];
  return sortStatuses([current, ...(flow.next[current] ?? [])].filter(Boolean));
}

/** Statuses a new task may start in (all without a rule). */
export function createChoices(flow: StatusFlow | null): string[] {
  return flow && flow.initial.length ? flow.initial : [...STATUS_ORDER];
}

/** Why the change is refused, in Vietnamese ("Mới" → "Đã xử lý"). */
export const moveRefused = (from: string, to: string) =>
  `Quy trình không cho chuyển từ “${statusMeta(from).label}” sang “${statusMeta(to).label}”`;

/** The server's refusal of a status change (r: 48 / "not in transition rule") put in Vietnamese. */
export function transitionError(message: string): string | null {
  const m = /target value \[([^\]]+)\] is not allowed, current value: \[([^\]]+)\]/i.exec(message);
  if (m) return moveRefused(m[2], m[1]);
  const n = /Value: \[([^\]]+)\] is not in transition rule/i.exec(message);
  if (n) return `Quy trình không cho phép trạng thái “${statusMeta(n[1]).label}” ở bước này`;
  return null;
}
