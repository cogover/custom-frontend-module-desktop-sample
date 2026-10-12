import { Folder as FolderIcon, FolderPlus } from 'lucide-react';
import { useRef, type CSSProperties } from 'react';
import { FIELD_H } from '../components/fields';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '../components/ui/select';
import { cn } from '../lib/utils';

export interface FolderOption {
  id: string;
  name: string;
  depth: number;
}

/** Radix Select items cannot have an empty value: "no folder" and "new folder" use these. */
const NONE = '__none__';
const NEW_FOLDER = '__new_folder__';

export interface FolderSelectProps {
  id: string;
  testId: string;
  /** null = no folder (top level). */
  value: string | null;
  onChange: (folderId: string | null) => void;
  folders: FolderOption[];
  /** Label of "no folder", e.g. "Không thuộc thư mục nào". */
  noneLabel: string;
  /** Adds "＋ Tạo thư mục mới…" at the end of the list (the value stays as it is). */
  onNewFolder?: () => void;
}

/**
 * One of my folders, as a shadcn Select (CONTRIBUTING.md: never the native select element): the folders in tree order, indented by
 * depth, "no folder" first and, when asked, "＋ Tạo thư mục mới…" last. The trigger carries `data-value`.
 */
export function FolderSelect({ id, testId, value, onChange, folders, noneLabel, onNewFolder }: FolderSelectProps) {
  const current = value ? folders.find(f => f.id === value) : undefined;
  // "Tạo thư mục mới…" opens its popup once the list has closed (and given the focus back), so the popup's
  // name box keeps the focus
  const askNew = useRef(false);
  return (
    <Select
      value={current ? current.id : NONE}
      onValueChange={v => {
        if (v === NEW_FOLDER) askNew.current = true;
        else if (v === NONE) onChange(null);
        // Radix also reports '' from its hidden native select element when the value is a folder created a moment ago
        // (not among its options yet): only real folders count
        else if (folders.some(f => f.id === v)) onChange(v);
      }}
    >
      <SelectTrigger id={id} data-testid={testId} data-value={current?.id ?? ''} className={cn('w-full', FIELD_H.default)}>
        <SelectValue>
          {current ? (
            <>
              <FolderIcon size={15} strokeWidth={1.8} aria-hidden="true" />
              {current.name}
            </>
          ) : (
            noneLabel
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        onCloseAutoFocus={e => {
          if (!askNew.current) return;
          askNew.current = false;
          e.preventDefault();
          onNewFolder?.();
        }}
      >
        <SelectItem value={NONE}>{noneLabel}</SelectItem>
        {folders.map(f => (
          <SelectItem key={f.id} value={f.id} style={{ paddingLeft: `calc(8px + ${f.depth} * 16px)` } as CSSProperties}>
            <FolderIcon size={15} strokeWidth={1.8} aria-hidden="true" />
            {f.name}
          </SelectItem>
        ))}
        {onNewFolder && (
          <>
            <SelectSeparator />
            <SelectItem value={NEW_FOLDER} data-testid="note-folder-new" className="folder-new-item">
              <FolderPlus size={15} strokeWidth={1.8} aria-hidden="true" />
              Tạo thư mục mới…
            </SelectItem>
          </>
        )}
      </SelectContent>
    </Select>
  );
}
