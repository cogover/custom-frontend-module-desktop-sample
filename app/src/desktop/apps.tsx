import { Check, NotebookPen, Settings, Wrench } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import App from '../App';
import { TASKS_LOADING, type LoadingText } from '../config';
import { DEVTOOLS_LOADING } from '../devtools/devtoolsConfig';
import { NOTES_LOADING } from '../notes/notesConfig';
import { SETTINGS_LOADING } from '../settings/settingsConfig';
import { lazyWindow } from './lazyWindow';
import { DEVTOOLS_APP, NOTES_APP, SELF_APP, SETTINGS_APP } from './url';
import type { WindowApi } from './WindowControls';

/** One icon in the dock (left bar, macOS style). */
export interface DockApp {
  /** Unique id; also the `dock-app-<id>` test id. */
  id: string;
  /** Shown beside the icon on hover and read by screen readers. */
  name: string;
  /** Drawn centred in the 48px rounded square: an icon node, or `{ src }` for an image filling the square. */
  icon: ReactNode | { src: string };
  /** CSS background of the square (colour or gradient); ignored for image icons. */
  background?: string;
  /** A window of this SPA, opened / restored in place by the desktop. */
  window?: ComponentType<{ win: WindowApi }>;
  /** Fetches the window's chunk beforehand (lazy windows): the desktop calls it once the page is idle. */
  preload?: () => Promise<unknown>;
  /** The window's loading box, also shown by the desktop while the window's chunk downloads. */
  loading?: LoadingText;
  /** Another page to open (another Custom Module, a Workspace URL…), for apps without `window`. */
  href?: string;
  /** Open `href` in a new browser tab instead of this one. */
  newTab?: boolean;
}

/** The notes and settings windows are their own chunks, fetched once the page is idle (or when opened before that). */
const NotesApp = lazyWindow(() => import('../notes/NotesApp'));
const SettingsApp = lazyWindow(() => import('../settings/SettingsApp'));
const DevToolsApp = lazyWindow(() => import('../devtools/DevToolsApp'));

/**
 * Apps in the dock, top to bottom. To add one, append an entry, e.g.
 * `{ id: 'crm', name: 'CRM', icon: <Users size={26} />, background: '#7c3aed', href: '/_cm_6/index.html' }`.
 */
export const DOCK_APPS: DockApp[] = [
  {
    id: SELF_APP,
    name: 'Công việc',
    icon: <Check size={28} strokeWidth={2.8} />,
    background: 'linear-gradient(180deg,#4F8DF7 0%,#2463EB 100%)',
    window: App,
    loading: TASKS_LOADING,
  },
  {
    id: NOTES_APP,
    name: 'Ghi chú',
    icon: <NotebookPen size={26} strokeWidth={2.2} />,
    background: 'linear-gradient(180deg,#FFD15C 0%,#F5A524 100%)',
    window: NotesApp,
    preload: NotesApp.preload,
    loading: NOTES_LOADING,
  },
  {
    id: DEVTOOLS_APP,
    name: 'Dev tools',
    icon: <Wrench size={25} strokeWidth={2.2} />,
    background: 'linear-gradient(180deg,#5B6B82 0%,#1F2937 100%)',
    window: DevToolsApp,
    preload: DevToolsApp.preload,
    loading: DEVTOOLS_LOADING,
  },
  {
    id: SETTINGS_APP,
    name: 'Cài đặt',
    icon: <Settings size={26} strokeWidth={2.2} />,
    background: 'linear-gradient(180deg,#A9B2BE 0%,#5F6875 100%)',
    window: SettingsApp,
    preload: SettingsApp.preload,
    loading: SETTINGS_LOADING,
  },
];
