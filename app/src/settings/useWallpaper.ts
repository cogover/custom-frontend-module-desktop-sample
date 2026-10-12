import { useEffect, useSyncExternalStore } from 'react';
import { settingsApi, type SettingsApi } from './api';
import { WALLPAPER_EVENT } from './settingsConfig';
import { cachedWallpaper, currentWallpaper, showWallpaper, wallpaperUrl } from './wallpaper';

/**
 * Desktop start (CONTRACT §10): the wallpaper this browser showed last, at once, then mine from the server.
 * A failed read keeps what is shown (an expired session is reported by the windows).
 */
export function useStartWallpaper(api: SettingsApi = settingsApi) {
  useEffect(() => {
    void showWallpaper(cachedWallpaper(), { preload: false });
    let alive = true;
    api.getMySettings().then(
      s => {
        if (alive) void showWallpaper(s?.wallpaper ? wallpaperUrl(s.wallpaper) : null);
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [api]);
}

const subscribe = (onChange: () => void) => {
  window.addEventListener(WALLPAPER_EVENT, onChange);
  return () => window.removeEventListener(WALLPAPER_EVENT, onChange);
};

/** The custom wallpaper on screen (null = the default picture), kept up to date. */
export const useCurrentWallpaper = () => useSyncExternalStore(subscribe, currentWallpaper, () => null);
