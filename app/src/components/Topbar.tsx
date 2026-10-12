import { CircleHelp, Moon, Plus, Search, Sun } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useId, useState, type ReactNode, type Ref } from 'react';
import type { Theme } from '../hooks/useTheme';

interface TopbarProps {
  query: string;
  onQuery: (q: string) => void;
  searchRef: Ref<HTMLInputElement>;
  theme: Theme;
  onToggleTheme: () => void;
  onCreate: () => void;
  /** Before the search: the window buttons + rail toggle while the left rail is hidden (like a macOS title bar). */
  lead?: ReactNode;
}

/** Keyboard shortcuts, listed in the "Trợ giúp" popover (was the "Phím tắt" box of the left rail). */
export const SHORTCUTS: [string, string][] = [
  ['N', 'Tạo công việc'],
  ['/', 'Tìm kiếm'],
  ['T', 'Đổi sáng / tối'],
  ['⌘\\', 'Ẩn / hiện cột trái'],
  ['Esc', 'Đóng hộp thoại'],
  ['2×', 'Bấm đúp tên việc để sửa'],
];

function HelpMenu() {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        {/* Radix sets aria-expanded / aria-controls on the trigger */}
        <button className="theme-btn help-btn" type="button" aria-label="Trợ giúp" title="Phím tắt" data-testid="help-toggle">
          <CircleHelp size={19} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="help-pop"
          data-testid="help-menu"
          align="end"
          sideOffset={8}
          collisionPadding={16}
          aria-labelledby={titleId}
        >
          <p className="tips-title" id={titleId}>
            Phím tắt
          </p>
          <ul>
            {SHORTCUTS.map(([key, label]) => (
              <li key={key}>
                <kbd>{key}</kbd>
                {label}
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function Topbar({ query, onQuery, searchRef, theme, onToggleTheme, onCreate, lead }: TopbarProps) {
  const dark = theme === 'dark';
  const themeLabel = dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối';
  return (
    <header className="topbar">
      {lead && <div className="title-ctl">{lead}</div>}
      <label className="search">
        <Search size={18} strokeWidth={1.8} aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          placeholder="Tìm theo tên, mô tả hoặc người giao…"
          aria-label="Tìm công việc"
          autoComplete="off"
          data-testid="search"
          value={query}
          onChange={e => onQuery(e.target.value)}
        />
      </label>
      <HelpMenu />
      <button
        className="theme-btn"
        type="button"
        aria-label={themeLabel}
        title={themeLabel}
        data-testid="theme-toggle"
        data-theme-current={theme}
        onClick={onToggleTheme}
      >
        {dark ? (
          <Sun size={19} strokeWidth={1.8} aria-hidden="true" />
        ) : (
          <Moon size={19} strokeWidth={1.8} aria-hidden="true" />
        )}
      </button>
      <button className="btn-primary" type="button" aria-label="Tạo công việc" data-testid="open-create" onClick={onCreate}>
        <Plus size={15} strokeWidth={2.2} aria-hidden="true" />
        <span>
          Tạo<span className="btn-long"> công việc</span>
        </span>
      </button>
    </header>
  );
}
