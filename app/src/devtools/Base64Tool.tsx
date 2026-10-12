import { ArrowLeftRight, Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '../lib/utils';
import { decodeBase64, encodeBase64 } from './base64';
import { CopyButton, Pane, Segmented, ToolButton, type ToolProps } from './parts';

type Mode = 'encode' | 'decode';
const MODES = [
  { value: 'encode', label: 'Mã hoá' },
  { value: 'decode', label: 'Giải mã' },
] as const;

/** Text ⇄ Base64 (UTF-8; URL-safe on request; decoding takes both alphabets, with or without padding). */
export function Base64Tool({ notify }: ToolProps) {
  const [mode, setMode] = useState<Mode>('encode');
  const [text, setText] = useState('');
  const [urlSafe, setUrlSafe] = useState(false);
  const result = useMemo(() => {
    if (!text) return { out: '', error: '' };
    try {
      return { out: mode === 'encode' ? encodeBase64(text, urlSafe) : decodeBase64(text), error: '' };
    } catch (e) {
      return { out: '', error: e instanceof Error ? e.message : String(e) };
    }
  }, [text, mode, urlSafe]);
  return (
    <>
      <div className="dt-bar">
        <Segmented value={mode} options={MODES} onChange={setMode} label="Chiều chuyển đổi" testId="base64-mode" />
        {mode === 'encode' && (
          <button type="button" role="checkbox" aria-checked={urlSafe} className="cols-toggle dt-check" data-testid="base64-urlsafe" onClick={() => setUrlSafe(v => !v)}>
            <span className={cn('flex size-4 shrink-0 items-center justify-center rounded-[4px] border', urlSafe ? 'border-primary bg-primary text-primary-foreground' : 'border-input')} aria-hidden="true">
              {urlSafe && <Check className="size-3" />}
            </span>
            URL-safe (-, _ và bỏ dấu =)
          </button>
        )}
      </div>
      <div className="dt-split">
        <Pane
          title={mode === 'encode' ? 'Văn bản' : 'Base64'}
          actions={
            <ToolButton testId="base64-clear" disabled={!text} onClick={() => setText('')}>
              Xoá
            </ToolButton>
          }
        >
          <textarea
            className="dt-input"
            data-testid="base64-input"
            aria-label={mode === 'encode' ? 'Văn bản cần mã hoá' : 'Base64 cần giải mã'}
            placeholder={mode === 'encode' ? 'Nhập văn bản cần mã hoá…' : 'Dán chuỗi Base64 cần giải mã…'}
            spellCheck={false}
            value={text}
            onChange={e => setText(e.target.value)}
          />
        </Pane>
        <Pane
          title={mode === 'encode' ? 'Base64' : 'Văn bản'}
          actions={
            <>
              <ToolButton
                testId="base64-swap"
                disabled={!result.out}
                onClick={() => {
                  setText(result.out);
                  setMode(mode === 'encode' ? 'decode' : 'encode');
                }}
              >
                <ArrowLeftRight size={14} strokeWidth={1.9} aria-hidden="true" />
                Đổi chiều
              </ToolButton>
              <CopyButton text={result.out} notify={notify} testId="base64-copy" />
            </>
          }
        >
          {result.error ? (
            <div className="dt-error" role="alert" data-testid="base64-error">
              <p className="dt-error-title">Không giải mã được</p>
              <p>{result.error}</p>
            </div>
          ) : result.out ? (
            <pre className="dt-code dt-wrap" data-testid="base64-output" tabIndex={0}>
              {result.out}
            </pre>
          ) : (
            <p className="dt-empty">Kết quả hiện ở đây.</p>
          )}
        </Pane>
      </div>
    </>
  );
}
