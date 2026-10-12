import type { LoadingText } from '../config';
import { WS } from '../workspaces';

export const SETTINGS_LOADING: LoadingText = { title: 'Đang tải thiết lập…', sub: 'Lấy thiết lập cá nhân của bạn từ Cogover.' };

/**
 * Object `user_settings` (CONTRACT §10): one record per user — whose it is = `created_by` — holding the
 * personal settings of the SPA. For now only the desktop wallpaper (file field, one image).
 */
export const SETTINGS_OBJECT = { id: WS.settings, slug: 'user_settings' } as const;
export const WALLPAPER_FIELD = 'desktop_wallpaper';
export const SETTINGS_FIELDS = ['id', 'name', WALLPAPER_FIELD, 'updated'];

/** Like field `desktop_wallpaper` (`file_type` jpg/jpeg/png/webp, `max_size` 20 MB); the server stays the reference. */
export const WALLPAPER_MAX_BYTES = 20 * 1024 * 1024;
export const WALLPAPER_EXTS = ['jpg', 'jpeg', 'png', 'webp'] as const;
export const WALLPAPER_ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';

/** The last wallpaper URL of this browser: shown at once on the next load, before the settings are read. */
export const WALLPAPER_CACHE_KEY = 'cong-viec.wallpaper';
/** Window event sent when the wallpaper changes (the settings window shows the current one). */
export const WALLPAPER_EVENT = 'cong-viec-wallpaper';
