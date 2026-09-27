/**
 * Markdown — renders the parsed AST (core/markdown) into safe React elements.
 * No dangerouslySetInnerHTML: model output can never inject HTML. Code blocks,
 * tables, citation-style blockquotes, and links (opened in a new tab, rel-guarded).
 */
import { Fragment } from 'react';
import { parseMarkdown, type Inline, type Block } from '../../core/markdown';

function Spans({ spans }: { spans: Inline[] }) {
  return (
    <>
      {spans.map((s, i) => {
        switch (s.t) {
          case 'bold': return <strong key={i}>{s.v}</strong>;
          case 'italic': return <em key={i}>{s.v}</em>;
          case 'code': return <code key={i} className="md-code-inline">{s.v}</code>;
          case 'link': return <a key={i} href={s.href} target="_blank" rel="noopener noreferrer">{s.v}</a>;
          default: return <Fragment key={i}>{s.v}</Fragment>;
        }
      })}
    </>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case 'heading': {
      const H = (`h${Math.min(6, b.level + 2)}`) as 'h3';
      return <H className="md-h"><Spans spans={b.text} /></H>;
    }
    case 'paragraph': return <p className="md-p"><Spans spans={b.text} /></p>;
    case 'code': return (
      <pre className="md-code"><div className="md-code-lang">{b.lang || 'code'}</div><code>{b.code}</code></pre>
    );
    case 'ul': return <ul className="md-ul">{b.items.map((it, i) => <li key={i}><Spans spans={it} /></li>)}</ul>;
    case 'ol': return <ol className="md-ol">{b.items.map((it, i) => <li key={i}><Spans spans={it} /></li>)}</ol>;
    case 'quote': return <blockquote className="md-quote"><Spans spans={b.text} /></blockquote>;
    case 'table': return (
      <div className="md-table-wrap"><table className="md-table">
        <thead><tr>{b.header.map((c, i) => <th key={i}><Spans spans={c} /></th>)}</tr></thead>
        <tbody>{b.rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}><Spans spans={c} /></td>)}</tr>)}</tbody>
      </table></div>
    );
    default: return null;
  }
}

export function Markdown({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  return <div className="md">{blocks.map((b, i) => <BlockView key={i} b={b} />)}</div>;
}
