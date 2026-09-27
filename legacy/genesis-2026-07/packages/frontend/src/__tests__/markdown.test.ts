/**
 * markdown (V6 AI chat) — parser unit tests. No DOM; asserts the block/inline AST
 * so the React renderer can stay a thin, safe mapping.
 */
import { describe, expect, it } from 'vitest';
import { parseMarkdown, parseInline } from '../core/markdown';

describe('parseInline', () => {
  it('parses bold, italic, code and links', () => {
    expect(parseInline('a **b** c')).toEqual([{ t: 'text', v: 'a ' }, { t: 'bold', v: 'b' }, { t: 'text', v: ' c' }]);
    expect(parseInline('`x`')).toEqual([{ t: 'code', v: 'x' }]);
    expect(parseInline('*i*')).toEqual([{ t: 'italic', v: 'i' }]);
    expect(parseInline('[t](http://u)')).toEqual([{ t: 'link', v: 't', href: 'http://u' }]);
  });
  it('leaves plain text intact', () => {
    expect(parseInline('just text')).toEqual([{ t: 'text', v: 'just text' }]);
  });
});

describe('parseMarkdown', () => {
  it('parses headings with levels', () => {
    const b = parseMarkdown('# H1\n### H3');
    expect(b[0]).toMatchObject({ t: 'heading', level: 1 });
    expect(b[1]).toMatchObject({ t: 'heading', level: 3 });
  });
  it('parses fenced code blocks with language', () => {
    const b = parseMarkdown('```python\nprint(1)\n```');
    expect(b[0]).toEqual({ t: 'code', lang: 'python', code: 'print(1)' });
  });
  it('parses unordered and ordered lists', () => {
    const ul = parseMarkdown('- a\n- b');
    expect(ul[0]).toMatchObject({ t: 'ul' });
    expect((ul[0] as { items: unknown[] }).items.length).toBe(2);
    const ol = parseMarkdown('1. one\n2. two');
    expect(ol[0]).toMatchObject({ t: 'ol' });
  });
  it('parses a GFM pipe table', () => {
    const b = parseMarkdown('| A | B |\n| - | - |\n| 1 | 2 |');
    expect(b[0]).toMatchObject({ t: 'table' });
    const tbl = b[0] as { header: unknown[]; rows: unknown[] };
    expect(tbl.header.length).toBe(2);
    expect(tbl.rows.length).toBe(1);
  });
  it('parses blockquotes', () => {
    expect(parseMarkdown('> quoted')[0]).toMatchObject({ t: 'quote' });
  });
  it('groups plain lines into a paragraph', () => {
    const b = parseMarkdown('line one\nline two');
    expect(b.length).toBe(1);
    expect(b[0]).toMatchObject({ t: 'paragraph' });
  });
  it('handles a mixed document deterministically', () => {
    const md = '# Title\n\nSome **bold** text.\n\n```js\nx\n```\n\n- item';
    const b = parseMarkdown(md);
    expect(b.map((x) => x.t)).toEqual(['heading', 'paragraph', 'code', 'ul']);
  });
});
