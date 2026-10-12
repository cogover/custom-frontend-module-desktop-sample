import { ApiError, apiPost, apiUpload } from '../api/client';
import { API_PATHS, REQ_SERVICE } from '../config';
import { attachmentFromUpload, type Attachment } from '../domain/attachments';
import { SETTINGS_OBJECT, WALLPAPER_FIELD } from './settingsConfig';
import { mySettingsBody, normalizeSettings, wallpaperSaveBody, type UserSettings } from './wallpaper';

/** What the settings read and write (CONTRACT §10). */
export interface SettingsApi {
  /** My `user_settings` record; null when I have none yet. */
  getMySettings(): Promise<UserSettings | null>;
  /** Uploads a picture for `desktop_wallpaper`; resolves with its FILE_METADATA. */
  uploadWallpaper(file: File, signal?: AbortSignal): Promise<Attachment>;
  /** Writes the wallpaper (null = back to the default) on my record, created when I have none; resolves with its id. */
  saveWallpaper(recordId: string | null, wallpaper: Attachment | null): Promise<string | null>;
}

export const settingsApi: SettingsApi = {
  async getMySettings() {
    const data = await apiPost<{ rows?: unknown }>(API_PATHS.list, REQ_SERVICE.list, mySettingsBody());
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    return normalizeSettings(rows[0]);
  },

  async uploadWallpaper(file, signal) {
    const form = new FormData();
    form.append('field_slug', WALLPAPER_FIELD);
    form.append('object_slug', SETTINGS_OBJECT.slug);
    form.append('file', file, file.name);
    try {
      return attachmentFromUpload(await apiUpload<unknown>(API_PATHS.upload, form, { signal }));
    } catch (e) {
      if (e instanceof Error && !(e instanceof ApiError) && e.name !== 'AbortError') throw new ApiError(e.message);
      throw e;
    }
  },

  async saveWallpaper(recordId, wallpaper) {
    if (recordId) {
      await apiPost<unknown>(API_PATHS.save, REQ_SERVICE.update, wallpaperSaveBody(wallpaper, recordId));
      return recordId;
    }
    if (!wallpaper) return null; // nothing saved yet and nothing to save
    const data = await apiPost<{ id?: unknown }>(API_PATHS.save, REQ_SERVICE.create, wallpaperSaveBody(wallpaper));
    const id = typeof data?.id === 'string' ? data.id : '';
    if (!id) throw new ApiError('Máy chủ không trả về mã thiết lập vừa tạo.');
    return id;
  },
};
