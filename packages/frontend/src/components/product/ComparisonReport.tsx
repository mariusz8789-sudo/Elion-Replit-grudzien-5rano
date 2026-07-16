/**
 * ComparisonReport (Stage 6) — the rendered molecule-selection report. Decision
 * Dashboard · Candidate Ranking (with WHY) · Scientific Matrix (heatmap) · Reference
 * comparison (interpreted differences) · Portfolio view. This is the single surface
 * that "Export batch PDF" prints (root `.print-report`).
 *
 * Pure presentation over the deterministic moleculeComparison engine. No new
 * computation, no biology, no efficacy — every ranking and verdict explains itself.
 */
import { Panel, StatusPill } from '../discovery/DiscoveryShell';
import { Icon } from '../Icon';
import {
  rankingWhy, differencesVsReference, portfolioBuckets, buildMatrix, MATRIX_COLUMNS, VERDICT_META,
  type RankedCandidate, type Verdict,
} from '../../core/moleculeComparison';

const VERDICTS: Verdict[] = ['CONTINUE', 'NEEDS_EXPERIMENTS', 'HIGH_UNCERTAINTY', 'REJECT'];

/** Heatmap colour: red (poor) → amber → green (favourable). Text stays dark for print. */
function heat(fav: number): string {
  const hue = Math.round(fav * 125); // 0=red … 125=green
  return `hsl(${hue}, 70%, ${72 - fav * 8}%)`;
}

export function ComparisonReport({ ranked, referenceId }: { ranked: RankedCandidate[]; referenceId: string | null }) {
  if (!ranked.length) return null;
  const reference = ranked.find((c) => c.id === referenceId) ?? null;
  const portfolio = portfolioBuckets(ranked);
  const matrix = buildMatrix(ranked);

  return (
    <div className="print-report">
      <div className="report-print-title" aria-hidden="true">Molecule Selection Report — Genesis ({ranked.length} cząsteczek)</div>

      {/* Decision Dashboard */}
      <Panel title="Panel decyzyjny" icon="target" right={<StatusPill kind="info">{ranked.length} kandydatów</StatusPill>}>
        <div className="dash-grid">
          {VERDICTS.map((v) => {
            const meta = VERDICT_META[v];
            const items = ranked.filter((c) => c.decision.verdict === v);
            return (
              <div key={v} className={`dash-card dash-${meta.kind}`}>
                <header><StatusPill kind={meta.kind}><Icon name={meta.icon} size={12} /> {meta.label}</StatusPill><span className="dash-count">{items.length}</span></header>
                {items.length ? (
                  <ul>
                    {items.map((c) => (
                      <li key={c.id}>
                        <span className="dash-name">{c.name}</span>
                        <span className="dash-reason">{c.decision.reasons[0]}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="ds-dim">—</p>}
              </div>
            );
          })}
        </div>
        <p className="ds-note ds-mt">Rekomendacje wynikają wyłącznie z deskryptorów fizykochemicznych RDKit. To triage rozwojowy, <strong>nie</strong> ocena aktywności biologicznej — każda ścieżka wymaga walidacji eksperymentalnej.</p>
      </Panel>

      {/* Candidate Ranking */}
      <Panel title="Ranking kandydatów" icon="chart" className="ds-mt" right={<StatusPill kind="info">score rozwojowy 0–100</StatusPill>}>
        <div className="ds-table-wrap">
          <table className="ds-table rank-table">
            <thead><tr><th>#</th><th>Cząsteczka</th><th>Score</th><th>Rekomendacja</th><th>Dlaczego</th></tr></thead>
            <tbody>
              {ranked.map((c) => {
                const meta = VERDICT_META[c.decision.verdict];
                return (
                  <tr key={c.id} className={c.id === referenceId ? 'is-reference' : ''}>
                    <td className="ds-strong">{c.rank}</td>
                    <td><span className="ds-strong">{c.name}</span>{c.id === referenceId ? <span className="ref-badge">referencja</span> : null}<div className="ds-mono rank-smiles" title={c.smiles}>{c.smiles}</div></td>
                    <td><div className="score-bar"><span style={{ width: `${c.scored.score}%` }} /></div><span className="score-num">{c.scored.score}</span></td>
                    <td><StatusPill kind={meta.kind}><Icon name={meta.icon} size={11} /> {meta.label}</StatusPill></td>
                    <td className="rank-why">{rankingWhy(c).map((w, i) => <div key={i} className={w.startsWith('−') ? 'why-neg' : 'why-pos'}>{w}</div>)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Scientific Matrix (heatmap) */}
      <Panel title="Macierz naukowa" icon="graph" className="ds-mt" right={<StatusPill kind="info">heatmapa deskryptorów</StatusPill>}>
        <div className="ds-table-wrap">
          <table className="ds-table matrix-table">
            <thead>
              <tr>
                <th>Cząsteczka</th><th>#</th><th>Score</th>
                {MATRIX_COLUMNS.map((col) => <th key={col.key}>{col.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => (
                <tr key={row.id}>
                  <td className="ds-strong">{row.name}</td>
                  <td>{row.rank}</td>
                  <td className="ds-strong">{row.score}</td>
                  {row.cells.map((cell) => (
                    <td key={cell.key} className="matrix-cell" style={{ backgroundColor: heat(cell.favorability) }} title={`${cell.label}: ${cell.display}`}>{cell.display}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ds-note ds-mt">Kolor = korzystność deskryptora (zielony sprzyja rozwojowi, czerwony to liability), według tych samych progów co score. Wartości są zweryfikowane przez RDKit; interpretacja koloru jest heurystyką rozwojową.</p>
        <div className="matrix-swot">
          {ranked.map((c) => (
            <div key={c.id} className="swot-card">
              <h6 className="swot-h">{c.name}</h6>
              {c.strengths.length ? <div className="swot-line"><StatusPill kind="ok"><Icon name="check" size={10} /> Mocne</StatusPill> <span>{c.strengths.join(' · ')}</span></div> : null}
              {c.weaknesses.length ? <div className="swot-line"><StatusPill kind="warn"><Icon name="alert" size={10} /> Słabe</StatusPill> <span>{c.weaknesses.join(' · ')}</span></div> : null}
              {c.alerts.length ? <div className="swot-line"><StatusPill kind="blocked"><Icon name="block" size={10} /> Alerty</StatusPill> <span>{c.alerts.join(', ')}</span></div> : null}
            </div>
          ))}
        </div>
      </Panel>

      {/* Reference comparison */}
      {reference ? (
        <Panel title={`Porównanie z referencją: ${reference.name}`} icon="atom" className="ds-mt" right={<StatusPill kind="info">różnice zinterpretowane</StatusPill>}>
          {ranked.filter((c) => c.id !== reference.id).length === 0 ? (
            <p className="ds-dim">Dodaj przynajmniej jedną cząsteczkę poza referencją, aby zobaczyć różnice.</p>
          ) : ranked.filter((c) => c.id !== reference.id).map((c) => (
            <div key={c.id} className="diff-block">
              <h6 className="diff-h">{c.name} <span className="ds-dim">vs {reference.name}</span></h6>
              <div className="ds-table-wrap">
                <table className="ds-table diff-table">
                  <thead><tr><th>Deskryptor</th><th>{c.name}</th><th>{reference.name}</th><th>Różnica</th><th>Interpretacja</th></tr></thead>
                  <tbody>
                    {differencesVsReference(c.props, reference.props).map((d) => (
                      <tr key={d.key}>
                        <td className="ds-dim">{d.label}</td>
                        <td>{Number(d.candidate.toFixed(2))}{d.unit ? ' ' + d.unit : ''}</td>
                        <td>{Number(d.reference.toFixed(2))}{d.unit ? ' ' + d.unit : ''}</td>
                        <td className={d.direction === 'higher' ? 'why-neg' : d.direction === 'lower' ? 'why-pos' : 'ds-dim'}>{d.direction === 'equal' ? '≈' : (d.delta > 0 ? '+' : '') + Number(d.delta.toFixed(2))}</td>
                        <td>{d.interpretation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </Panel>
      ) : null}

      {/* Portfolio view */}
      <Panel title="Portfolio projektu" icon="briefcase" className="ds-mt">
        <div className="portfolio-grid">
          <PortfolioCol title="Najlepsi kandydaci" kind="ok" icon="check" items={portfolio.best} empty="brak kandydatów z rekomendacją Kontynuuj" />
          <PortfolioCol title="Do walidacji" kind="warn" icon="flask" items={portfolio.needsValidation} empty="brak" />
          <PortfolioCol title="Odrzuceni" kind="blocked" icon="block" items={portfolio.rejected} empty="brak odrzuconych" />
          <PortfolioCol title="Najsłabsi (ogon rankingu)" kind="info" icon="chart" items={portfolio.worst} empty="—" />
        </div>
      </Panel>
    </div>
  );
}

function PortfolioCol({ title, kind, icon, items, empty }: { title: string; kind: 'ok' | 'warn' | 'blocked' | 'info'; icon: 'check' | 'flask' | 'block' | 'chart'; items: RankedCandidate[]; empty: string }) {
  return (
    <div className="portfolio-col">
      <h6 className="decision-col-h"><StatusPill kind={kind}><Icon name={icon} size={11} /> {title}</StatusPill></h6>
      {items.length ? (
        <ul className="portfolio-list">
          {items.map((c) => <li key={c.id}><span className="ds-strong">#{c.rank} {c.name}</span> <span className="ds-dim">score {c.scored.score}</span></li>)}
        </ul>
      ) : <p className="ds-dim">{empty}</p>}
    </div>
  );
}
