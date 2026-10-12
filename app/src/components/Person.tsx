import { useState } from 'react';
import { personInitial, personName, personTone } from '../domain/people';
import type { Person } from '../domain/types';

function AvatarInner({ person }: { person: Person }) {
  const [broken, setBroken] = useState(false);
  const name = personName(person) || person.id;
  const url = person.avatarUrl && !broken ? person.avatarUrl : null;
  return (
    <span className="avatar" data-tone={personTone(name)} aria-hidden="true">
      {url ? <img src={url} alt="" onError={() => setBroken(true)} /> : personInitial(person)}
    </span>
  );
}

/** Photo when available, otherwise the first letter on a colour derived from the name. */
export function Avatar({ person }: { person: Person }) {
  return <AvatarInner key={person.avatarUrl ?? 'none'} person={person} />;
}

interface PersonLabelProps {
  person: Person | null;
  empty?: string;
  /** Tooltip prefix, e.g. "Người giao". */
  role?: string;
  testId?: string;
}

export function PersonLabel({ person, empty = 'Chưa có', role, testId }: PersonLabelProps) {
  if (!person) {
    return (
      <span className="person none" data-testid={testId}>
        {empty}
      </span>
    );
  }
  const name = personName(person) || 'Không rõ tên';
  return (
    <span className="person" title={role ? `${role}: ${name}` : name} data-testid={testId}>
      <Avatar person={person} />
      <span className="pname">{name}</span>
    </span>
  );
}

const STACK_MAX = 3;

/**
 * Several people in one line: overlapping avatars, the first name and "+N"; the title (and the text
 * read by screen readers) lists everybody.
 */
export function PeopleStack({ people, role }: { people: Person[]; role: string }) {
  const names = people.map(p => personName(p) || 'Không rõ tên');
  const rest = names.slice(1);
  return (
    <span className="pstack" title={`${role}: ${names.join(', ')}`} data-testid="people-stack" data-count={people.length}>
      <span className="pstack-avatars" aria-hidden="true">
        {people.slice(0, STACK_MAX).map(p => (
          <Avatar key={p.id} person={p} />
        ))}
      </span>
      <span className="pname">{names[0]}</span>
      {rest.length > 0 && (
        <>
          <span className="pmore" aria-hidden="true">
            +{rest.length}
          </span>
          <span className="sr-only">, {rest.join(', ')}</span>
        </>
      )}
    </span>
  );
}
