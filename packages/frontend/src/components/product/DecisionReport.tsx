/**
 * DecisionReport (Stage 5) — the Scientific Decision Engine, rendered.
 *
 * Sections: Scientific Decision (VERIFIED / PROMISING / UNKNOWN / VALIDATION / NEXT,
 * each statement tagged ✓ / ⚠ / ⓘ and expandable to its supporting descriptors,
 * rule, origin, assumptions and limitations) · Research Decision Support (strengths /
 * risks / unknowns / suggested standard validation workflows) · Scientific
 * Transparency ("why Genesis reached this conclusion") · Provenance (per-descriptor
 * source / engine / algorithm / version / confidence) · Reproducibility footer.
 *
 * Pure reuse of Panel/StatusPill/Icon + the deterministic scientificDecision and
 * provenance modules. No new computation, no network. Every claim carries a status.
 */
import { useState } from 'react';
import { Panel, StatusPill } from '../discovery/DiscoveryShell';
import { Icon } from '../Icon';
import {
  type DecisionReport as Decision, type DecisionStatement, type DecisionCategory,
  DECISION_CATEGORY_META, EVIDENCE_TAG_META,
} from '../../core/scientificDecision';
import { descriptorProvenance, type ReproMeta } from '../../core/provenance';

const ORDER: DecisionCategory[] = ['VERIFIED', 'PROMISING', 'UNKNOWN', 'VALIDATION', 'NEXT'];

/** One decision statement: tag pill + text, expandable to its explanation payload. */
function StatementItem({ s }: { s: DecisionStatement }) {
  const [open, setOpen] = useState(false);
  const tag = EVIDENCE_TAG_META[s.tag];
  const hasExplain = s.explain.descriptors.length > 0 || s.explain.rule || s.explain.origin || s.explain.assumptions.length > 0 || s.explain.limitations.length > 0;
  return (
    <li className="decision-item">
      <div className="decision-item-head">
        <StatusPill kind={tag.kind}><Icon name={tag.icon} size={11} /> {tag.label}</StatusPill>
        <span className="decision-item-text">{s.text}</span>
        {hasExplain ? (
          <button className="decision-explain-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? 'Ukryj' : 'Wyjaśnij'}
          </button>
        ) : null}
      </div>
      {/* Always in the DOM (toggled via CSS) so the printed PDF shows every explanation. */}
      {hasExplain ? (
        <dl className={`decision-explain${open ? ' is-open' : ''}`}>
          {s.explain.descriptors.length ? <div><dt>Deskryptory RDKit</dt><dd className="ds-mono">{s.explain.descriptors.join(', ')}</dd></div> : null}
          {s.explain.rule ? <div><dt>Zastosowana reguła</dt><dd>{s.explain.rule}</dd></div> : null}
          {s.explain.origin ? <div><dt>Pochodzenie</dt><dd>{s.explain.origin}</dd></div> : null}
          {s.explain.assumptions.length ? <div><dt>Założenia</dt><dd>{s.explain.assumptions.join(' ')}</dd></div> : null}
          {s.explain.limitations.length ? <div><dt>Ograniczenia</dt><dd>{s.explain.limitations.join(' ')}</dd></div> : null}
        </dl>
      ) : null}
    </li>
  );
}

/** Section 1 — Scientific Decision Report (tagged, grouped, expandable). */
export function ScientificDecisionPanel({ decision }: { decision: Decision }) {
  const byCat = ORDER.map((c) => ({ c, items: decision.statements.filter((s) => s.category === c) })).filter((g) => g.items.length);
  return (
    <Panel title="Decyzja naukowa" icon="target" className="ds-mt" right={<StatusPill kind="info">każde twierdzenie oznaczone</StatusPill>}>
      <p className="ds-note" style={{ marginTop: 0 }}>
        Co zostało <strong>zweryfikowane</strong>, co wygląda <strong>obiecująco</strong>, co pozostaje <strong>nieznane</strong> i co
        wymaga <strong>walidacji eksperymentalnej</strong>. Legenda: <span className="tag-legend">✓ zweryfikowane obliczenie</span> ·{' '}
        <span className="tag-legend">⚠ interpretacja ugruntowana</span> · <span className="tag-legend">ⓘ ogólna wiedza naukowa</span>.
      </p>
      {byCat.map(({ c, items }) => {
        const meta = DECISION_CATEGORY_META[c];
        return (
          <div key={c} className="decision-group">
            <h5 className="decision-group-h"><Icon name={meta.icon} size={14} /> {meta.label}</h5>
            <ul className="decision-list">{items.map((s, i) => <StatementItem key={i} s={s} />)}</ul>
          </div>
        );
      })}
    </Panel>
  );
}

/** Section 2 — Research Decision Support (strengths / risks / unknowns / validation). */
export function ResearchSupportPanel({ decision }: { decision: Decision }) {
  return (
    <Panel title="Wsparcie decyzji badawczej" icon="flask" className="ds-mt" right={<StatusPill kind="info">standardowe workflow</StatusPill>}>
      <div className="decision-support">
        <div className="decision-col">
          <h6 className="decision-col-h ok"><Icon name="check" size={13} /> Mocne strony</h6>
          {decision.strengths.length ? <ul>{decision.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="ds-dim">Brak jednoznacznych mocnych stron z deskryptorów.</p>}
        </div>
        <div className="decision-col">
          <h6 className="decision-col-h warn"><Icon name="alert" size={13} /> Ryzyka</h6>
          {decision.risks.length ? <ul>{decision.risks.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="ds-dim">Brak sygnałów ryzyka z deskryptorów.</p>}
        </div>
        <div className="decision-col">
          <h6 className="decision-col-h"><Icon name="search" size={13} /> Nieznane</h6>
          <ul>{decision.unknowns.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      </div>
      <h6 className="decision-col-h" style={{ marginTop: '1rem' }}><Icon name="flask" size={13} /> Sugerowane kroki walidacyjne (standardowe workflow laboratoryjne)</h6>
      <div className="ds-table-wrap">
        <table className="ds-table">
          <thead><tr><th>Workflow</th><th>Co mierzy</th><th>Status</th></tr></thead>
          <tbody>
            {decision.validation.map((v, i) => (
              <tr key={i}>
                <td className="ds-strong">{v.workflow}</td>
                <td className="ds-dim">{v.purpose}</td>
                <td><StatusPill kind="warn"><Icon name="alert" size={11} /> {v.note}</StatusPill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ds-note ds-mt">Genesis nie przewiduje wyników tych eksperymentów — proponuje wyłącznie standardowe metody, których rezultat trzeba zmierzyć.</p>
    </Panel>
  );
}

/** Section — Scientific Transparency ("why Genesis reached this conclusion"). */
export function TransparencyPanel({ decision }: { decision: Decision }) {
  return (
    <Panel title="Dlaczego Genesis doszedł do tych wniosków" icon="shield" className="ds-mt">
      <dl className="ds-defs">
        <div style={{ gridColumn: '1 / -1' }}><dt>Użyte zweryfikowane deskryptory</dt><dd className="ds-mono">{decision.transparency.verifiedDescriptors.join(', ')}</dd></div>
        <div style={{ gridColumn: '1 / -1' }}><dt>Zastosowane reguły Grounding Layer</dt><dd>{decision.transparency.groundingRules.length ? decision.transparency.groundingRules.join(' · ') : 'brak reguł kierunkowych dla tego profilu'}</dd></div>
        <div style={{ gridColumn: '1 / -1' }}><dt>Klasyfikacja pewności</dt><dd>{decision.transparency.confidenceNote}</dd></div>
      </dl>
      <h6 className="decision-col-h" style={{ marginTop: '0.85rem' }}><Icon name="block" size={13} /> Twierdzenia świadomie pominięte</h6>
      <ul className="decision-removed">{decision.transparency.removedClaims.map((x, i) => <li key={i}>{x}</li>)}</ul>
      <h6 className="decision-col-h" style={{ marginTop: '0.85rem' }}><Icon name="alert" size={13} /> Ograniczenia naukowe</h6>
      <ul className="decision-removed">{decision.transparency.limitations.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </Panel>
  );
}

/** Section — Reproducibility (Report ID / hash / versions / timestamp). */
export function ReproducibilityPanel({ repro }: { repro: ReproMeta }) {
  return (
    <Panel title="Reprodukowalność" icon="clock" className="ds-mt" right={<StatusPill kind="ok">deterministyczne</StatusPill>}>
      <dl className="ds-defs repro-meta">
        <div><dt>Report ID</dt><dd className="ds-mono">{repro.reportId}</dd></div>
        <div><dt>Wersja Genesis</dt><dd className="ds-mono">{repro.genesisVersion}</dd></div>
        <div><dt>Wersja RDKit</dt><dd className="ds-mono">{repro.rdkitVersion}</dd></div>
        <div><dt>Wersja Grounding</dt><dd className="ds-mono">{repro.groundingVersion}</dd></div>
        <div><dt>Wygenerowano</dt><dd className="ds-mono">{new Date(repro.generatedAt).toISOString()}</dd></div>
        <div style={{ gridColumn: '1 / -1' }}><dt>Analysis Hash (SHA-256)</dt><dd className="ds-mono" style={{ wordBreak: 'break-all' }}>{repro.analysisHash}</dd></div>
      </dl>
      <p className="ds-note ds-mt">Ten sam SMILES + ta sama wersja RDKit → identyczny hash. Inny naukowiec może odtworzyć obliczenie i porównać wynik.</p>
    </Panel>
  );
}

/** Provenance panel — per-descriptor honest metadata (inspectable). */
export function ProvenancePanel({ keys, engineVersion, timestamp }: { keys: string[]; engineVersion: string; timestamp: number }) {
  const rows = keys.map((k) => descriptorProvenance(k, { engineVersion, timestamp })).filter((p): p is NonNullable<typeof p> => p !== null);
  const CONF: Record<string, { kind: 'ok' | 'warn' | 'info'; label: string }> = {
    HIGH: { kind: 'ok', label: 'Wysoka' }, MEDIUM: { kind: 'warn', label: 'Średnia (model)' }, MODEL_ESTIMATE: { kind: 'warn', label: 'Oszacowanie modelu' },
  };
  return (
    <Panel title="Proweniencja (jak powstała każda wartość)" icon="memory" className="ds-mt" right={<StatusPill kind="info">źródło · silnik · algorytm</StatusPill>}>
      <div className="ds-table-wrap">
        <table className="ds-table provenance-table">
          <thead><tr><th>Deskryptor</th><th>Źródło / Silnik</th><th>Algorytm</th><th>Wersja</th><th>Pewność</th></tr></thead>
          <tbody>
            {rows.map((p, i) => {
              const c = CONF[p.confidence] ?? CONF.HIGH;
              return (
                <tr key={i}>
                  <td className="ds-strong">{p.descriptor}</td>
                  <td className="ds-dim">{p.source}</td>
                  <td className="ds-dim">{p.algorithm}</td>
                  <td className="ds-mono">{p.engineVersion}</td>
                  <td><StatusPill kind={c.kind}>{c.label}</StatusPill><div className="provenance-note">{p.confidenceNote}</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
