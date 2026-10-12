import { CLIENT_TIME_ZONE, WORKSPACE_ID } from '../config';
import { attachmentHref, extOf, parseAttachments, type Attachment } from '../domain/attachments';
import type { ListBody } from '../domain/requests';
import { readStorage, writeStorage } from '../domain/storage';
import {
  SETTINGS_FIELDS,
  SETTINGS_OBJECT,
  WALLPAPER_CACHE_KEY,
  WALLPAPER_EVENT,
  WALLPAPER_EXTS,
  WALLPAPER_FIELD,
  WALLPAPER_MAX_BYTES,
} from './settingsConfig';

/** My settings record (CONTRACT §10): its id and the wallpaper (null = the default picture). */
export interface UserSettings {
  id: string;
  wallpaper: Attachment | null;
}

/** My record: `created_by` = me, the last updated first (a second record, if any, is ignored). */
export const mySettingsBody = (): ListBody => ({
  object_slug: SETTINGS_OBJECT.slug,
  type: 1,
  logic_sequence: '',
  filters: [{ field: 'created_by', op: '=', params: '$currentUser', fieldType: 'lookup_normal' }],
  fields: SETTINGS_FIELDS,
  sorts: [{ updated: { order: 'desc' } }],
  order_direction: 'next',
  search_after: [],
  size: 5,
});

export function normalizeSettings(row: unknown): UserSettings | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id : '';
  if (!id) return null;
  // the single file comes back as a JSON string of one FILE_METADATA (an object or an array is read too)
  return { id, wallpaper: parseAttachments(r[WALLPAPER_FIELD])[0] ?? null };
}

/** Save body of `user_settings`: the field takes one FILE_METADATA object (not an array), null clears it. */
export function wallpaperSaveBody(wallpaper: Attachment | null, id?: string) {
  const fields = { [WALLPAPER_FIELD]: wallpaper ? wallpaper.meta : null };
  return {
    workspace_id: WORKSPACE_ID,
    object_type: SETTINGS_OBJECT.id,
    client_time_zone: CLIENT_TIME_ZONE,
    data: { object_type: SETTINGS_OBJECT.id, workspace_id: WORKSPACE_ID, ...fields, ...(id ? { id } : {}) },
  };
}

/** Same-origin URL of the picture (session cookie; `?redirect=true` answers with the image itself). */
export const wallpaperUrl = (a: Attachment) => attachmentHref(a);

/** Why a picked file cannot be the wallpaper; null when it may be uploaded. */
export function wallpaperProblem(file: { name: string; size: number }): string | null {
  const ext = extOf(file.name);
  if (!(WALLPAPER_EXTS as readonly string[]).includes(ext)) return 'Chỉ nhận ảnh JPG, PNG hoặc WebP.';
  if (file.size === 0) return 'File ảnh rỗng.';
  if (file.size > WALLPAPER_MAX_BYTES) return `Ảnh lớn hơn ${WALLPAPER_MAX_BYTES / 1024 / 1024} MB.`;
  return null;
}

/** Upload refused by the file server (English) → Vietnamese for the known answers, the rest as sent. */
export function wallpaperUploadProblem(message: string): string {
  if (/file type not allowed/i.test(message)) return 'Chỉ nhận ảnh JPG, PNG hoặc WebP.';
  if (/size|too large|exceed/i.test(message)) return `Ảnh lớn hơn ${WALLPAPER_MAX_BYTES / 1024 / 1024} MB.`;
  return message;
}

// ---- the wallpaper shown behind the windows (body::before, `--wallpaper`) ----

let shown: string | null = null;
let request = 0;

/** The custom wallpaper on screen (null = the default picture). */
export const currentWallpaper = () => shown;

/** Resolves once the picture is downloaded (or failed: the caller shows it anyway, the CSS keeps the colour under it). */
export function preloadImage(url: string): Promise<void> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });
}

function apply(url: string | null) {
  shown = url;
  const root = document.documentElement.style;
  if (url) root.setProperty('--wallpaper', `url("${url.replace(/["\\\n]/g, encodeURIComponent)}")`);
  else root.removeProperty('--wallpaper');
  writeStorage(WALLPAPER_CACHE_KEY, url ?? '');
  window.dispatchEvent(new Event(WALLPAPER_EVENT));
}

/**
 * Shows a wallpaper (null = the default picture) once it is downloaded, so the old one stays until then; the last
 * call wins. `preload: false` shows it at once (the cached URL at start, before the settings are read).
 */
export async function showWallpaper(url: string | null, { preload = true }: { preload?: boolean } = {}): Promise<void> {
  const id = ++request;
  if (url && url !== shown && preload) await preloadImage(url);
  if (id === request) apply(url);
}

/** The wallpaper this browser showed last ('' = default). */
export const cachedWallpaper = (): string | null => readStorage(WALLPAPER_CACHE_KEY) || null;
