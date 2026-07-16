/**
 * CampaignScreen (Stage 7) — a single Research Campaign. Add molecules, run the SHARED
 * Stage 6 pipeline (bounded concurrency, fault-tolerant, cancellable, resumable within
 * the session), then a dashboard, ranking + Decision Trace, lifecycle timeline, the
 * reused Stage 6 scientific matrix, a full campaign report and CSV/JSON/PDF export.
 *
 * All ranking/decision/trace logic is the Stage 6 engine — no parallel implementation.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ProductChrome } from './ProductChrome';
import { CampaignReport } from './CampaignReport';
import { DecisionTraceView } from './DecisionTraceView';
import { parseMoleculeLines } from './ComparePlatformScreen';
import { Panel, StatusPill } from '../discovery/DiscoveryShell';
import { Icon } from '../Icon';
import { AccountPanel } from '../AccountPanel';
import { useSession, getToken } from '../../core/backend/session';
import { fetchScienceCapabilities, fetchCampaignRemote } from '../../core/backend/client';
import { runBatch } from '../../core/batchRunner';
import { pushCampaign } from '../../core/campaignSync';
import {
  getCampaign, saveCampaign, addMolecules, markAnalysed, markInvalid, markCompared,
  transitionMolecule, pendingMolecules, campaignCandidates, STAGE_LABEL,
  type Campaign, type MoleculeStage,
} from '../../core/campaigns';
import { rankCandidates, decisionTrace, rankingWhy, VERDICT_META } from '../../core/moleculeComparison';
import { campaignSummary } from '../../core/campaignStats';
import { campaignToCSV, campaignToJSON, downloadText } from '../../core/campaignExport';

interface RunState { total: number; done: number; ok: number; invalid: number; startedAt: number }

const STAGE_ACTIONS: { stage: MoleculeStage; label: string; icon: 'check' | 'flask' | 'block' | 'memory' }[] = [
  { stage: 'SELECTED', label: 'Wybierz', icon: 'check' },
  { stage: 'NEEDS_VALIDATION', label: 'Do walidacji', icon: 'flask' },
  { stage: 'REJECTED', label: 'Odrzuć', icon: 'block' },
  { stage: 'ARCHIVED', label: 'Archiwizuj', icon: 'memory' },
];

function etaText(run: RunState): string {
  if (run.done === 0) return '—';
  const elapsed = Date.now() - run.startedAt;
  const remaining = Math.round((elapsed / run.done) * (run.total - run.done) / 1000);
  if (remaining <= 0) return '~0s';
  const m = Math.floor(remaining / 60), s = remaining % 60;
  return m > 0 ? `~${m}m ${s}s` : `~${s}s`;
}

export function CampaignScreen({ id }: { id: string }) {
  const session = useSession();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [addRaw, setAddRaw] = useState('');
  const [run, setRun] = useState<RunState | null>(null);
  const [referenceId, setReferenceId] = useState<string | null>(null);
  const [rdkitVersion, setRdkitVersion] = useState('nieznana');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!session) return;
    const local = getCampaign(session.user.id, id);
    if (local) { setCampaign(local); return; }
    // Nowe urządzenie / brak lokalnie → spróbuj pobrać z serwera i zapisz lokalnie.
    const t = getToken();
    if (!t) { setCampaign(null); return; }
    fetchCampaignRemote(t, id)
      .then((r) => { if (r.ok && r.data?.data && typeof r.data.data === 'object') { const c = r.data.data as Campaign; saveCampaign(c); setCampaign(c); } else setCampaign(null); })
      .catch(() => setCampaign(null));
  }, [session, id]);
  useEffect(() => { fetchScienceCapabilities().then((r) => { if (r.ok) setRdkitVersion(r.data.engines.rdkit?.version ?? 'nieznana'); }); }, []);

  const ranked = useMemo(() => (campaign ? rankCandidates(campaignCandidates(campaign)) : []), [campaign]);
  const summary = useMemo(() => (campaign ? campaignSummary(campaign, ranked) : null), [campaign, ranked]);
  useEffect(() => { if (!referenceId && ranked.length) setReferenceId(ranked[0].id); }, [ranked, referenceId]);

  if (!session) {
    return <ProductChrome active="#/campaigns"><Panel title="Zaloguj się" icon="lock"><AccountPanel /></Panel></ProductChrome>;
  }
  if (!campaign) {
    return (
      <ProductChrome active="#/campaigns">
        <div className="ds-empty"><Icon name="briefcase" size={26} className="ds-empty-icon" /><h4>Nie znaleziono kampanii</h4><p>Mogła zostać usunięta.</p><a className="ds-btn ds-btn-primary" href="#/campaigns">← Kampanie</a></div>
      </ProductChrome>
    );
  }

  // Zapis lokalny (natychmiastowy) + write-through na serwer (best-effort, offline-first).
  const persist = (c: Campaign) => {
    setCampaign(c); saveCampaign(c);
    const t = getToken();
    if (t) pushCampaign(t, c).catch(() => { /* offline → zostaje lokalne, zsynchronizuje się później */ });
  };

  const doAdd = () => {
    const entries = parseMoleculeLines(addRaw, 2000);
    if (!entries.length) return;
    persist(addMolecules(campaign, entries));
    setAddRaw('');
  };

  const runPending = async () => {
    const pend = pendingMolecules(campaign);
    if (!pend.length || run) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRun({ total: pend.length, done: 0, ok: 0, invalid: 0, startedAt: Date.now() });
    let working = campaign;
    await runBatch(pend.map((m) => ({ id: m.id, name: m.name, smiles: m.smiles })), {
      concurrency: 4, signal: controller.signal,
      onProgress: (p) => setRun((r) => (r ? { ...r, done: p.done, ok: p.ok, invalid: p.invalid } : r)),
      onResult: (res) => {
        working = res.ok ? markAnalysed(working, res.id, res.candidate.props, res.candidate.alerts) : markInvalid(working, res.id, res.reason);
        setCampaign(working); saveCampaign(working);
      },
    });
    working = markCompared(working);
    persist(working);
    setRun(null); abortRef.current = null;
  };

  const cancel = () => abortRef.current?.abort();
  const setStage = (moleculeId: string, stage: MoleculeStage) => persist(transitionMolecule(campaign, moleculeId, stage));

  const exportCSV = () => downloadText(`${campaign.name || 'kampania'}.csv`, 'text/csv', campaignToCSV(campaign, { rdkitVersion, generatedAt: Date.now() }));
  const exportJSON = () => downloadText(`${campaign.name || 'kampania'}.json`, 'application/json', campaignToJSON(campaign, { rdkitVersion, generatedAt: Date.now() }));

  const pendCount = pendingMolecules(campaign).length;
  const progressPct = run ? Math.round((run.done / run.total) * 100) : (summary ? Math.round(summary.progress * 100) : 0);

  return (
    <ProductChrome active="#/campaigns">
      {/* Header + controls */}
      <Panel title={campaign.name} icon="briefcase" right={<a className="ds-chip" href="#/campaigns"><Icon name="back" size={13} /> Kampanie</a>}>
        <p className="ds-note" style={{ marginTop: 0 }}><strong>Cel:</strong> {campaign.goal || '—'} · <span className="ds-dim">{campaign.owner} · {new Date(campaign.createdAt).toLocaleDateString('pl-PL')}</span></p>
        <textarea className="compare-input ds-mono" value={addRaw} onChange={(e) => setAddRaw(e.target.value)} rows={4} spellCheck={false} placeholder={'Dodaj cząsteczki — jedna na wiersz, opcjonalnie Nazwa = SMILES\nAspiryna = CC(=O)Oc1ccccc1C(=O)O'} />
        <div className="ds-input-row ds-mt">
          <button className="ds-btn" onClick={doAdd} disabled={!!run || !addRaw.trim()}><Icon name="spark" size={14} /> Dodaj cząsteczki</button>
          {pendCount > 0 && !run ? <button className="ds-btn ds-btn-primary" onClick={runPending}>{campaign.molecules.some((m) => m.status !== 'PENDING') ? 'Wznów analizę' : 'Analizuj'} ({pendCount})</button> : null}
          {run ? <button className="ds-btn" onClick={cancel}><Icon name="block" size={14} /> Przerwij</button> : null}
          {ranked.length ? <>
            <button className="ds-btn" onClick={exportCSV}>Eksport CSV</button>
            <button className="ds-btn" onClick={exportJSON}>Eksport JSON</button>
            <button className="ds-btn" onClick={() => window.print()}>Eksport PDF</button>
          </> : null}
        </div>
        {(run || pendCount > 0) ? (
          <div className="run-status ds-mt">
            <div className="run-bar"><span style={{ width: `${progressPct}%` }} /></div>
            <div className="run-stats">
              <span>Łącznie: <strong>{campaign.molecules.length}</strong></span>
              <span className="ok">Przeanalizowane: <strong>{campaign.molecules.filter((m) => m.status === 'ANALYSED').length}</strong></span>
              <span className="bad">Nieprawidłowe: <strong>{campaign.molecules.filter((m) => m.status === 'INVALID').length}</strong></span>
              <span>Oczekujące: <strong>{pendCount}</strong></span>
              {run ? <><span>Postęp: <strong>{run.done}/{run.total}</strong></span><span>Pozostało: <strong>{etaText(run)}</strong></span></> : null}
            </div>
          </div>
        ) : null}
      </Panel>

      {ranked.length === 0 ? (
        <div className="ds-empty ds-mt"><Icon name="flask" size={24} className="ds-empty-icon" /><h4>Brak przeanalizowanych cząsteczek</h4><p>Dodaj cząsteczki i uruchom analizę, aby zobaczyć ranking i raport.</p></div>
      ) : null}

      {/* Dashboard */}
      {summary && ranked.length ? (
        <Panel title="Panel kampanii" icon="chart" className="ds-mt" right={<StatusPill kind="info">{progressPct}% ukończono</StatusPill>}>
          <div className="dash-grid">
            <div className="dash-card dash-ok"><header><StatusPill kind="ok"><Icon name="check" size={12} /> Kontynuuj</StatusPill><span className="dash-count">{summary.verdictCounts.CONTINUE}</span></header></div>
            <div className="dash-card"><header><StatusPill kind="warn"><Icon name="flask" size={12} /> Do walidacji</StatusPill><span className="dash-count">{summary.needsValidation.length}</span></header></div>
            <div className="dash-card dash-blocked"><header><StatusPill kind="blocked"><Icon name="block" size={12} /> Odrzuceni</StatusPill><span className="dash-count">{summary.rejected.length}</span></header></div>
            <div className="dash-card"><header><StatusPill kind="info"><Icon name="alert" size={12} /> Nieprawidłowe</StatusPill><span className="dash-count">{summary.invalid}</span></header></div>
          </div>
          {summary.averages ? (
            <p className="ds-note ds-mt">Średnie deskryptorów ({summary.averages.count}): MW <strong>{summary.averages.molWt.toFixed(0)}</strong> · LogP <strong>{summary.averages.logP.toFixed(2)}</strong> · TPSA <strong>{summary.averages.tpsa.toFixed(0)} Å²</strong> · HBD/HBA <strong>{summary.averages.hbd.toFixed(1)}/{summary.averages.hba.toFixed(1)}</strong>. {summary.grounding.note}</p>
          ) : null}
        </Panel>
      ) : null}

      {/* Ranking + interactive Decision Trace */}
      {ranked.length ? (
        <Panel title="Ranking + ślad decyzyjny" icon="chart" className="ds-mt" right={<StatusPill kind="info">silnik Stage 6</StatusPill>}>
          <div className="ds-table-wrap">
            <table className="ds-table rank-table">
              <thead><tr><th>#</th><th>Cząsteczka</th><th>Score</th><th>Rekomendacja</th><th>Dlaczego</th><th></th></tr></thead>
              <tbody>
                {ranked.map((c) => {
                  const meta = VERDICT_META[c.decision.verdict];
                  const open = expanded.has(c.id);
                  return (
                    <Fragment key={c.id}>
                      <tr>
                        <td className="ds-strong">{c.rank}</td>
                        <td><span className="ds-strong">{c.name}</span></td>
                        <td><div className="score-bar"><span style={{ width: `${c.scored.score}%` }} /></div><span className="score-num">{c.scored.score}</span></td>
                        <td><StatusPill kind={meta.kind}><Icon name={meta.icon} size={11} /> {meta.label}</StatusPill></td>
                        <td className="rank-why">{rankingWhy(c).map((w, i) => <div key={i} className={w.startsWith('−') ? 'why-neg' : 'why-pos'}>{w}</div>)}</td>
                        <td><button className="decision-explain-btn" onClick={() => setExpanded((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })}>{open ? 'Ukryj' : 'Ślad'}</button></td>
                      </tr>
                      {open ? <tr><td colSpan={6}><DecisionTraceView trace={decisionTrace(c)} /></td></tr> : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      {/* Molecule lifecycle + timeline */}
      {campaign.molecules.length ? (
        <Panel title="Cykl życia cząsteczek" icon="clock" className="ds-mt" right={<StatusPill kind="info">{campaign.molecules.length} cząsteczek</StatusPill>}>
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead><tr><th>Cząsteczka</th><th>Status</th><th>Etap</th><th>Historia</th><th>Akcje</th></tr></thead>
              <tbody>
                {campaign.molecules.map((m) => (
                  <tr key={m.id}>
                    <td><span className="ds-strong">{m.name}</span><div className="ds-mono rank-smiles" title={m.smiles}>{m.smiles}</div></td>
                    <td><StatusPill kind={m.status === 'ANALYSED' ? 'ok' : m.status === 'INVALID' ? 'blocked' : 'warn'}>{m.status === 'ANALYSED' ? 'OK' : m.status === 'INVALID' ? 'Invalid SMILES' : 'Oczekuje'}</StatusPill>{m.status === 'INVALID' && m.invalidReason ? <div className="ds-dim invalid-reason">{m.invalidReason}</div> : null}</td>
                    <td>{STAGE_LABEL[m.stage]}</td>
                    <td className="timeline-cell">{m.timeline.map((t, i) => <span key={i} className="tl-step">{STAGE_LABEL[t.to]}{i < m.timeline.length - 1 ? ' →' : ''}</span>)}</td>
                    <td className="stage-actions">{m.status === 'ANALYSED' ? STAGE_ACTIONS.map((a) => <button key={a.stage} className="ds-chip" disabled={m.stage === a.stage} onClick={() => setStage(m.id, a.stage)} title={a.label}><Icon name={a.icon} size={12} /></button>) : <span className="ds-dim">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      {/* Full campaign report — the print/PDF surface (reuses Stage 6 matrix + trace) */}
      {summary && ranked.length ? (
        <div className="ds-mt">
          <CampaignReport campaign={campaign} ranked={ranked} summary={summary} referenceId={referenceId} rdkitVersion={rdkitVersion} generatedAt={Date.now()} />
        </div>
      ) : null}
    </ProductChrome>
  );
}
