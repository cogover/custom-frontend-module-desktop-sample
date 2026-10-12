import { useCallback, useRef, useState } from 'react';
import { errorMessage, isSessionExpired } from '../api/client';
import type { TaskApi } from '../api/tasks';
import type { Person } from '../domain/types';

export interface PeopleDirectory {
  status: 'idle' | 'loading' | 'ready' | 'error';
  people: Person[];
  error: string;
  /** Loads the active personnel list once per session (lazy, on first form open). */
  ensure: () => void;
}

export function usePeople(api: TaskApi, onExpired: () => void): PeopleDirectory {
  const [state, setState] = useState<Omit<PeopleDirectory, 'ensure'>>({ status: 'idle', people: [], error: '' });
  const busy = useRef(false);
  const loaded = useRef(false);

  const ensure = useCallback(() => {
    if (busy.current || loaded.current) return;
    busy.current = true;
    setState(s => ({ ...s, status: 'loading', error: '' }));
    api
      .listPeople()
      .then(people => {
        loaded.current = true;
        setState({ status: 'ready', people, error: '' });
      })
      .catch(e => {
        if (isSessionExpired(e)) onExpired();
        setState(s => ({ ...s, status: 'error', error: errorMessage(e) }));
      })
      .finally(() => {
        busy.current = false;
      });
  }, [api, onExpired]);

  return { ...state, ensure };
}
