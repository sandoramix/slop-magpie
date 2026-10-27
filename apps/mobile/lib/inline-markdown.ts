/** A run of text with the formatting it carries. */
export type InlineSegment = { text: string; bold?: true; italic?: true; code?: true; href?: string };

// `code`, **bold**, *italic*, [label](https://link); one level, which is all the changelog uses
const TOKEN = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

/** Splits one line of Markdown into formatted runs, so the app can show `**bold**` and `code` instead of the marks. */
export function parseInline(source: string): InlineSegment[] {
  const out: InlineSegment[] = [];
  let last = 0;
  for (const m of source.matchAll(TOKEN)) {
    if (m.index > last) out.push({ text: source.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ text: m[1], code: true });
    else if (m[2] !== undefined) out.push({ text: m[2], bold: true });
    else if (m[3] !== undefined) out.push({ text: m[3], italic: true });
    else if (m[4] !== undefined && m[5] !== undefined) out.push({ text: m[4], href: m[5] });
    last = m.index + m[0].length;
  }
  if (last < source.length) out.push({ text: source.slice(last) });
  return out;
}
