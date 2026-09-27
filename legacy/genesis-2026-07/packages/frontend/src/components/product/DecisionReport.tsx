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
 * All UI text flows through the i18n seam.
 */
import { useState } from 'react';
import { Panel, StatusPill } from '../discovery/DiscoveryShell';
import { Icon } from '../Icon';
import {
  type DecisionReport as Decision, type DecisionStatement, type DecisionCategory,
  DECISION_CATEGORY_META, EVIDENCE_TAG_META,
} from '../../core/scientificDecision';
import { descriptorProvenance, type ReproMeta } from '../../core/provenance';
import { useI18n } from '../../core/i18n';

const ORDER: DecisionCategory[] = ['VERIFIED', 'PROMISING', 'UNKNOWN', 'VALIDATION', 'NEXT'];

/** One decision statement: tag pill + text, expandable to its explanation payload. */
function StatementItem({ s }: { s: DecisionStatement }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const tag = EVIDENCE_TAG_META[s.tag];
  const hasExplain = s.explain.descriptors.length > 0 || s.explain.rule || s.explain.origin || s.explain.assumptions.length > 0 || s.explain.limitations.length > 0;
  return (
    <li className="decision-item">
      <div className="decision-item-head">
        <StatusPill kind={tag.kind}><Icon name={tag.icon} size={11} /> {t(tag.labelKey)}</StatusPill>
        <span className="decision-item-text">{s.text}</span>
        {hasExplain ? (
          <button className="decision-explain-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? t('dr.explain.hide') : t('dr.explain.show')}
          </button>
        ) : null}
      </div>
      {/* Always in the DOM (toggled via CSS) so the printed PDF shows every explanation. */}
      {hasExplain ? (
        <dl className={`decision-explain${open ? ' is-open' : ''}`}>
          {s.explain.descriptors.length ? <div><dt>{t('dr.explain.descriptors')}</dt><dd className="ds-mono">{s.explain.descriptors.join(', ')}</dd></div> : null}
          {s.explain.rule ? <div><dt>{t('dr.explain.rule')}</dt><dd>{s.explain.rule}</dd></div> : null}
          {s.explain.origin ? <div><dt>{t('dr.explain.origin')}</dt><dd>{s.explain.origin}</dd></div> : null}
          {s.explain.assumptions.length ? <div><dt>{t('dr.explain.assumptions')}</dt><dd>{s.explain.assumptions.join(' ')}</dd></div> : null}
          {s.explain.limitations.length ? <div><dt>{t('dr.explain.limitations')}</dt><dd>{s.explain.limitations.join(' ')}</dd></div> : null}
        </dl>
      ) : null}
    </li>
  );
}

/** Section 1 — Scientific Decision Report (tagged, grouped, expandable). */
export function ScientificDecisionPanel({ decision }: { decision: Decision }) {
  const { t } = useI18n();
  const byCat = ORDER.map((c) => ({ c, items: decision.statements.filter((s) => s.category === c) })).filter((g) => g.items.length);
  return (
    <Panel title={t('dr.panel.decision')} icon="target" className="ds-mt" right={<StatusPill kind="info">{t('dr.eachTagged')}</StatusPill>}>
      <p className="ds-note" style={{ marginTop: 0 }}>
        {t('dr.intro.a')}<strong>{t('dr.intro.verified')}</strong>{t('dr.intro.b')}<strong>{t('dr.intro.promising')}</strong>{t('dr.intro.c')}<strong>{t('dr.intro.unknown')}</strong>{t('dr.intro.d')}<strong>{t('dr.intro.validation')}</strong>{t('dr.intro.e')}<span className="tag-legend">{t('dr.legend.verified')}</span> ·{' '}
        <span className="tag-legend">{t('dr.legend.grounded')}</span> · <span className="tag-legend">{t('dr.legend.general')}</span>.
      </p>
      {byCat.map(({ c, items }) => {
        const meta = DECISION_CATEGORY_META[c];
        return (
          <div key={c} className="decision-group">
            <h5 className="decision-group-h"><Icon name={meta.icon} size={14} /> {t(meta.labelKey)}</h5>
            <ul className="decision-list">{items.map((s, i) => <StatementItem key={i} s={s} />)}</ul>
          </div>
        );
      })}
    </Panel>
  );
}

/** Section 2 — Research Decision Support (strengths / risks / unknowns / validation). */
export function ResearchSupportPanel({ decision }: { decision: Decision }) {
  const { t } = useI18n();
  return (
    <Panel title={t('dr.panel.support')} icon="flask" className="ds-mt" right={<StatusPill kind="info">{t('dr.support.workflows')}</StatusPill>}>
      <div className="decision-support">
        <div className="decision-col">
          <h6 className="decision-col-h ok"><Icon name="check" size={13} /> {t('dr.support.strengths')}</h6>
          {decision.strengths.length ? <ul>{decision.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="ds-dim">{t('dr.support.noStrengths')}</p>}
        </div>
        <div className="decision-col">
          <h6 className="decision-col-h warn"><Icon name="alert" size={13} /> {t('dr.support.risks')}</h6>
          {decision.risks.length ? <ul>{decision.risks.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="ds-dim">{t('dr.support.noRisks')}</p>}
        </div>
        <div className="decision-col">
          <h6 className="decision-col-h"><Icon name="search" size={13} /> {t('dr.support.unknowns')}</h6>
          <ul>{decision.unknowns.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      </div>
      <h6 className="decision-col-h" style={{ marginTop: '1rem' }}><Icon name="flask" size={13} /> {t('dr.support.validationSteps')}</h6>
      <div className="ds-table-wrap">
        <table className="ds-table">
          <thead><tr><th>{t('dr.support.th.workflow')}</th><th>{t('dr.support.th.measures')}</th><th>{t('dr.support.th.status')}</th></tr></thead>
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
      <p className="ds-note ds-mt">{t('dr.support.note')}</p>
    </Panel>
  );
}

/** Section — Scientific Transparency ("why Genesis reached this conclusion"). */
export function TransparencyPanel({ decision }: { decision: Decision }) {
  const { t } = useI18n();
  return (
    <Panel title={t('dr.panel.transparency')} icon="shield" className="ds-mt">
      <dl className="ds-defs">
        <div style={{ gridColumn: '1 / -1' }}><dt>{t('dr.trans.descriptors')}</dt><dd className="ds-mono">{decision.transparency.verifiedDescriptors.join(', ')}</dd></div>
        <div style={{ gridColumn: '1 / -1' }}><dt>{t('dr.trans.rules')}</dt><dd>{decision.transparency.groundingRules.length ? decision.transparency.groundingRules.join(' · ') : t('dr.trans.noRules')}</dd></div>
        <div style={{ gridColumn: '1 / -1' }}><dt>{t('dr.trans.confidence')}</dt><dd>{decision.transparency.confidenceNote}</dd></div>
      </dl>
      <h6 className="decision-col-h" style={{ marginTop: '0.85rem' }}><Icon name="block" size={13} /> {t('dr.trans.removed')}</h6>
      <ul className="decision-removed">{decision.transparency.removedClaims.map((x, i) => <li key={i}>{x}</li>)}</ul>
      <h6 className="decision-col-h" style={{ marginTop: '0.85rem' }}><Icon name="alert" size={13} /> {t('dr.trans.limitations')}</h6>
      <ul className="decision-removed">{decision.transparency.limitations.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </Panel>
  );
}

/** Section — Reproducibility (Report ID / hash / versions / timestamp). */
export function ReproducibilityPanel({ repro }: { repro: ReproMeta }) {
  const { t } = useI18n();
  return (
    <Panel title={t('dr.panel.repro')} icon="clock" className="ds-mt" right={<StatusPill kind="ok">{t('dr.repro.deterministic')}</StatusPill>}>
      <dl className="ds-defs repro-meta">
        <div><dt>Report ID</dt><dd className="ds-mono">{repro.reportId}</dd></div>
        <div><dt>{t('dr.repro.genesisVersion')}</dt><dd className="ds-mono">{repro.genesisVersion}</dd></div>
        <div><dt>{t('dr.repro.rdkitVersion')}</dt><dd className="ds-mono">{repro.rdkitVersion}</dd></div>
        <div><dt>{t('dr.repro.groundingVersion')}</dt><dd className="ds-mono">{repro.groundingVersion}</dd></div>
        <div><dt>{t('dr.repro.generated')}</dt><dd className="ds-mono">{new Date(repro.generatedAt).toISOString()}</dd></div>
        <div style={{ gridColumn: '1 / -1' }}><dt>Analysis Hash (SHA-256)</dt><dd className="ds-mono" style={{ wordBreak: 'break-all' }}>{repro.analysisHash}</dd></div>
      </dl>
      <p className="ds-note ds-mt">{t('dr.repro.note')}</p>
    </Panel>
  );
}

/** Provenance panel — per-descriptor honest metadata (inspectable). */
export function ProvenancePanel({ keys, engineVersion, timestamp }: { keys: string[]; engineVersion: string; timestamp: number }) {
  const { t } = useI18n();
  const rows = keys.map((k) => descriptorProvenance(k, { engineVersion, timestamp })).filter((p): p is NonNullable<typeof p> => p !== null);
  const CONF: Record<string, { kind: 'ok' | 'warn' | 'info'; label: string }> = {
    HIGH: { kind: 'ok', label: t('dr.conf.high') }, MEDIUM: { kind: 'warn', label: t('dr.conf.medium') }, MODEL_ESTIMATE: { kind: 'warn', label: t('dr.conf.modelEstimate') },
  };
  return (
    <Panel title={t('dr.panel.provenance')} icon="memory" className="ds-mt" right={<StatusPill kind="info">{t('dr.prov.right')}</StatusPill>}>
      <div className="ds-table-wrap">
        <table className="ds-table provenance-table">
          <thead><tr><th>{t('dr.prov.th.descriptor')}</th><th>{t('dr.prov.th.source')}</th><th>{t('dr.prov.th.algorithm')}</th><th>{t('dr.prov.th.version')}</th><th>{t('dr.prov.th.confidence')}</th></tr></thead>
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
