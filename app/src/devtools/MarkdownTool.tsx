import { useMemo, useState } from 'react';
import { sanitizeDescription } from '../domain/sanitize';
import { markdownToHtml } from '../notes/markdown';
import { CopyButton, Pane, ToolButton, type ToolProps } from './parts';
import '../notes/notes.css'; // the `.prose` reading styles of the notes

export const MARKDOWN_SAMPLE = `# Ghi chú phát hành

Bản **v20** có _ba_ thay đổi chính:

1. Lọc theo người trên chip
2. Màn hình nhỏ tràn viền
3. App \`Dev tools\`

> Nhớ chạy test trước khi publish.

| Hạng mục | Trạng thái |
| --- | --- |
| Unit test | ✅ |
| E2E | ✅ |

\`\`\`json
{ "ok": true }
\`\`\`
`;

/** Markdown on the left; the readable page on the right (GitHub-flavoured: tables, code, task lists). */
export function MarkdownTool({ notify }: ToolProps) {
  const [text, setText] = useState('');
  const html = useMemo(() => (text.trim() ? sanitizeDescription(markdownToHtml(text)) : ''), [text]);
  return (
    <div className="dt-split">
      <Pane
        title="Markdown"
        actions={
          <>
            <ToolButton testId="markdown-sample" onClick={() => setText(MARKDOWN_SAMPLE)}>
              Ví dụ
            </ToolButton>
            <ToolButton testId="markdown-clear" disabled={!text} onClick={() => setText('')}>
              Xoá
            </ToolButton>
          </>
        }
      >
        <textarea
          className="dt-input"
          data-testid="markdown-input"
          aria-label="Markdown"
          placeholder={'# Tiêu đề\n\nViết **Markdown** ở đây…'}
          spellCheck={false}
          value={text}
          onChange={e => setText(e.target.value)}
        />
      </Pane>
      <Pane title="Xem trước" actions={<CopyButton text={html} notify={notify} testId="markdown-copy" label="Sao chép HTML" />}>
        {html ? (
          // sanitised (DOMPurify): no scripts, event handlers or inline styles
          <div className="dt-preview v-html prose" data-testid="markdown-output" tabIndex={0} dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <p className="dt-empty">Bản xem trước hiện ở đây khi bạn viết Markdown bên trái.</p>
        )}
      </Pane>
    </div>
  );
}
