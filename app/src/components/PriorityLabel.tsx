import { Flag } from 'lucide-react';
import { PRIORITY } from '../domain/status';
import type { PrioritySlug } from '../domain/types';

/** Coloured flag + label, used in the priority Select (trigger and options). */
export function PriorityLabel({ priority }: { priority: PrioritySlug }) {
  return (
    <>
      <Flag className="prio-flag" data-tone={PRIORITY[priority].tone} size={14} strokeWidth={1.8} aria-hidden="true" />
      {PRIORITY[priority].label}
    </>
  );
}
