/**
 * Toolbar buttons of the description editor. Shared with the main chunk so the placeholder shown
 * while the editor mounts looks exactly like the real toolbar (no flash).
 */
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Redo2,
  Strikethrough,
  TextQuote,
  Underline,
  Undo2,
  type LucideIcon,
} from 'lucide-react';

export type ToolId =
  'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'h1' | 'h2' | 'h3' | 'ul' | 'ol' | 'quote' | 'link' | 'undo' | 'redo';

export const TOOLS: Record<ToolId, { label: string; icon: LucideIcon }> = {
  bold: { label: 'Đậm (Ctrl+B)', icon: Bold },
  italic: { label: 'Nghiêng (Ctrl+I)', icon: Italic },
  underline: { label: 'Gạch chân (Ctrl+U)', icon: Underline },
  strike: { label: 'Gạch ngang (Ctrl+Shift+X)', icon: Strikethrough },
  code: { label: 'Code (Ctrl+E)', icon: Code },
  h1: { label: 'Tiêu đề 1', icon: Heading1 },
  h2: { label: 'Tiêu đề 2', icon: Heading2 },
  h3: { label: 'Tiêu đề 3', icon: Heading3 },
  ul: { label: 'Danh sách chấm', icon: List },
  ol: { label: 'Danh sách số', icon: ListOrdered },
  quote: { label: 'Trích dẫn', icon: TextQuote },
  link: { label: 'Liên kết (Ctrl+K)', icon: Link2 },
  undo: { label: 'Hoàn tác (Ctrl+Z)', icon: Undo2 },
  redo: { label: 'Làm lại (Ctrl+Shift+Z)', icon: Redo2 },
};

export const TOOL_GROUPS: ToolId[][] = [
  ['bold', 'italic', 'underline', 'strike', 'code'],
  ['h1', 'h2', 'h3'],
  ['ul', 'ol', 'quote', 'link'],
  ['undo', 'redo'],
];

/** Look-alike of the toolbar (inert): undo/redo start disabled in the real one too. */
export function StaticToolbar() {
  return (
    <div className="rte-toolbar" aria-hidden="true">
      {TOOL_GROUPS.map((group, i) => (
        <span key={group[0]} className="rte-group">
          {i > 0 && <span className="rte-sep" />}
          {group.map(id => {
            const Icon = TOOLS[id].icon;
            return (
              <span key={id} className={`rte-btn${id === 'undo' || id === 'redo' ? ' rte-btn-off' : ''}`}>
                <Icon size={16} strokeWidth={2} />
              </span>
            );
          })}
        </span>
      ))}
    </div>
  );
}
