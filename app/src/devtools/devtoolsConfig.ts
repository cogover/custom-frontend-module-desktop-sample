import { Binary, Braces, FileText, KeyRound, type LucideIcon } from 'lucide-react';
import type { LoadingText } from '../config';

export const DEVTOOLS_LOADING: LoadingText = { title: 'Đang mở Dev tools…', sub: 'Tải các công cụ cho lập trình viên.' };

export type ToolId = 'json' | 'markdown' | 'jwt' | 'base64';

export const TOOLS: readonly { id: ToolId; name: string; title: string; icon: LucideIcon }[] = [
  { id: 'json', name: 'JSON', title: 'Format & beautify JSON', icon: Braces },
  { id: 'markdown', name: 'Markdown', title: 'Markdown editor', icon: FileText },
  { id: 'jwt', name: 'JWT', title: 'JWT decoder / encoder', icon: KeyRound },
  { id: 'base64', name: 'Base64', title: 'Base64 decoder / encoder', icon: Binary },
];

/** localStorage: the tool shown last (what was typed is never saved — it may be a token or a secret). */
export const DEVTOOLS_STORAGE_KEY = 'cong-viec.devtools';
/** localStorage: the left rail of this window, `{ width, hidden }` (as the other apps). */
export const DEVTOOLS_SIDE_KEY = 'cong-viec.devtools.side';
export const DEVTOOLS_SIDE_DEFAULT = 220;
