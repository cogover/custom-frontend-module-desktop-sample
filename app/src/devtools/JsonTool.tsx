import { useMemo, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { formatJson, type JsonIndent } from './json';
import { CopyButton, Pane, ToolButton, type ToolProps } from './parts';

const INDENTS: { value: JsonIndent; label: string }[] = [
  { value: '4', label: 'Thụt 4 dấu cách' },
  { value: '2', label: 'Thụt 2 dấu cách' },
  { value: 'tab', label: 'Thụt bằng Tab' },
  { value: 'min', label: 'Thu gọn một dòng' },
];

export const JSON_SAMPLE = '{"id":"TAS-1005","subject":"Phỏng vấn ứng viên","done":false,"priority":2,"assignee":{"name":"Trần Minh An","email":null},"tags":["hr","q4"]}';

/** Raw JSON on the left; formatted and coloured on the right (or where the JSON breaks). */
export function JsonTool({ notify }: ToolProps) {
  const [text, setText] = useState('');
  const [indent, setIndent] = useState<JsonIndent>('4');
  const result = useMemo(() => (text.trim() ? formatJson(text, indent) : null), [text, indent]);
  return (
    <div className="dt-split">
      <Pane
        title="JSON gốc"
        actions={
          <>
            <ToolButton testId="json-sample" onClick={() => setText(JSON_SAMPLE)}>
              Ví dụ
            </ToolButton>
            <ToolButton testId="json-clear" disabled={!text} onClick={() => setText('')}>
              Xoá
            </ToolButton>
          </>
        }
      >
        <textarea
          className="dt-input"
          data-testid="json-input"
          aria-label="JSON gốc"
          placeholder={'Dán JSON vào đây, ví dụ {"a":1,"b":[true,null]}'}
          spellCheck={false}
          value={text}
          onChange={e => setText(e.target.value)}
        />
      </Pane>
      <Pane
        title="Đã định dạng"
        actions={
          <>
            <Select value={indent} onValueChange={v => v && setIndent(v as JsonIndent)}>
              <SelectTrigger className="dt-select" data-testid="json-indent" data-value={indent} aria-label="Kiểu thụt lề">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INDENTS.map(i => (
                  <SelectItem key={i.value} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <CopyButton text={result?.ok ? result.text : ''} notify={notify} testId="json-copy" />
          </>
        }
      >
        {result === null ? (
          <p className="dt-empty">Kết quả hiện ở đây khi bạn nhập JSON bên trái.</p>
        ) : result.ok ? (
          <pre className="dt-code" data-testid="json-output" tabIndex={0} dangerouslySetInnerHTML={{ __html: result.html }} />
        ) : (
          <div className="dt-error" role="alert" data-testid="json-error">
            <p className="dt-error-title">
              JSON không hợp lệ{result.line !== null ? ` (dòng ${result.line}, cột ${result.column})` : ''}
            </p>
            <p>{result.error}</p>
          </div>
        )}
      </Pane>
    </div>
  );
}
