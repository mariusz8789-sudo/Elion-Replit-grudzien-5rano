import type React from 'react';

/**
 * ProvenancePanel — a generic key/value provenance listing, reused across
 * every screen that needs to show where its numbers came from (fingerprint,
 * source URL, sha256, dataset version, retrieval date). Renders exactly the
 * items it is given; invents nothing, orders nothing by importance it wasn't
 * told, and does not special-case any particular key.
 */

export interface ProvenanceItem {
  readonly k: string;
  readonly v: string;
}

export function ProvenancePanel({ title = 'Provenance', items }: { readonly title?: string; readonly items: readonly ProvenanceItem[] }): React.ReactElement {
  return (
    <section className="gu-provenance-panel">
      <h3 className="section-label">{title}</h3>
      {items.length === 0 ? (
        <p className="empty-state">No provenance recorded.</p>
      ) : (
        <ul className="gu-provenance-list">
          {items.map((it) => (
            <li key={it.k} className="gu-provenance-item">
              <span className="gu-provenance-key">{it.k}</span>
              <span className="gu-provenance-value">{it.v}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
