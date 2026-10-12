import type { ReactNode } from 'react';
import type { DockApp } from './apps';

interface DockProps {
  apps: DockApp[];
  /** Apps with an open or minimised window: a dot is drawn beside their icon. */
  running: readonly string[];
  onOpen: (app: DockApp) => void;
}

/** The app bar on the left edge (bottom edge on phones), like the macOS dock. */
export function Dock({ apps, running, onOpen }: DockProps) {
  return (
    <nav className="dock" aria-label="Ứng dụng" data-testid="dock">
      <ul>
        {apps.map(app => {
          const isRunning = running.includes(app.id);
          const img = typeof app.icon === 'object' && app.icon !== null && 'src' in app.icon ? app.icon.src : null;
          return (
            <li key={app.id}>
              <button
                type="button"
                className="dock-item"
                aria-label={app.name}
                data-testid={`dock-app-${app.id}`}
                data-running={isRunning || undefined}
                onClick={() => onOpen(app)}
              >
                <span className="dock-icon" style={img ? undefined : { background: app.background }} aria-hidden="true">
                  {img ? <img src={img} alt="" /> : (app.icon as ReactNode)}
                </span>
                <span className="dock-label" aria-hidden="true">
                  {app.name}
                </span>
                {isRunning && <span className="dock-dot" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
