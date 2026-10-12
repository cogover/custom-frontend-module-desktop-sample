import { useEffect, useMemo, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { shortDateTime } from '../domain/dates';
import { highlightJson } from './json';
import { decodeJwt, JWT_ALGS, jwtState, jwtTimes, signJwt, verifyJwt, type JwtAlg, type JwtCheck } from './jwt';
import { CopyButton, Pane, Segmented, ToolButton, type ToolProps } from './parts';

type Mode = 'decode' | 'encode';
const MODES = [
  { value: 'decode', label: 'Giải mã' },
  { value: 'encode', label: 'Tạo token' },
] as const;

export const JWT_SAMPLE_PAYLOAD = '{\n  "sub": "user-1001",\n  "name": "Trần Minh An",\n  "role": "admin",\n  "iat": 1791000000,\n  "exp": 1893456000\n}';
const SAMPLE_SECRET = 'bi-mat-demo';

const STATE_TEXT = { expired: 'Đã hết hạn', early: 'Chưa có hiệu lực', active: 'Còn hiệu lực' } as const;
const CHECK_TEXT: Record<JwtCheck, string> = {
  valid: 'Chữ ký hợp lệ với secret này',
  invalid: 'Chữ ký không khớp secret này',
  unsupported: 'Thuật toán này không kiểm tra được bằng secret (chỉ hỗ trợ HS256 / HS384 / HS512)',
};

const pretty = (v: unknown) => highlightJson(JSON.stringify(v, null, 2));

function Decoder({ notify }: ToolProps) {
  const [token, setToken] = useState('');
  const [secret, setSecret] = useState('');
  const [check, setCheck] = useState<JwtCheck | null>(null);
  const decoded = useMemo(() => {
    if (!token.trim()) return null;
    try {
      return { ok: true as const, jwt: decodeJwt(token) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  }, [token]);
  const ok = decoded?.ok === true;

  useEffect(() => {
    setCheck(null);
    if (!ok || !secret) return;
    let live = true;
    verifyJwt(token, secret).then(
      c => live && setCheck(c),
      () => live && setCheck('unsupported'),
    );
    return () => {
      live = false;
    };
  }, [token, secret, ok]);

  const now = Date.now();
  const state = decoded?.ok ? jwtState(decoded.jwt.payload, now) : null;
  return (
    <div className="dt-split">
      <Pane
        title="Token"
        actions={
          <>
            <ToolButton
              testId="jwt-sample"
              onClick={() => {
                void signJwt(JSON.parse(JWT_SAMPLE_PAYLOAD), SAMPLE_SECRET).then(t => {
                  setToken(t);
                  setSecret(SAMPLE_SECRET);
                });
              }}
            >
              Ví dụ
            </ToolButton>
            <ToolButton testId="jwt-clear" disabled={!token} onClick={() => setToken('')}>
              Xoá
            </ToolButton>
          </>
        }
      >
        <div className="dt-stack">
          <textarea
            className="dt-input dt-wrap"
            data-testid="jwt-input"
            aria-label="JWT cần giải mã"
            placeholder="Dán JWT vào đây: eyJhbGciOi…"
            spellCheck={false}
            value={token}
            onChange={e => setToken(e.target.value)}
          />
          <label className="dt-field">
            <span>Secret để kiểm tra chữ ký (không bắt buộc)</span>
            <input className="input dt-secret" data-testid="jwt-secret" spellCheck={false} autoComplete="off" value={secret} onChange={e => setSecret(e.target.value)} />
          </label>
        </div>
      </Pane>
      <Pane title="Nội dung" actions={<CopyButton text={decoded?.ok ? JSON.stringify(decoded.jwt.payload, null, 2) : ''} notify={notify} testId="jwt-copy-payload" label="Sao chép payload" />}>
        {decoded === null ? (
          <p className="dt-empty">Header và payload hiện ở đây khi bạn dán token bên trái. Token chỉ được xử lý trong trình duyệt, không gửi đi đâu.</p>
        ) : !decoded.ok ? (
          <div className="dt-error" role="alert" data-testid="jwt-error">
            <p className="dt-error-title">Token không hợp lệ</p>
            <p>{decoded.error}</p>
          </div>
        ) : (
          <div className="dt-stack dt-scroll" data-testid="jwt-decoded">
            <div className="dt-badges">
              {state && (
                <span className="dt-badge" data-tone={state === 'active' ? 'ok' : 'bad'} data-testid="jwt-state">
                  {STATE_TEXT[state]}
                </span>
              )}
              <span className="dt-badge" data-tone={check === 'valid' ? 'ok' : check === 'invalid' ? 'bad' : undefined} data-testid="jwt-check" data-check={check ?? 'none'}>
                {check ? CHECK_TEXT[check] : 'Nhập secret để kiểm tra chữ ký'}
              </span>
            </div>
            <h4 className="dt-sub">Header</h4>
            <pre className="dt-code dt-auto" data-testid="jwt-header" dangerouslySetInnerHTML={{ __html: pretty(decoded.jwt.header) }} />
            <h4 className="dt-sub">Payload</h4>
            <pre className="dt-code dt-auto" data-testid="jwt-payload" dangerouslySetInnerHTML={{ __html: pretty(decoded.jwt.payload) }} />
            {jwtTimes(decoded.jwt.payload).length > 0 && (
              <ul className="dt-times" data-testid="jwt-times">
                {jwtTimes(decoded.jwt.payload).map(t => (
                  <li key={t.claim}>
                    <span className="muted">
                      {t.label} (<code>{t.claim}</code>)
                    </span>{' '}
                    {shortDateTime(t.at)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Pane>
    </div>
  );
}

function Encoder({ notify }: ToolProps) {
  const [payload, setPayload] = useState(JWT_SAMPLE_PAYLOAD);
  const [secret, setSecret] = useState('');
  const [alg, setAlg] = useState<JwtAlg>('HS256');
  const [token, setToken] = useState('');
  const parsed = useMemo(() => {
    try {
      return { ok: true as const, value: JSON.parse(payload) as unknown };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  }, [payload]);

  useEffect(() => {
    setToken('');
    if (!parsed.ok || !secret) return;
    let live = true;
    signJwt(parsed.value, secret, alg).then(
      t => live && setToken(t),
      () => live && setToken(''),
    );
    return () => {
      live = false;
    };
  }, [parsed, secret, alg]);

  const [h, p, s] = token.split('.');
  return (
    <div className="dt-split">
      <Pane title="Payload (JSON)">
        <div className="dt-stack">
          <textarea className="dt-input" data-testid="jwt-payload-input" aria-label="Payload JSON" spellCheck={false} value={payload} onChange={e => setPayload(e.target.value)} />
          <div className="dt-row">
            <label className="dt-field dt-grow">
              <span>Secret</span>
              <input className="input dt-secret" data-testid="jwt-sign-secret" spellCheck={false} autoComplete="off" value={secret} onChange={e => setSecret(e.target.value)} />
            </label>
            <div className="dt-field">
              <span id="jwt-alg-label">Thuật toán</span>
              <Select value={alg} onValueChange={v => v && setAlg(v as JwtAlg)}>
                <SelectTrigger className="dt-select" data-testid="jwt-alg" data-value={alg} aria-labelledby="jwt-alg-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {JWT_ALGS.map(a => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </Pane>
      <Pane title="Token" actions={<CopyButton text={token} notify={notify} testId="jwt-copy-token" />}>
        {!parsed.ok ? (
          <div className="dt-error" role="alert" data-testid="jwt-encode-error">
            <p className="dt-error-title">Payload không phải JSON hợp lệ</p>
            <p>{parsed.error}</p>
          </div>
        ) : token ? (
          <pre className="dt-code dt-wrap" data-testid="jwt-token" tabIndex={0}>
            <span className="j-key">{h}</span>.<span className="j-str">{p}</span>.<span className="j-num">{s}</span>
          </pre>
        ) : (
          <p className="dt-empty">Nhập secret để ký token ({alg}).</p>
        )}
      </Pane>
    </div>
  );
}

/** Decode any JWT (header, payload, time claims, signature check with a shared secret) or sign a new one. */
export function JwtTool({ notify }: ToolProps) {
  const [mode, setMode] = useState<Mode>('decode');
  return (
    <>
      <div className="dt-bar">
        <Segmented value={mode} options={MODES} onChange={setMode} label="Chế độ JWT" testId="jwt-mode" />
      </div>
      {/* both stay mounted so switching back keeps what was typed */}
      <div className="dt-mode" hidden={mode !== 'decode'}>
        <Decoder notify={notify} />
      </div>
      <div className="dt-mode" hidden={mode !== 'encode'}>
        <Encoder notify={notify} />
      </div>
    </>
  );
}
