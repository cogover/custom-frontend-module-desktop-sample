import { Wrench } from 'lucide-react';
import { useId, useRef, useState, type CSSProperties } from 'react';
import { SideResizer, SideToggle } from '../components/SideRail';
import { Toast } from '../components/Toast';
import { DEVTOOLS_APP, useWindowUrl } from '../desktop/url';
import { WindowControls, type WindowApi } from '../desktop/WindowControls';
import { readStorage, writeStorage } from '../domain/storage';
import { useSideRail } from '../hooks/useSideRail';
import { useToast } from '../hooks/useToast';
import { Base64Tool } from './Base64Tool';
import { DEVTOOLS_SIDE_DEFAULT, DEVTOOLS_SIDE_KEY, DEVTOOLS_STORAGE_KEY, TOOLS, type ToolId } from './devtoolsConfig';
import { JsonTool } from './JsonTool';
import { JwtTool } from './JwtTool';
import { MarkdownTool } from './MarkdownTool';
import './devtools.css';

export interface DevToolsAppProps {
  /** Set when the tools run as a window of the desktop (Desktop.tsx). */
  win?: WindowApi;
}

const loadTool = (): ToolId => {
  const saved = readStorage(DEVTOOLS_STORAGE_KEY);
  return TOOLS.some(t => t.id === saved) ? (saved as ToolId) : 'json';
};

/**
 * "Dev tools" — small tools for developers, all in the browser (nothing is sent anywhere, nothing typed is saved):
 * JSON formatter, Markdown preview, JWT decoder / encoder, Base64 decoder / encoder.
 */
export default function DevToolsApp({ win }: DevToolsAppProps) {
  const hidden = Boolean(win?.hidden);
  const { toast, show: showToast, hide: hideToast } = useToast();
  const [tool, setToolState] = useState<ToolId>(loadTool);
  const setTool = (id: ToolId) => {
    setToolState(id);
    writeStorage(DEVTOOLS_STORAGE_KEY, id);
  };
  useWindowUrl(Boolean(win) && !hidden, DEVTOOLS_APP, '', '');
  const current = TOOLS.find(t => t.id === tool)!;
  // the left rail: hide / show (button or ⌘\) and drag its width, like the other windows
  const rail = useSideRail(!hidden, { storageKey: DEVTOOLS_SIDE_KEY, defaultWidth: DEVTOOLS_SIDE_DEFAULT });
  const sideId = useId();
  const boardRef = useRef<HTMLElement>(null);
  const titleControls = (
    <WindowControls win={win}>
      <SideToggle hidden={rail.hidden} sideId={sideId} onToggle={rail.toggle} />
    </WindowControls>
  );

  return (
    <>
      <div className="page devtools-app" hidden={hidden} data-testid="devtools-app">
        <main className="board devtools-board" ref={boardRef} data-side={rail.hidden ? 'hidden' : undefined} style={{ '--side-w': `${rail.width}px` } as CSSProperties}>
          {!rail.hidden && (
            <aside className="side has-traffic devtools-side" id={sideId}>
              {titleControls}
              <h1 className="brand">
                <span className="logo devtools-logo">
                  <Wrench size={18} strokeWidth={2.2} aria-hidden="true" />
                </span>
                Dev tools
              </h1>
              <nav className="quick" aria-label="Công cụ">
                {TOOLS.map(t => (
                  <button key={t.id} className="qf" type="button" aria-pressed={t.id === tool} data-testid={`devtools-nav-${t.id}`} onClick={() => setTool(t.id)}>
                    <t.icon size={18} strokeWidth={1.8} aria-hidden="true" />
                    {t.name}
                  </button>
                ))}
              </nav>
            </aside>
          )}
          {!rail.hidden && rail.desktop && (
            <SideResizer width={rail.width} sideId={sideId} board={boardRef} onWidth={rail.setWidth} defaultWidth={rail.defaultWidth} />
          )}

          <div className="content devtools-content">
            <header className="topbar">
              {rail.hidden && <div className="title-ctl">{titleControls}</div>}
              <h2 className="devtools-title" data-testid="devtools-title">
                {current.title}
              </h2>
              {/* rail hidden: the tools stay one click away */}
              {rail.hidden && (
                <nav className="dt-tabs" aria-label="Công cụ">
                  {TOOLS.map(t => (
                    <button key={t.id} type="button" className="dt-tab" aria-pressed={t.id === tool} data-testid={`devtools-tab-${t.id}`} onClick={() => setTool(t.id)}>
                      <t.icon size={15} strokeWidth={1.8} aria-hidden="true" />
                      {t.name}
                    </button>
                  ))}
                </nav>
              )}
            </header>
            <div className="scroller">
              {/* every tool stays mounted: switching tools keeps what was typed in each */}
              {TOOLS.map(t => (
                <div key={t.id} className="dt-tool" hidden={t.id !== tool} data-testid={`devtools-tool-${t.id}`}>
                  {t.id === 'json' && <JsonTool notify={showToast} />}
                  {t.id === 'markdown' && <MarkdownTool notify={showToast} />}
                  {t.id === 'jwt' && <JwtTool notify={showToast} />}
                  {t.id === 'base64' && <Base64Tool notify={showToast} />}
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
      <Toast toast={toast} onHide={hideToast} />
    </>
  );
}
