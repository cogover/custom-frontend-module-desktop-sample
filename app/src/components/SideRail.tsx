import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useRef, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { SIDE_WIDTH } from '../config';
import { clampSideWidth } from '../hooks/useSideRail';

/** Hides / shows the left rail; sits at the end of the window buttons (in the rail, or in the top bar when hidden). */
export function SideToggle({ hidden, sideId, onToggle }: { hidden: boolean; sideId: string; onToggle: () => void }) {
  const label = hidden ? 'Hiện cột trái' : 'Ẩn cột trái';
  return (
    <button
      type="button"
      className="mini-btn side-toggle"
      data-testid="side-toggle"
      aria-controls={sideId}
      aria-expanded={!hidden}
      aria-keyshortcuts="Meta+Backslash Control+Backslash"
      aria-label={label}
      title={`${label} (⌘\\)`}
      onClick={onToggle}
    >
      {hidden ? <PanelLeftOpen size={16} strokeWidth={1.8} aria-hidden="true" /> : <PanelLeftClose size={16} strokeWidth={1.8} aria-hidden="true" />}
    </button>
  );
}

const STEP = 16;
const BIG_STEP = 48;

/**
 * The handle on the rail's right edge (in the board: the rail scrolls by itself). Dragging writes `--side-w`
 * straight on the board (no re-render per move) and saves once on release; ←/→ (Shift: bigger steps),
 * Home/End, double-click → default width.
 */
export function SideResizer({
  width,
  sideId,
  board,
  onWidth,
  defaultWidth = SIDE_WIDTH.def,
}: {
  width: number;
  sideId: string;
  board: RefObject<HTMLElement | null>;
  onWidth: (w: number, save?: boolean) => void;
  /** Width a double-click goes back to (each app has its own). */
  defaultWidth?: number;
}) {
  const drag = useRef<{ x: number; w: number; now: number } | null>(null);

  const show = (el: HTMLElement, w: number) => {
    board.current?.style.setProperty('--side-w', `${w}px`);
    el.setAttribute('aria-valuenow', String(w));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, w: width, now: width };
    board.current?.setAttribute('data-resizing', '');
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    d.now = clampSideWidth(d.w + e.clientX - d.x);
    show(e.currentTarget, d.now);
  };
  const end = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    board.current?.removeAttribute('data-resizing');
    onWidth(d.now, true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? BIG_STEP : STEP;
    let w: number;
    if (e.key === 'ArrowLeft') w = width - step;
    else if (e.key === 'ArrowRight') w = width + step;
    else if (e.key === 'Home') w = SIDE_WIDTH.min;
    else if (e.key === 'End') w = SIDE_WIDTH.max;
    else return;
    e.preventDefault();
    onWidth(w, true);
  };

  return (
    <div
      className="side-resizer"
      data-testid="side-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Đổi độ rộng cột trái"
      aria-controls={sideId}
      aria-valuemin={SIDE_WIDTH.min}
      aria-valuemax={SIDE_WIDTH.max}
      aria-valuenow={width}
      tabIndex={0}
      title="Kéo để đổi độ rộng · bấm đúp để về mặc định"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onDoubleClick={() => onWidth(defaultWidth, true)}
      onKeyDown={onKeyDown}
    />
  );
}
