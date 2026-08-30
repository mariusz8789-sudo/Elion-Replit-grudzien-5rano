import { useMemo, useState } from 'react';
import {
  listExperiments,
  replaySavedBiotechDiscoveryArtifact,
  type SavedBiotechActivityRecord,
  type SavedBiotechComputeRun,
  type SavedBiotechDiscoveryArtifact,
  type SavedBiotechSourceRecord,
  type SavedExperiment,
} from '../core/scienceMemory';
import type { CandidateDiscoveryReport } from '../core/biotechDiscoveryContract';

function candidateCid(candidateId: string): number | undefined {
  const match = candidateId.match(/pubchem:(\d+)/);
  return match ? Number(match[1]) : undefined;
}

function valueOf(value: unknown): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'UNKNOWN';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function sourceUrl(source: SavedBiotechSourceRecord): string {
  return `https://pubchem.ncbi.nlm.nih.gov/compound/${source.cid}`;
}

function downloadDossier(record: SavedExperiment, artifact: SavedBiotechDiscoveryArtifact, report: CandidateDiscoveryReport): void {
  const payload = { exportedAt: new Date().toISOString(), recordId: record.id, artifact, selectedCandidate: report };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `candidate-dossier-${(candidateCid(report.candidateId) ?? report.candidateId).toString()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function Stat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="stat-row"><span>{label}</span><span className={mono ? 'val mono' : 'val'}>{value}</span></div>;
}

export function CandidateDossierScreen() {
  const [records] = useState(() => listExperiments().filter((record) => record.biotech?.artifact));
  const [replay, setReplay] = useState<string | null>(null);
  const query = window.location.hash.split('?')[1] ?? '';
  const candidateQuery = new URLSearchParams(query).get('candidate');
  const selected = useMemo(() => {
    const record = records.find((item) => item.biotech?.artifact?.reports.some((report) => report.candidateId === candidateQuery)) ?? records[0];
    const artifact = record?.biotech?.artifact;
    if (!record || !artifact) return undefined;
    const report = artifact.reports.find((item) => item.candidateId === candidateQuery)
      ?? [...artifact.reports].sort((a, b) => (b.ranking?.score ?? -1) - (a.ranking?.score ?? -1))[0];
    if (!report) return undefined;
    const cid = candidateCid(report.candidateId);
    const source = artifact.sourceRecords?.find((item) => item.cid === cid);
    const runs = artifact.computeRuns.filter((run) => run.candidateId === report.candidateId);
    const activityRecords = (artifact.activityRecords ?? []).filter((activity) => activity.pubchemCid === cid);
    return { record, artifact, report, source, runs, activityRecords };
  }, [candidateQuery, records]);

  if (!selected) {
    return <main className="settings-view" id="main-content" tabIndex={-1}><section className="settings-section"><h2>Candidate Dossier</h2><p className="empty-state">Brak zapisanego Discovery Artifact. Uruchom w Science Chat pytanie o naturalnych kandydatów, aby zbudować dossier z realnego źródła.</p><button className="chip-btn" onClick={() => { window.location.hash = '#/drug?reference=caffeine&target=A1'; }}>Otwórz Drug Discovery</button></section></main>;
  }

  const { record, artifact, report, source, runs, activityRecords } = selected;
  const cid = candidateCid(report.candidateId);
  const replayLineage = { activityIds: artifact.activityIds, assayIds: artifact.assayIds, computeRuns: artifact.computeRuns, sourceRecords: artifact.sourceRecords, activityRecords: artifact.activityRecords, neurobiology: artifact.neurobiology };
  const replayArtifact = (mode: 'match' | 'drift' | 'blocked') => {
    const result = mode === 'blocked'
      ? replaySavedBiotechDiscoveryArtifact(undefined, [])
      : replaySavedBiotechDiscoveryArtifact(artifact, artifact.reports, mode === 'drift' ? { ...replayLineage, activityIds: [...artifact.activityIds, 'controlled-drift'] } : replayLineage);
    setReplay(`${result.status} — ${result.reason}`);
  };
  const successfulRuns = runs.filter((run) => run.status === 'completed' || run.status === 'ok');

  return (
    <main className="settings-view dossier-view" id="main-content" tabIndex={-1}>
      <section className="dossier-hero">
        <div>
          <p className="dossier-kicker">INVESTOR / SCIENTIST VIEW · SOURCE-BACKED</p>
          <h2>Candidate Dossier</h2>
          <p className="dossier-title">{source?.name ?? report.candidateId}</p>
          <p className="settings-hint">Jedna spójna ścieżka: identity → evidence → compute → ranking → WHY → validation → Memory → Replay.</p>
        </div>
        <div className="dossier-status"><strong>{report.epistemicStatus}</strong><span>{report.clinicalEfficacy} clinical efficacy</span><span>{successfulRuns.length}/{runs.length} compute OK</span></div>
      </section>

      <section className="dossier-flow" aria-label="Investor flow">
        {['REAL SOURCE', 'EVIDENCE', 'COMPUTE', 'RANKING / WHY', 'VALIDATION', 'MEMORY / REPLAY'].map((stage, index) => <div className="dossier-flow-step" key={stage}><span>{String(index + 1).padStart(2, '0')}</span>{stage}</div>)}
      </section>

      <section className="settings-section dossier-card">
        <h2>1 · Identity & structure</h2>
        <div className="stat-list">
          <Stat label="Candidate ID" value={report.candidateId} mono />
          <Stat label="Report ID" value={report.reportId} mono />
          <Stat label="PubChem CID" value={cid ? String(cid) : 'UNKNOWN'} mono />
          <Stat label="Material / compound" value={`${report.materialId} · ${report.compoundIds.join(', ') || 'UNKNOWN'}`} mono />
          <Stat label="Formula" value={source?.formula ?? 'UNKNOWN'} />
          <Stat label="Molecular weight" value={source?.molecularWeight ?? 'UNKNOWN'} />
          <Stat label="InChIKey" value={source?.inchiKey ?? 'UNKNOWN'} mono />
          <Stat label="Canonical SMILES" value={source?.smiles ?? 'UNKNOWN'} mono />
          <Stat label="3D conformer" value={source?.atoms3d ? `${source.atoms3d.length} source atoms` : 'NOT_AVAILABLE'} />
        </div>
        {source && <p className="settings-hint">Źródło: {source.source} · {source.sourceVersion} · retrieved {source.retrievedAt} · <a href={sourceUrl(source)} target="_blank" rel="noreferrer">otwórz PubChem</a></p>}
      </section>

      <section className="settings-section dossier-card">
        <h2>2 · Target, activity & evidence</h2>
        <div className="stat-list">
          <Stat label="Target IDs" value={report.targetIds.join(', ') || [...new Set(activityRecords.map((activity) => activity.targetId))].join(', ') || 'UNKNOWN'} mono />
          <Stat label="Mechanism IDs" value={report.mechanismIds.join(', ') || 'UNKNOWN'} mono />
          <Stat label="Evidence IDs" value={report.evidenceIds.join(', ') || 'UNKNOWN'} mono />
          <Stat label="Safety signal IDs" value={report.safetySignalIds.join(', ') || 'UNKNOWN'} mono />
          <Stat label="Activity lineage" value={artifact.activityIds.filter((id) => id.includes(String(cid ?? ''))).join(', ') || `${artifact.activityIds.length} saved activity IDs`} mono />
          <Stat label="Assay lineage" value={`${artifact.assayIds.length} saved assay IDs`} />
          <Stat label="Scientific evidence" value={report.scientificEvidenceStatus} />
          <Stat label="Clinical efficacy" value={report.clinicalEfficacy} />
        </div>
        {activityRecords.length > 0 ? <div className="dossier-evidence-list">{activityRecords.slice(0, 12).map((activity: SavedBiotechActivityRecord) => <div className="dossier-evidence-row" key={`${activity.activityId}:${activity.assayId}`}><strong>{activity.type} {activity.relation} {activity.value} {activity.units}</strong><span>{activity.compoundId} → {activity.targetId} · assay {activity.assayId} · {activity.assayQuality}</span><small>{activity.assayContext}</small></div>)}</div> : <p className="settings-hint">Brak pełnych activity records w zapisanym artifact; zachowane są tylko lineage IDs.</p>}
        <p className="dossier-boundary">Binding evidence is not efficacy. Safety and clinical outcome remain UNKNOWN unless separately source-backed.</p>
      </section>

      <section className="settings-section dossier-card">
        <h2>3 · Real compute lineage</h2>
        {runs.length === 0 ? <p className="settings-hint">Brak compute lineage dla tego kandydata.</p> : <div className="dossier-compute-list">{runs.map((run: SavedBiotechComputeRun) => <details className="dossier-compute" key={`${run.runId}:${run.runFingerprint}`} open={run.status === 'ok' || run.status === 'completed'}><summary><strong>{run.status.toUpperCase()}</strong> · {run.runId} · {run.resultOrigin}</summary><p className="settings-hint">{run.summary}</p><div className="stat-list">{Object.entries(run.outputs).map(([key, value]) => <Stat key={key} label={key} value={valueOf(value)} mono />)}</div><p className="settings-hint mono">fingerprint: {run.runFingerprint}</p></details>)}</div>}
      </section>

      <section className="settings-section dossier-card dossier-highlight">
        <h2>4 · Ranking & WHY</h2>
        <div className="stat-list">
          <Stat label="Research priority" value={report.ranking ? report.ranking.score.toFixed(4) : 'UNKNOWN'} />
          <Stat label="Ranking status" value={report.ranking?.epistemicStatus ?? 'UNKNOWN'} />
          <Stat label="Rationale" value={report.ranking?.rationale ?? 'UNKNOWN'} />
          <Stat label="Uncertainty penalty" value={report.ranking ? String(report.ranking.components.uncertaintyPenalty) : 'UNKNOWN'} />
        </div>
        <blockquote>{report.uncertainty}</blockquote>
      </section>

      <section className="settings-section dossier-card">
        <h2>5 · Validation bridge</h2>
        <div className="stat-list">
          <Stat label="Hypothesis" value={report.hypothesisId} mono />
          <Stat label="Validation request" value={report.experimentRequestId ?? 'NOT_EXECUTED / BLOCKED'} mono />
          <Stat label="Artifact limitations" value={artifact.limitations.join(' ')} />
          <Stat label="Memory record" value={record.id} mono />
        </div>
        <p className="dossier-boundary">Następny krok laboratoryjny wymaga niezależnego target-specific assay, pre-registered design i osobnego pomiaru. Żaden model estimate nie jest tu przedstawiony jako obserwacja.</p>
      </section>

      <section className="settings-section dossier-card">
        <h2>6 · Memory & Replay integrity</h2>
        <div className="stat-list">
          <Stat label="Artifact fingerprint" value={artifact.artifactFingerprint} mono />
          <Stat label="Candidates in artifact" value={String(artifact.candidateIds.length)} />
          <Stat label="Source IDs" value={String(artifact.sourceIds.length)} />
          <Stat label="Compute runs" value={String(artifact.computeRuns.length)} />
          <Stat label="Source structures" value={String(artifact.sourceRecords?.length ?? 0)} />
        </div>
        {replay && <p className="dossier-replay" role="status">{replay}</p>}
        <div className="pilot-actions">
          <button className="chip-btn pilot-primary" onClick={() => replayArtifact('match')}>Replay artifact</button>
          <button className="chip-btn" onClick={() => replayArtifact('drift')}>Test DRIFT</button>
          <button className="chip-btn" onClick={() => replayArtifact('blocked')}>Test BLOCKED</button>
          <button className="chip-btn" onClick={() => downloadDossier(record, artifact, report)}>Eksportuj dossier JSON</button>
          <button className="chip-btn" onClick={() => { window.location.hash = '#/memory'; }}>Wróć do Memory</button>
          <button className="chip-btn" onClick={() => { window.location.hash = '#/drug?reference=caffeine&target=A1'; }}>Otwórz workspace</button>
        </div>
      </section>
    </main>
  );
}
