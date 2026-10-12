import { useCallback, useState } from 'react';
import { STORAGE_KEYS } from '../config';
import { normalizeColumns, type ColumnsState } from '../domain/columns';
import { readStorage, writeStorage } from '../domain/storage';

export function loadColumns(): ColumnsState {
  try {
    return normalizeColumns(JSON.parse(readStorage(STORAGE_KEYS.columns) ?? 'null'));
  } catch {
    return normalizeColumns(null);
  }
}

/** The list columns (shown, order, widths); every change is saved in localStorage. */
export function useColumns() {
  const [columns, setState] = useState<ColumnsState>(loadColumns);
  const setColumns = useCallback((next: ColumnsState | ((s: ColumnsState) => ColumnsState)) => {
    setState(prev => {
      const value = typeof next === 'function' ? next(prev) : next;
      writeStorage(STORAGE_KEYS.columns, JSON.stringify(value));
      return value;
    });
  }, []);
  return [columns, setColumns] as const;
}
