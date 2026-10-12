/**
 * "@" in a note (CONTRACT §5.3f): typing "@" and part of a name or e-mail lists people (avatar, name, e-mail);
 * picking one inserts a mention that is saved as the span Cogover's editor writes, so the backend notifies
 * that person. Lives in the editor chunk.
 */
import { PlateElement, createPlatePlugin, useEditorRef, useEditorSelector, useFocused, useSelected, type PlateEditor, type PlateElementProps } from 'platejs/react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { errorMessage } from '../api/client';
import { Avatar } from '../components/Person';
import { Popover, PopoverAnchor, PopoverContent } from '../components/ui/popover';
import { MENTION_DEBOUNCE_MS } from '../config';
import { mentionQueryAt, type MentionCandidate, type MentionSource } from '../domain/mentions';
import { personName } from '../domain/people';
import type { RteMention } from './html';

function MentionElement(props: PlateElementProps) {
  const el = props.element as unknown as RteMention;
  const selected = useSelected();
  const focused = useFocused();
  return (
    <PlateElement {...props} as="span" className="rte-mention" attributes={{ ...props.attributes, 'data-person-id': el.personId } as never}>
      <span contentEditable={false} data-selected={selected && focused ? 'true' : undefined}>
        @{el.name}
      </span>
      {props.children}
    </PlateElement>
  );
}

/** The mention node: inline and void (deleted as a whole, the caret never goes inside). */
export const MentionPlugin = createPlatePlugin({
  key: 'mention',
  node: { isElement: true, isInline: true, isVoid: true, component: MentionElement },
});

interface Trigger {
  path: number[];
  /** Offset of "@" in the caret's text node. */
  at: number;
  /** The caret. */
  end: number;
  query: string;
}

/** "@…" right before a collapsed caret, as a string (cheap to compare on every editor change); '' when none. */
function triggerSignature(editor: PlateEditor): string {
  const sel = editor.selection;
  if (!sel || !editor.api.isCollapsed()) return '';
  const entry = editor.api.node(sel.anchor.path);
  const text = (entry?.[0] as { text?: unknown } | undefined)?.text;
  if (typeof text !== 'string') return '';
  const found = mentionQueryAt(text.slice(0, sel.anchor.offset));
  return found ? JSON.stringify([sel.anchor.path, found.at, sel.anchor.offset, found.query]) : '';
}

function parseTrigger(sig: string): Trigger | null {
  if (!sig) return null;
  const [path, at, end, query] = JSON.parse(sig) as [number[], number, number, string];
  return { path, at, end, query };
}

const rangeOf = (t: Trigger) => ({ anchor: { path: t.path, offset: t.at }, focus: { path: t.path, offset: t.end } });

export interface MentionKeys {
  /** Arrow / Enter / Tab while the list is open; true = handled (the editor must not act on it). */
  onKeyDown: (e: KeyboardEvent) => boolean;
}

/**
 * The people list under "@…". Keys come from the editor (`keys`), the caret never leaves it; Esc or a click
 * elsewhere closes the list until another "@" is typed.
 */
export function MentionCombobox({ source, keys }: { source: MentionSource; keys: { current: MentionKeys | null } }) {
  const editor = useEditorRef();
  const sig = useEditorSelector(triggerSignature, []);
  const trigger = useMemo(() => parseTrigger(sig), [sig]);
  const spot = trigger ? `${trigger.path.join('.')}:${trigger.at}` : '';
  const [dismissed, setDismissed] = useState('');
  const [results, setResults] = useState<MentionCandidate[]>([]);
  const [searched, setSearched] = useState<string | null>(null); // the query `results` answer
  const [error, setError] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const latest = useRef({ trigger, results, active, source });
  latest.current = { trigger, results, active, source };

  const query = trigger?.query ?? '';
  const loading = !!trigger && searched !== query && !error;
  // a name of several words that matches nobody: the "@" was not meant as a mention
  const pastIt = !loading && results.length === 0 && /\s/.test(query);
  const open = !!trigger && spot !== dismissed && !pastIt;

  useEffect(() => {
    if (!trigger || spot === dismissed) return;
    const ctl = new AbortController();
    const timer = window.setTimeout(() => {
      latest.current.source.search(query, ctl.signal).then(
        list => {
          if (ctl.signal.aborted) return;
          setResults(list);
          setSearched(query);
          setError('');
          setActive(0);
        },
        e => {
          if (ctl.signal.aborted || (e as Error)?.name === 'AbortError') return;
          setResults([]);
          setSearched(query);
          setError(errorMessage(e));
        },
      );
    }, MENTION_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
    // `trigger` itself changes with every keystroke; the search only depends on where "@" is and what follows it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot, query, dismissed]);

  // a new "@" (another spot) starts with a fresh list; once the "@…" is gone, Esc no longer applies
  useEffect(() => {
    setError('');
    setSearched(null);
    setResults([]);
    if (!spot) setDismissed('');
  }, [spot]);

  const choose = (c: MentionCandidate) => {
    const t = latest.current.trigger;
    if (!t) return;
    const node: RteMention = {
      type: 'mention',
      personId: c.person.id,
      name: personName(c.person) || c.email || c.person.id,
      ...latest.current.source.context,
      children: [{ text: '' }],
    };
    editor.tf.select(rangeOf(t));
    editor.tf.insertNodes(node as never);
    editor.tf.move({ unit: 'offset' });
    editor.tf.insertText(' ');
    editor.tf.focus();
  };

  keys.current = {
    onKeyDown: e => {
      if (!open) return false;
      const { results: list, active: at } = latest.current;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!list.length) return false;
        setActive((at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length);
        return true;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && list[at]) {
        choose(list[at]);
        return true;
      }
      return false;
    },
  };

  // the editing area announces the list (combobox pattern on the contenteditable)
  useEffect(() => {
    let el: HTMLElement | undefined;
    try {
      el = editor.api.toDOMNode(editor as never);
    } catch {
      el = undefined;
    }
    if (!el) return;
    if (open) {
      el.setAttribute('aria-expanded', 'true');
      el.setAttribute('aria-controls', listId);
      if (results[active]) el.setAttribute('aria-activedescendant', `${listId}-${active}`);
      else el.removeAttribute('aria-activedescendant');
    } else {
      el.removeAttribute('aria-expanded');
      el.removeAttribute('aria-controls');
      el.removeAttribute('aria-activedescendant');
    }
  }, [editor, open, listId, active, results]);

  // the list hangs under the "@…" being typed (falls back to the editing area when the browser cannot tell)
  const anchor = useRef({
    getBoundingClientRect: (): DOMRect => {
      const t = latest.current.trigger;
      try {
        const rect = t ? editor.api.toDOMRange(rangeOf(t))?.getBoundingClientRect() : undefined;
        if (rect && (rect.width || rect.height || rect.x || rect.y)) return rect;
      } catch {
        /* no layout (tests) or the text just changed */
      }
      try {
        return editor.api.toDOMNode(editor as never)?.getBoundingClientRect() ?? new DOMRect();
      } catch {
        return new DOMRect();
      }
    },
  });

  const dismiss = () => setDismissed(spot);

  return (
    <Popover open={open} onOpenChange={o => !o && dismiss()}>
      <PopoverAnchor virtualRef={anchor} />
      {open && (
        <PopoverContent
          className="mention-pop w-80 p-1"
          align="start"
          side="bottom"
          sideOffset={6}
          data-testid="mention-popover"
          onOpenAutoFocus={e => e.preventDefault()}
          onCloseAutoFocus={e => e.preventDefault()}
          onEscapeKeyDown={e => {
            e.preventDefault(); // only the list closes, not the task popup
            dismiss();
          }}
          onInteractOutside={e => {
            // a click in the editing area just moves the caret: the list follows it
            let el: HTMLElement | undefined;
            try {
              el = editor.api.toDOMNode(editor as never);
            } catch {
              el = undefined;
            }
            if (el && e.target instanceof Node && el.contains(e.target)) e.preventDefault();
          }}
        >
          <div role="listbox" id={listId} aria-label="Nhắc đến nhân sự" data-testid="mention-list">
            {results.map((c, i) => (
              <div
                key={c.person.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className="mention-opt"
                data-testid="mention-option"
                data-person-id={c.person.id}
                // keep the caret in the editor
                onMouseDown={e => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(c)}
              >
                <Avatar person={c.person} />
                <span className="mention-text">
                  <span className="mention-name">{personName(c.person) || c.person.id}</span>
                  {c.email && <span className="mention-email">{c.email}</span>}
                </span>
              </div>
            ))}
            {results.length === 0 && (
              <p className="mention-note" role="status" data-testid={loading ? 'mention-loading' : error ? 'mention-error' : 'mention-empty'}>
                {loading ? 'Đang tìm…' : error ? `Không tìm được nhân sự: ${error}` : 'Không tìm thấy nhân sự'}
              </p>
            )}
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}
