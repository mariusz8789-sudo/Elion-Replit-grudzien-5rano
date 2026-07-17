/**
 * ComparisonReport (Stage 6, re-architected 2026-07) — the rendered molecule-selection
 * report. Two genuinely different presentations of the same data/state, chosen by a
 * pure-CSS breakpoint (no JS layout branching, no flash, and print always uses the
 * desktop/table version regardless of the viewing device — see the .cmp-desktop-view /
 * .cmp-mobile-view rules in styles.css):
 *
 *  - Desktop (>720px): Decision Dashboard → Ranking table → Kluczowe ADMET → collapsed
 *    Matrix/Reference/Portfolio, as before.
 *  - Mobile (≤720px): a decision-first hero (winner, why, biggest risk, one CTA) →
 *    candidate CARDS (never a table) → a compact ADMET risk summary (never six
 *    identical boxes) → everything else behind one "more analyses" disclosure. This is
 *    a from-scratch mobile IA, not a shrunk desktop table.
 *
 * Nothing is removed in either mode — every section from the original layout still
 * exists and still reaches the printed/exported PDF (desktop tree only, print CSS
 * forces every <ToggleSection> open for export regardless of on-screen state).
 *
 * This is the single surface that "Export batch PDF" prints and that both Compare
 * (ComparePlatformScreen) and Campaigns (via CampaignReport, embedded) render live —
 * one component, reused, not duplicated.
 *
 * Everything through Reference-comparison/Portfolio is pure presentation over the
 * deterministic RDKit-only moleculeComparison engine — no new computation, no biology.
 * The ADMET section is the one deliberate exception: it calls the existing, verified
 * compute/admetAdapter.mjs backend (via predictAdmet) for the molecule currently
 * selected in its own dropdown, and renders the result. It never feeds into the RDKit
 * score/verdict above — RDKit values stay "computed", ADMET values stay
 * "MODEL_ESTIMATE", never mixed.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Panel, StatusPill } from '../discovery/DiscoveryShell';
import { StatCard } from '../charts/Charts';
import { Icon } from '../Icon';
import {
  rankingWhy, differencesVsReference, portfolioBuckets, buildMatrix, MATRIX_COLUMNS, VERDICT_META,
  type RankedCandidate, type Verdict, type MatrixRow, type Portfolio,
} from '../../core/moleculeComparison';
import { predictAdmet, getAdmetEndpoints, type AdmetEndpointMeta } from '../../core/backend/client';

const VERDICTS: Verdict[] = ['CONTINUE', 'NEEDS_EXPERIMENTS', 'HIGH_UNCERTAINTY', 'REJECT'];
// Endpoints treated as "risk-up-is-bad" when picking the single biggest risk for the
// mobile hero card — the other two headline endpoints (BBB/HIA) aren't inherently
// good or bad in one direction, so they're excluded from that specific calculation.
const RISK_ADMET_IDS = ['hERG', 'AMES', 'DILI', 'ClinTox'];

// The most commonly decision-relevant ADMET-AI endpoints for an early triage go/no-go
// (cardiotoxicity, mutagenicity, liver injury, clinical-trial toxicity failure risk, CNS
// penetration, oral absorption) — shown up front; the other ~46 stay one click away.
const HEADLINE_ADMET_IDS = ['hERG', 'AMES', 'DILI', 'ClinTox', 'BBB_Martins', 'HIA_Hou'];

type AdmetEntry =
  | { status: 'loading' }
  | { status: 'ready'; values: Record<string, number>; version: string }
  | { status: 'unavailable'; reason: string };

/** Classification endpoints are [0,1] probabilities; regression endpoints keep their published unit. */
function formatAdmetValue(v: number, meta: AdmetEndpointMeta | undefined): string {
  if (!Number.isFinite(v)) return '—';
  if (meta?.taskType === 'classification') return `${(v * 100).toFixed(1)}%`;
  const n = Number(v.toFixed(3));
  return meta?.units ? `${n} ${meta.units}` : String(n);
}

/** The endpoint's own published TDC benchmark (AUROC/R²) — so a reader can judge reliability. */
function formatAdmetMetric(meta: AdmetEndpointMeta | undefined): string {
  if (!meta || !meta.publishedMetric || meta.publishedMetricValue == null) return '—';
  return `${meta.publishedMetric} ${meta.publishedMetricValue.toFixed(2)}`;
}

/** Heatmap colour: red (poor) → amber → green (favourable). Text stays dark for print. */
function heat(fav: number): string {
  const hue = Math.round(fav * 125); // 0=red … 125=green
  return `hsl(${hue}, 70%, ${72 - fav * 8}%)`;
}

/** The single biggest, honestly-computed risk signal for one candidate — RDKit structural
 * alerts (deterministic) take priority over an ADMET model estimate (probabilistic).
 * Returns null rather than guessing when no signal is available yet. */
function biggestRisk(c: RankedCandidate, entry: AdmetEntry | undefined, endpointById: Map<string, AdmetEndpointMeta>): { label: string; kind: 'ok' | 'warn' | 'blocked' } | null {
  if (c.alerts.length > 0) return { label: `${c.alerts.length} alert${c.alerts.length > 1 ? 'y' : ''} strukturalne (RDKit)`, kind: 'blocked' };
  if (!entry || entry.status !== 'ready') return null;
  const risky = RISK_ADMET_IDS
    .filter((id) => Number.isFinite(entry.values[id]))
    .map((id) => ({ id, value: entry.values[id], meta: endpointById.get(id) }));
  if (!risky.length) return null;
  const top = risky.reduce((a, b) => (b.value > a.value ? b : a));
  const pct = Math.round(top.value * 100);
  const kind: 'ok' | 'warn' | 'blocked' = pct >= 50 ? 'blocked' : pct >= 20 ? 'warn' : 'ok';
  return { label: `${top.meta?.name ?? top.id} ${pct}% (MODEL_ESTIMATE)`, kind };
}

/** Scientific Matrix (heatmap) content — shared verbatim between the desktop panel and the mobile "more analyses" disclosure. */
function MatrixContent({ ranked, matrix }: { ranked: RankedCandidate[]; matrix: MatrixRow[] }) {
  return (
    <>
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
    </>
  );
}

/** Reference-diff content — shared verbatim between the desktop panel and the mobile "more analyses" disclosure. */
function ReferenceDiffContent({ reference, others }: { reference: RankedCandidate; others: RankedCandidate[] }) {
  return (
    <>
      {others.map((c) => (
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
    </>
  );
}

/** Portfolio content — shared verbatim between the desktop panel and the mobile "more analyses" disclosure. */
function PortfolioContent({ portfolio }: { portfolio: Portfolio }) {
  return (
    <div className="portfolio-grid">
      <PortfolioCol title="Najlepsi kandydaci" kind="ok" icon="check" items={portfolio.best} empty="brak kandydatów z rekomendacją Kontynuuj" />
      <PortfolioCol title="Do walidacji" kind="warn" icon="flask" items={portfolio.needsValidation} empty="brak" />
      <PortfolioCol title="Odrzuceni" kind="blocked" icon="block" items={portfolio.rejected} empty="brak odrzuconych" />
      <PortfolioCol title="Najsłabsi (ogon rankingu)" kind="info" icon="chart" items={portfolio.worst} empty="—" />
    </div>
  );
}

/** One candidate as a mobile-native card (never a table row). Tap to expand its WHY. */
function CandidateCard({ c, isReference, expanded, onToggle }: { c: RankedCandidate; isReference: boolean; expanded: boolean; onToggle: () => void }) {
  const meta = VERDICT_META[c.decision.verdict];
  return (
    <div className={`cmp-cand-card${expanded ? ' is-open' : ''}`}>
      <button type="button" className="cmp-cand-head" onClick={onToggle} aria-expanded={expanded}>
        <span className="cmp-cand-rank">#{c.rank}</span>
        <span className="cmp-cand-main">
          <span className="cmp-cand-name">{c.name}{isReference ? <span className="ref-badge">referencja</span> : null}</span>
          <span className="cmp-cand-smiles">{c.smiles}</span>
        </span>
        <span className="cmp-cand-score">{c.scored.score}</span>
      </button>
      <div className="cmp-cand-verdict">
        <StatusPill kind={meta.kind}><Icon name={meta.icon} size={11} /> {meta.label}</StatusPill>
        <span className="cmp-cand-chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
      </div>
      {expanded ? (
        <div className="cmp-cand-why">
          {rankingWhy(c).map((w, i) => <div key={i} className={w.startsWith('−') ? 'why-neg' : 'why-pos'}>{w}</div>)}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Progressive-disclosure wrapper: collapsed by default on screen, always expanded in
 * print (see `@media print .cmp-toggle-body` in styles.css) so PDF export stays
 * complete. Purely a display toggle — renders exactly the children it's given.
 */
function ToggleSection({ label, closeLabel, defaultOpen = false, children }: { label: string; closeLabel?: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`cmp-toggle${open ? ' is-open' : ''}`}>
      <button type="button" className="cmp-toggle-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>{open ? (closeLabel ?? 'Ukryj') : label}</span>
        <span className="cmp-toggle-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      <div className="cmp-toggle-body">{children}</div>
    </div>
  );
}

export function ComparisonReport({ ranked, referenceId, embedded }: { ranked: RankedCandidate[]; referenceId: string | null; embedded?: boolean }) {
  const [admetEndpoints, setAdmetEndpoints] = useState<AdmetEndpointMeta[] | null>(null);
  const [admetEndpointsError, setAdmetEndpointsError] = useState<string | null>(null);
  const [admetResults, setAdmetResults] = useState<Record<string, AdmetEntry>>({});
  const [admetSelectedId, setAdmetSelectedId] = useState<string | null>(null);
  const admetRequested = useRef<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    getAdmetEndpoints().then((r) => {
      if (!alive) return;
      if (r.ok) setAdmetEndpoints(r.data);
      else setAdmetEndpointsError(r.message);
    });
    return () => { alive = false; };
  }, []);

  const admetCandidate = ranked.find((c) => c.id === admetSelectedId) ?? ranked.find((c) => c.id === referenceId) ?? ranked[0] ?? null;
  const admetSmiles = admetCandidate?.smiles ?? null;

  useEffect(() => {
    if (!admetSmiles || admetRequested.current.has(admetSmiles)) return;
    admetRequested.current.add(admetSmiles);
    setAdmetResults((prev) => ({ ...prev, [admetSmiles]: { status: 'loading' } }));
    predictAdmet([admetSmiles]).then((r) => {
      if (!r.ok) {
        console.error('[ADMET] predykcja niedostępna', { smiles: admetSmiles, error: r.error, message: r.message });
        setAdmetResults((prev) => ({ ...prev, [admetSmiles]: { status: 'unavailable', reason: r.message } }));
        return;
      }
      const values = r.data.predictions[admetSmiles];
      if (!values) {
        console.error('[ADMET] silnik nie zwrócił predykcji dla tego SMILES', { smiles: admetSmiles });
        setAdmetResults((prev) => ({ ...prev, [admetSmiles]: { status: 'unavailable', reason: 'Silnik nie zwrócił wyniku dla tej cząsteczki.' } }));
        return;
      }
      setAdmetResults((prev) => ({ ...prev, [admetSmiles]: { status: 'ready', values, version: r.data.version } }));
    });
  }, [admetSmiles]);

  const endpointById = useMemo(() => {
    const m = new Map<string, AdmetEndpointMeta>();
    (admetEndpoints ?? []).forEach((e) => m.set(e.id, e));
    return m;
  }, [admetEndpoints]);

  const admetEntry = admetSmiles ? admetResults[admetSmiles] : undefined;
  const admetByCategory = useMemo(() => {
    if (!admetEntry || admetEntry.status !== 'ready') return [];
    const groups = new Map<string, { meta: AdmetEndpointMeta; id: string; value: number }[]>();
    for (const [id, value] of Object.entries(admetEntry.values)) {
      // The raw model output also carries internal percentile companions per endpoint (e.g.
      // "<id>_drugbank_approved_percentile") — not part of the documented, TDC-benchmarked
      // 52-endpoint catalog (compute/admet/endpoints). Only show cataloged endpoints here.
      const meta = endpointById.get(id);
      if (!meta) continue;
      if (!groups.has(meta.category)) groups.set(meta.category, []);
      groups.get(meta.category)!.push({ meta, id, value });
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [admetEntry, endpointById]);

  const admetHeadline = useMemo(() => {
    if (!admetEntry || admetEntry.status !== 'ready') return [];
    return HEADLINE_ADMET_IDS
      .filter((id) => Number.isFinite(admetEntry.values[id]))
      .map((id) => ({ id, value: admetEntry.values[id], meta: endpointById.get(id) }));
  }, [admetEntry, endpointById]);

  const admetTotalCount = admetByCategory.reduce((n, [, rows]) => n + rows.length, 0);

  const [mobileExpandedIds, setMobileExpandedIds] = useState<Set<string>>(new Set());
  const [showAllCandidates, setShowAllCandidates] = useState(false);
  const rankingRef = useRef<HTMLDivElement>(null);

  if (!ranked.length) return null;
  const reference = ranked.find((c) => c.id === referenceId) ?? null;
  const portfolio = portfolioBuckets(ranked);
  const matrix = buildMatrix(ranked);
  const winner = ranked[0];
  const winnerRisk = biggestRisk(winner, admetResults[winner.smiles], endpointById);
  const MOBILE_CARD_LIMIT = 8;
  const visibleCandidates = showAllCandidates ? ranked : ranked.slice(0, MOBILE_CARD_LIMIT);

  const body = (
    <>
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

      {/* Kluczowe ADMET (model AI) — headline endpoints only; full 52 stay one click away */}
      <Panel
        title="Kluczowe ADMET"
        icon="shield"
        className="ds-mt"
        right={<StatusPill kind="warn"><Icon name="alert" size={11} /> MODEL_ESTIMATE</StatusPill>}
      >
        <p className="ds-note" style={{ marginTop: 0 }}>
          Predykcje modelu AI (ADMET-AI, D-MPNN wytrenowany na TDC) — <strong>nigdy wartości zmierzone
          eksperymentalnie</strong>. RDKit powyżej liczy deskryptory fizykochemiczne; ADMET-AI szacuje
          właściwości biologiczne/toksykologiczne. Nie są mieszane w jeden wynik.
        </p>
        <div className="ds-input-row" style={{ maxWidth: 420, alignItems: 'center' }}>
          <label className="ds-dim" style={{ whiteSpace: 'nowrap' }}>Cząsteczka:</label>
          <select value={admetCandidate?.id ?? ''} onChange={(e) => setAdmetSelectedId(e.target.value || null)} className="compare-select">
            {ranked.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {admetEndpointsError ? (
          <div className="ds-callout ds-mt"><Icon name="alert" size={15} /> Niedostępne — katalog endpointów ADMET nie odpowiedział: {admetEndpointsError}</div>
        ) : !admetEntry || admetEntry.status === 'loading' ? (
          <div className="skeleton ds-mt" style={{ height: 120 }} />
        ) : admetEntry.status === 'unavailable' ? (
          <div className="ds-callout ds-mt"><Icon name="alert" size={15} /> Niedostępne — {admetEntry.reason} Pozostałe wyniki (RDKit) powyżej pozostają bez zmian.</div>
        ) : (
          <>
            <div className="ds-grid cmp-headline-grid ds-mt">
              {admetHeadline.map((h) => (
                <StatCard key={h.id} label={h.meta?.name ?? h.id} value={formatAdmetValue(h.value, h.meta)} sub="MODEL_ESTIMATE" accent="var(--gold)" />
              ))}
            </div>
            <div className="ds-mt">
              <ToggleSection label={`Pokaż wszystkie ${admetTotalCount} endpointów (wg kategorii, katalog TDC) →`}>
                <p className="ds-dim" style={{ marginTop: 0 }}>ADMET-AI {admetEntry.version} · {admetTotalCount} endpointów (katalog TDC)</p>
                {admetByCategory.map(([category, rows]) => (
                  <div key={category} className="ds-table-wrap ds-mt">
                    <table className="ds-table">
                      <thead><tr><th colSpan={4}>{category}</th></tr><tr><th>Endpoint</th><th>Wartość</th><th>Publikowana metryka (TDC)</th><th></th></tr></thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.id}>
                            <td>{row.meta?.name ?? row.id}</td>
                            <td className="ds-strong">{formatAdmetValue(row.value, row.meta)}</td>
                            <td className="ds-dim">{formatAdmetMetric(row.meta)}</td>
                            <td><StatusPill kind="warn">MODEL_ESTIMATE</StatusPill></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </ToggleSection>
            </div>
          </>
        )}
      </Panel>

      {/* Scientific Matrix (heatmap) — RDKit, collapsed by default */}
      <Panel title="Macierz naukowa" icon="graph" className="ds-mt" right={<StatusPill kind="info">heatmapa deskryptorów</StatusPill>}>
        <ToggleSection label={`Pokaż heatmapę deskryptorów (${ranked.length} cząsteczek) →`}>
          <MatrixContent ranked={ranked} matrix={matrix} />
        </ToggleSection>
      </Panel>

      {/* Reference comparison — RDKit, collapsed by default */}
      {reference ? (
        <Panel title={`Porównanie z referencją: ${reference.name}`} icon="atom" className="ds-mt" right={<StatusPill kind="info">różnice zinterpretowane</StatusPill>}>
          {ranked.filter((c) => c.id !== reference.id).length === 0 ? (
            <p className="ds-dim">Dodaj przynajmniej jedną cząsteczkę poza referencją, aby zobaczyć różnice.</p>
          ) : (
            <ToggleSection label={`Pokaż różnice względem ${reference.name} (${ranked.length - 1}) →`}>
              <ReferenceDiffContent reference={reference} others={ranked.filter((c) => c.id !== reference.id)} />
            </ToggleSection>
          )}
        </Panel>
      ) : null}

      {/* Portfolio view */}
      <Panel title="Portfolio projektu" icon="briefcase" className="ds-mt">
        <PortfolioContent portfolio={portfolio} />
      </Panel>
    </>
  );

  /* ---------------- Mobile: decision-first hero, candidate cards, compact ADMET ---------------- */
  const mobileBody = (
    <div className="cmp-mobile">
      <section className="cmp-hero">
        <div className="cmp-hero-eyebrow">Najlepszy kandydat · {ranked.length} porównanych</div>
        <h2 className="cmp-hero-name">{winner.name}</h2>
        <div className="cmp-hero-row">
          <StatusPill kind={VERDICT_META[winner.decision.verdict].kind}><Icon name={VERDICT_META[winner.decision.verdict].icon} size={13} /> {VERDICT_META[winner.decision.verdict].label}</StatusPill>
          <span className="cmp-hero-score">{winner.scored.score}<small>/100</small></span>
        </div>
        <p className="cmp-hero-why">{winner.decision.reasons[0]}</p>
        <div className="cmp-hero-tags">
          <span className="cmp-hero-tag cmp-hero-tag-ok"><Icon name="check" size={11} /> RDKit zweryfikowane</span>
          {winnerRisk ? <span className={`cmp-hero-tag cmp-hero-tag-${winnerRisk.kind}`}><Icon name="alert" size={11} /> {winnerRisk.label}</span> : null}
        </div>
        <button type="button" className="cmp-hero-cta" onClick={() => rankingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          Zobacz pełny ranking ({ranked.length}) <span aria-hidden="true">→</span>
        </button>
      </section>

      <div className="cmp-stat-strip">
        {VERDICTS.map((v) => {
          const n = ranked.filter((c) => c.decision.verdict === v).length;
          const m = VERDICT_META[v];
          return <span key={v} className="cmp-stat-strip-item"><StatusPill kind={m.kind}>{n}</StatusPill> {m.label}</span>;
        })}
      </div>

      <section className="cmp-section" ref={rankingRef}>
        <h3 className="cmp-section-title">Ranking</h3>
        <div className="cmp-cand-list">
          {visibleCandidates.map((c) => (
            <CandidateCard
              key={c.id} c={c} isReference={c.id === referenceId}
              expanded={mobileExpandedIds.has(c.id)}
              onToggle={() => setMobileExpandedIds((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })}
            />
          ))}
        </div>
        {!showAllCandidates && ranked.length > MOBILE_CARD_LIMIT ? (
          <button type="button" className="cmp-toggle-btn cmp-mt" onClick={() => setShowAllCandidates(true)}>
            <span>Pokaż wszystkich {ranked.length} kandydatów →</span>
          </button>
        ) : null}
      </section>

      <section className="cmp-section">
        <h3 className="cmp-section-title">ADMET <StatusPill kind="warn">MODEL_ESTIMATE</StatusPill></h3>
        <p className="ds-note" style={{ marginTop: 0 }}>Predykcje modelu AI (D-MPNN, TDC) — nigdy wartości zmierzone. Oddzielone od deskryptorów RDKit powyżej.</p>
        <div className="ds-input-row">
          <label className="ds-dim" style={{ whiteSpace: 'nowrap' }}>Cząsteczka:</label>
          <select value={admetCandidate?.id ?? ''} onChange={(e) => setAdmetSelectedId(e.target.value || null)} className="compare-select">
            {ranked.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {admetEndpointsError ? (
          <div className="ds-callout ds-mt"><Icon name="alert" size={15} /> Niedostępne — katalog endpointów ADMET nie odpowiedział: {admetEndpointsError}</div>
        ) : !admetEntry || admetEntry.status === 'loading' ? (
          <div className="skeleton ds-mt" style={{ height: 160 }} />
        ) : admetEntry.status === 'unavailable' ? (
          <div className="ds-callout ds-mt"><Icon name="alert" size={15} /> Niedostępne — {admetEntry.reason} Pozostałe wyniki (RDKit) powyżej pozostają bez zmian.</div>
        ) : (
          <>
            <div className="cmp-admet-compact ds-mt">
              {admetHeadline.map((h) => (
                <div key={h.id} className="cmp-admet-row">
                  <span className="cmp-admet-row-label">{h.meta?.name ?? h.id}</span>
                  <span className="cmp-admet-row-value">{formatAdmetValue(h.value, h.meta)}</span>
                </div>
              ))}
            </div>
            <div className="ds-mt">
              <ToggleSection label={`Zobacz wszystkie ${admetTotalCount} endpointów (katalog TDC) →`}>
                {admetByCategory.map(([category, rows]) => (
                  <div key={category} className="ds-table-wrap ds-mt">
                    <table className="ds-table">
                      <thead><tr><th colSpan={4}>{category}</th></tr><tr><th>Endpoint</th><th>Wartość</th><th>Metryka</th><th></th></tr></thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.id}>
                            <td>{row.meta?.name ?? row.id}</td>
                            <td className="ds-strong">{formatAdmetValue(row.value, row.meta)}</td>
                            <td className="ds-dim">{formatAdmetMetric(row.meta)}</td>
                            <td><StatusPill kind="warn">MODEL_ESTIMATE</StatusPill></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </ToggleSection>
            </div>
          </>
        )}
      </section>

      <ToggleSection label="Więcej analiz naukowych (macierz, referencja, portfolio) →">
        <h4 className="cmp-subhead">Macierz naukowa</h4>
        <MatrixContent ranked={ranked} matrix={matrix} />
        {reference && ranked.filter((c) => c.id !== reference.id).length > 0 ? (
          <>
            <h4 className="cmp-subhead cmp-mt">Porównanie z referencją: {reference.name}</h4>
            <ReferenceDiffContent reference={reference} others={ranked.filter((c) => c.id !== reference.id)} />
          </>
        ) : null}
        <h4 className="cmp-subhead cmp-mt">Portfolio projektu</h4>
        <PortfolioContent portfolio={portfolio} />
      </ToggleSection>
    </div>
  );

  if (embedded) return <><div className="cmp-desktop-view">{body}</div><div className="cmp-mobile-view">{mobileBody}</div></>;
  return (
    <div className="print-report">
      <div className="report-print-title" aria-hidden="true">Molecule Selection Report — Genesis ({ranked.length} cząsteczek)</div>
      <div className="cmp-desktop-view">{body}</div>
      <div className="cmp-mobile-view">{mobileBody}</div>
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
