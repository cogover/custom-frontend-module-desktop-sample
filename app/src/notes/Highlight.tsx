import { fold } from '../domain/text';

/** `text` with the part matching `query` (already folded: no accents, lower case) in a <mark>. */
export function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  let folded = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    for (const ch of fold(text[i])) {
      folded += ch;
      map.push(i);
    }
  }
  const at = folded.indexOf(query);
  if (at < 0) return <>{text}</>;
  const start = map[at];
  const end = map[at + query.length - 1] + 1;
  return (
    <>
      {text.slice(0, start)}
      <mark>{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}
