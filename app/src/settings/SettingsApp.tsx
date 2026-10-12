import { Image as ImageIcon, ImageUp, LoaderCircle, RotateCcw, Settings } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { errorMessage, isSessionExpired } from '../api/client';
import defaultWallpaper from '../assets/bg-default.webp';
import { LoadingState, SessionExpiredState } from '../components/StateBox';
import { Toast } from '../components/Toast';
import { SETTINGS_APP, useWindowUrl } from '../desktop/url';
import { WindowControls, type WindowApi } from '../desktop/WindowControls';
import { useToast } from '../hooks/useToast';
import { settingsApi, type SettingsApi } from './api';
import { SETTINGS_LOADING, WALLPAPER_ACCEPT, WALLPAPER_MAX_BYTES } from './settingsConfig';
import { useCurrentWallpaper } from './useWallpaper';
import { showWallpaper, wallpaperProblem, wallpaperUploadProblem, wallpaperUrl, type UserSettings } from './wallpaper';
import './settings.css';

export interface SettingsAppProps {
  api?: SettingsApi;
  /** Set when the settings run as a window of the desktop (Desktop.tsx). */
  win?: WindowApi;
}

type Load = 'loading' | 'ready' | 'error' | 'expired';

/**
 * "Cài đặt" — the settings app of the SPA (CONTRACT §10): my personal settings on object `user_settings`.
 * For now the desktop wallpaper: upload a picture (JPG / PNG / WebP, 20 MB) or go back to the default one.
 */
export default function SettingsApp({ api = settingsApi, win }: SettingsAppProps) {
  const hidden = Boolean(win?.hidden);
  const { toast, show: showToast, hide: hideToast } = useToast();
  const [load, setLoad] = useState<Load>('loading');
  const [loadError, setLoadError] = useState('');
  const [mine, setMine] = useState<UserSettings | null>(null);
  const [busy, setBusy] = useState<'upload' | 'reset' | null>(null);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const shown = useCurrentWallpaper();

  useWindowUrl(Boolean(win) && !hidden, SETTINGS_APP, '', '');

  const reload = useCallback(async () => {
    setLoad('loading');
    setLoadError('');
    try {
      const s = await api.getMySettings();
      setMine(s);
      setLoad('ready');
      // another tab or device may have changed it since the desktop started
      void showWallpaper(s?.wallpaper ? wallpaperUrl(s.wallpaper) : null);
    } catch (e) {
      if (isSessionExpired(e)) setLoad('expired');
      else {
        setLoadError(errorMessage(e));
        setLoad('error');
      }
    }
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const fail = (e: unknown, what: (msg: string) => string) => {
    if (isSessionExpired(e)) setLoad('expired');
    else setError(what(errorMessage(e)));
  };

  const choose = async (file: File | undefined) => {
    if (!file || busy || load !== 'ready') return;
    const problem = wallpaperProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    setBusy('upload');
    try {
      const picture = await api.uploadWallpaper(file).catch(e => {
        throw isSessionExpired(e) ? e : new Error(wallpaperUploadProblem(errorMessage(e)));
      });
      const id = await api.saveWallpaper(mine?.id ?? null, picture);
      setMine({ id: id ?? mine?.id ?? '', wallpaper: picture });
      await showWallpaper(wallpaperUrl(picture));
      showToast('Đã đổi ảnh nền');
    } catch (e) {
      fail(e, msg => `Không đổi được ảnh nền: ${msg}`);
    } finally {
      setBusy(null);
      if (input.current) input.current.value = '';
    }
  };

  const reset = async () => {
    if (!mine?.wallpaper || busy) return;
    setError('');
    setBusy('reset');
    try {
      await api.saveWallpaper(mine.id, null);
      setMine({ ...mine, wallpaper: null });
      await showWallpaper(null);
      showToast('Đã dùng lại ảnh nền mặc định');
    } catch (e) {
      fail(e, msg => `Không đổi được ảnh nền: ${msg}`);
    } finally {
      setBusy(null);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    void choose(e.dataTransfer.files[0]);
  };

  const ready = load === 'ready';
  const custom = mine?.wallpaper ?? null;
  const previewUrl = shown ?? defaultWallpaper;

  return (
    <>
      <div className="page settings-app" hidden={hidden} data-testid="settings-app">
        <main className="board settings-board">
          <aside className="side has-traffic settings-side">
            <WindowControls win={win} />
            <h1 className="brand">
              <span className="logo settings-logo">
                <Settings size={18} strokeWidth={2.2} aria-hidden="true" />
              </span>
              Cài đặt
            </h1>
            <nav className="quick" aria-label="Mục cài đặt">
              <button className="qf" type="button" aria-pressed="true" data-testid="settings-nav-wallpaper">
                <ImageIcon size={18} strokeWidth={1.8} aria-hidden="true" />
                Hình nền
              </button>
            </nav>
          </aside>

          <div className="content settings-content">
            <header className="topbar">
              <h2 className="settings-title">Hình nền Desktop</h2>
            </header>
            <div className="scroller">
              {load === 'expired' ? (
                <SessionExpiredState />
              ) : load === 'loading' ? (
                <LoadingState text={SETTINGS_LOADING} testId="settings-loading" />
              ) : (
                <section className="settings-pane" aria-label="Hình nền Desktop">
                  <p className="settings-lead">Ảnh phía sau các cửa sổ. Chỉ áp dụng cho tài khoản của bạn, trên mọi máy bạn đăng nhập.</p>
                  <div
                    className="wp-preview"
                    data-testid="wallpaper-preview"
                    data-drag={drag || undefined}
                    data-busy={busy === 'upload' || undefined}
                    style={{ backgroundImage: `url("${previewUrl}")` }}
                    onDragOver={e => {
                      if (!ready || busy) return;
                      e.preventDefault();
                      setDrag(true);
                    }}
                    onDragLeave={() => setDrag(false)}
                    onDrop={onDrop}
                  >
                    <span className="wp-name" data-testid="wallpaper-name">
                      {custom ? custom.fileName : 'Ảnh mặc định'}
                    </span>
                    {busy === 'upload' && (
                      <span className="wp-busy" role="status">
                        <LoaderCircle size={18} strokeWidth={2} aria-hidden="true" />
                        Đang tải ảnh lên…
                      </span>
                    )}
                  </div>

                  <div className="wp-actions">
                    <button
                      className="btn-primary"
                      type="button"
                      data-testid="wallpaper-choose"
                      disabled={!ready || busy !== null}
                      onClick={() => input.current?.click()}
                    >
                      <ImageUp size={16} strokeWidth={2} aria-hidden="true" />
                      Chọn ảnh…
                    </button>
                    <input
                      ref={input}
                      type="file"
                      accept={WALLPAPER_ACCEPT}
                      hidden
                      data-testid="wallpaper-input"
                      aria-label="Chọn ảnh nền"
                      onChange={e => void choose(e.target.files?.[0])}
                    />
                    <button
                      className="btn-ghost wp-reset"
                      type="button"
                      data-testid="wallpaper-reset"
                      disabled={!ready || busy !== null || !custom}
                      onClick={() => void reset()}
                    >
                      <RotateCcw size={15} strokeWidth={2} aria-hidden="true" />
                      {busy === 'reset' ? 'Đang đổi…' : 'Dùng ảnh mặc định'}
                    </button>
                  </div>
                  <p className="hint">
                    JPG, PNG hoặc WebP, tối đa {WALLPAPER_MAX_BYTES / 1024 / 1024} MB. Có thể kéo thả ảnh vào khung xem trước.
                  </p>

                  {load === 'error' && (
                    <p className="err" role="alert" data-testid="settings-load-error">
                      Không tải được thiết lập: {loadError}{' '}
                      <button type="button" className="link-btn" onClick={() => void reload()}>
                        Thử lại
                      </button>
                    </p>
                  )}
                  {error && (
                    <p className="err" role="alert" data-testid="wallpaper-error">
                      {error}
                    </p>
                  )}
                </section>
              )}
            </div>
          </div>
        </main>
      </div>
      <Toast toast={toast} onHide={hideToast} />
    </>
  );
}
