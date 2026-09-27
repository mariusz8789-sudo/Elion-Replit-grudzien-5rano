/**
 * markdown — a tiny, dependency-free Markdown→AST parser for the AI chat (V6).
 *
 * Why not a library: the app is an offline PWA under a strict no-CDN policy, and
 * we render into React elements (never dangerouslySetInnerHTML) so untrusted model
 * output cannot inject HTML. Supports the subset scientific answers actually use:
 * headings, bold/italic, inline code, fenced code blocks, ordered/unordered lists,
 * blockquotes, tables (GFM pipe), and links. Deterministic and unit-tested.
 */
export type Inline =
  | { t: 'text'; v: string }
  | { t: 'bold'; v: string }
  | { t: 'italic'; v: string }
  | { t: 'code'; v: string }
  | { t: 'link'; v: string; href: string };

export type Block =
  | { t: 'heading'; level: number; text: Inline[] }
  | { t: 'paragraph'; text: Inline[] }
  | { t: 'code'; lang: string; code: string }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'ol'; items: Inline[][] }
  | { t: 'quote'; text: Inline[] }
  | { t: 'table'; header: Inline[][]; rows: Inline[][][] };

/** Parse inline markdown (bold, italic, code, links) into spans. */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  const pushText = (s: string) => { if (s) out.push({ t: 'text', v: s }); };
  let buf = '';
  while (i < src.length) {
    const rest = src.slice(i);
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^`([^`]+)`/))) { pushText(buf); buf = ''; out.push({ t: 'code', v: m[1] }); i += m[0].length; continue; }
    if ((m = rest.match(/^\*\*([^*]+)\*\*/))) { pushText(buf); buf = ''; out.push({ t: 'bold', v: m[1] }); i += m[0].length; continue; }
    if ((m = rest.match(/^__([^_]+)__/))) { pushText(buf); buf = ''; out.push({ t: 'bold', v: m[1] }); i += m[0].length; continue; }
    if ((m = rest.match(/^\*([^*]+)\*/))) { pushText(buf); buf = ''; out.push({ t: 'italic', v: m[1] }); i += m[0].length; continue; }
    if ((m = rest.match(/^\[([^\]]+)\]\(([^)\s]+)\)/))) { pushText(buf); buf = ''; out.push({ t: 'link', v: m[1], href: m[2] }); i += m[0].length; continue; }
    buf += src[i]; i += 1;
  }
  pushText(buf);
  return out;
}

const splitRow = (line: string): string[] => line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

/** Parse a full markdown document into blocks. */
export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }

    // Fenced code block.
    const fence = line.match(/^```(\w*)/);
    if (fence) {
      const lang = fence[1] || '';
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) { code.push(lines[i]); i += 1; }
      i += 1; // closing fence
      blocks.push({ t: 'code', lang, code: code.join('\n') });
      continue;
    }
    // Heading.
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { blocks.push({ t: 'heading', level: h[1].length, text: parseInline(h[2]) }); i += 1; continue; }
    // Table (needs a separator row of dashes).
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:-]*-[-\s:|]*\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const header = splitRow(line).map(parseInline);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { rows.push(splitRow(lines[i]).map(parseInline)); i += 1; }
      blocks.push({ t: 'table', header, rows });
      continue;
    }
    // Blockquote.
    if (line.startsWith('>')) { blocks.push({ t: 'quote', text: parseInline(line.replace(/^>\s?/, '')) }); i += 1; continue; }
    // Ordered list.
    if (/^\d+\.\s+/.test(line)) {
      const items: Inline[][] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { items.push(parseInline(lines[i].replace(/^\d+\.\s+/, ''))); i += 1; }
      blocks.push({ t: 'ol', items });
      continue;
    }
    // Unordered list.
    if (/^[-*+]\s+/.test(line)) {
      const items: Inline[][] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) { items.push(parseInline(lines[i].replace(/^[-*+]\s+/, ''))); i += 1; }
      blocks.push({ t: 'ul', items });
      continue;
    }
    // Paragraph (gather consecutive non-blank, non-special lines).
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|[-*+]\s|\d+\.\s)/.test(lines[i]) && !lines[i].includes('|')) { para.push(lines[i]); i += 1; }
    if (para.length) { blocks.push({ t: 'paragraph', text: parseInline(para.join(' ')) }); continue; }
    // Fallback: a line with a pipe but no table → treat as paragraph.
    blocks.push({ t: 'paragraph', text: parseInline(line) });
    i += 1;
  }
  return blocks;
}
