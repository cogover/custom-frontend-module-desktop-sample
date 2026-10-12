import { Maximize2, Minimize2, Minus, X } from 'lucide-react';
import type { ReactNode } from 'react';

/** What the app window can ask the desktop (Desktop.tsx). */
export interface WindowApi {
  maximized: boolean;
  /** Minimised to the dock: the window stays mounted (state kept) but is not shown. */
  hidden: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onToggleMax: () => void;
}

/**
 * The three macOS buttons at the top-left of the window (close, minimise, full window) and, after them, the
 * left-rail toggle (`children`). Without a desktop (`win` missing) only the children show.
 */
export function WindowControls({ win, children }: { win?: WindowApi; children?: ReactNode }) {
  return (
    <div className="traffic" role="group" aria-label="Điều khiển cửa sổ">
      {win && <TrafficLights win={win} />}
      {children}
    </div>
  );
}

function TrafficLights({ win }: { win: WindowApi }) {
  const maxLabel = win.maximized ? 'Thu về cửa sổ' : 'Phóng to toàn màn hình';
  return (
    <>
      <button type="button" className="tl tl-close" aria-label="Đóng" title="Đóng" data-testid="win-close" onClick={win.onClose}>
        <X size={8} strokeWidth={3} aria-hidden="true" />
      </button>
      <button type="button" className="tl tl-min" aria-label="Thu nhỏ" title="Thu nhỏ" data-testid="win-minimize" onClick={win.onMinimize}>
        <Minus size={8} strokeWidth={3} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="tl tl-max"
        aria-label={maxLabel}
        aria-pressed={win.maximized}
        title={maxLabel}
        data-testid="win-maximize"
        onClick={win.onToggleMax}
      >
        {win.maximized ? <Minimize2 size={7} strokeWidth={3} aria-hidden="true" /> : <Maximize2 size={7} strokeWidth={3} aria-hidden="true" />}
      </button>
    </>
  );
}
