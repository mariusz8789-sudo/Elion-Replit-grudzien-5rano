import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { requestOpenScienceChat } from '../core/scienceChatBridge';
import {
  LABEL_MEANING, LABEL_ORDER, SCIENTIFIC_OS, SHOWCASE, labelCounts, labelOf, levelOf,
  type Capability, type CapabilityGroup,
} from '../core/scientificOs/catalogue';
import { Icon } from './home/Icon';
import '../styles-command-center.css';

/**
 * MORE · SCIENTIFIC OS (`#/more`, `#/more?group=<id>`) — the whole catalogue in
 * the owner's groups. Every label comes from `labelOf(state)` (the audit), every
 * action is an existing route or the one Ask field; rows with neither say why.
 */

const FOLDED_ROWS = 5;

function groupFromHash(): string | null {
  return new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('group');
}

function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function Row({ cap }: { readonly cap: Capability }): React.ReactElement {
  const label = labelOf(cap.state);
  return (
    <li className="os-row" data-testid={`os-row-${cap.id}`} data-label={label}>
      <div className="os-row-main">
        <b>{cap.name}</b>
        <small>{cap.what}</small>
        <details className="os-tech">
          <summary>Technical details</summary>
          <p><span>Evidence level</span>{levelOf(cap)}</p>
          <p><span>Source</span><code>{cap.source}</code></p>
        </details>
      </div>
      <div className="os-row-side">
        <span className={`os-st os-st-${label}`}>{label}</span>
        {cap.hash !== undefined ? (
          <a className="os-go" href={cap.hash}>Open</a>
        ) : cap.ask !== undefined ? (
          <button type="button" className="os-go" onClick={() => requestOpenScienceChat(cap.ask || undefined)}>Ask</button>
        ) : (
          <span className="os-note">{cap.note}</span>
        )}
      </div>
    </li>
  );
}

function Group({ group, open, onToggle, filter }: {
  readonly group: CapabilityGroup;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly filter: string;
}): React.ReactElement | null {
  const items = filter ? group.items.filter((c) => fold(`${c.name} ${c.what}`).includes(filter)) : group.items;
  if (items.length === 0) return null;
  const counts = labelCounts(group);
  const folded = !open && !filter && !group.subgroups && items.length > FOLDED_ROWS;
  const byId = new Map(items.map((c) => [c.id, c] as const));
  return (
    <section
      id={`os-${group.id}`}
      className={`os-group${group.id === 'gov' ? ' os-group-gov' : ''}${folded ? ' os-folded' : ''}`}
      data-testid={`os-group-${group.id}`}
      aria-labelledby={`os-${group.id}-title`}
    >
      <h2 id={`os-${group.id}-title`}>
        <Icon name={group.icon} />{group.name}
        <small>{group.items.length} · {counts.AVAILABLE} available</small>
      </h2>
      <p className="os-group-line">{group.line}</p>
      {group.subgroups && !filter ? (
        group.subgroups.map((sub) => (
          <div key={sub.label}>
            <h3 className="os-subh">{sub.label}</h3>
            <ul className="os-rows">{sub.ids.map((id) => byId.get(id)).filter((c): c is Capability => c !== undefined).map((c) => <Row key={c.id} cap={c} />)}</ul>
          </div>
        ))
      ) : (
        <ul className="os-rows">{items.map((c) => <Row key={c.id} cap={c} />)}</ul>
      )}
      {folded && <button type="button" className="os-more-n" onClick={onToggle}>Show all {items.length}</button>}
    </section>
  );
}

export function ScientificOsScreen(): React.ReactElement {
  const [openId, setOpenId] = useState<string | null>(groupFromHash);
  const [query, setQuery] = useState('');
  const filter = fold(query.trim());

  useEffect(() => {
    const onHash = (): void => setOpenId(groupFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    if (openId) document.getElementById(`os-${openId}`)?.scrollIntoView?.({ block: 'start' });
  }, [openId]);

  const [left, right] = useMemo(() => {
    const pick = (ids: readonly string[]) => ids.map((id) => SCIENTIFIC_OS.find((g) => g.id === id)).filter((g): g is CapabilityGroup => g !== undefined);
    return [pick(['ls', 'phys', 'edu']), pick(['gov', 'ev', 'world', 'plat'])];
  }, []);

  const renderGroup = (g: CapabilityGroup) => (
    <Group key={g.id} group={g} open={openId === g.id} filter={filter} onToggle={() => setOpenId(g.id)} />
  );

  return (
    <main className="cc os" data-testid="scientific-os" id="main-content" tabIndex={-1} lang="en" dir="ltr">
      <header className="os-head">
        <h1>More · Scientific OS</h1>
        <p>Everything Genesis can do beyond the dashboard. Each status comes from the capability audit, not from a guess.</p>
        <input
          type="search"
          className="os-filter"
          placeholder="Find a capability…"
          aria-label="Find a capability"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <ul className="os-legend" aria-label="Status legend">
          {LABEL_ORDER.map((l) => <li key={l}><i className={`os-mix-${l}`} />{l.charAt(0) + l.slice(1).toLowerCase()}<span>{LABEL_MEANING[l]}</span></li>)}
        </ul>
        <nav className="os-jump" aria-label="Groups">
          {SCIENTIFIC_OS.map((g) => (
            <a key={g.id} href={`#/more?group=${g.id}`} className={g.id === 'gov' ? 'os-jump-gov' : undefined}>{g.name}</a>
          ))}
        </nav>
      </header>
      <div className="os-cols">
        <div className="os-stack">{left.map(renderGroup)}</div>
        <div className="os-stack">{right.map(renderGroup)}</div>
      </div>
      {!filter && (
        <section className="os-showcase" data-testid="os-showcase" aria-labelledby="os-showcase-title">
          <h2 id="os-showcase-title">Showcases and experiments</h2>
          <p>Visual experiments that exist and run. They are not evidence and not products.</p>
          <div className="os-chips">
            {SHOWCASE.map((s) => <a key={s.id} href={s.hash}>{s.name}<span className="os-st os-st-DEMO">DEMO</span></a>)}
          </div>
        </section>
      )}
    </main>
  );
}
