import { useCallback, useEffect, useState } from 'react';
import { useSession, getSession, getToken } from '../core/backend/session';
import {
  listProjects, listCapabilities, listTargets, createTarget, listCandidates, createCandidate,
  getCandidatePassport, getCandidateRanking,
  type Project, type Capability, type Target, type Candidate, type CandidatePassport, type RankedCandidate,
} from '../core/backend/client';
import { AccountPanel } from './AccountPanel';
import { buildPinnedChEMBLCaffeineDiscovery } from '../core/biotechData/chembl';
import { buildPinnedChEMBLAdenosineDiscovery } from '../core/biotechData/adenosine';
import { buildPinnedChEMBLTheophyllineDiscovery } from '../core/biotechData/theophylline';
import { compareCandidateDiscoveryReports } from '../core/biotechDiscoveryContract';
import { mapPinnedPubChemCaffeine } from '../core/biotechData/pubchem';
import { recordBiotechAdminAudit, replaySavedBiotechComparison, saveBiotechDiscoveryComparisonToMemory } from '../core/scienceMemory';
import { resolveNaturalFunctionalReplacementFromSources, type NaturalFunctionalReplacementResult } from '../core/biotechData/naturalReplacement';

/**
 * Drug Discovery — reachable workspace (P6.9). Uczciwy przepływ na Backend
 * Compute Engine: projekt → cel biologiczny → kandydaci (realna cheminformatyka)
 * → paszport (realne właściwości + WIDOCZNE luki zdolności) → ranking. Nic tu nie
 * udaje dokowania/ADMET/toksyczności ani „leku".
 */

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: 'dostępne', NOT_IMPLEMENTED: 'niezaimplementowane',
  EXTERNAL_ENGINE_REQUIRED: 'wymaga zewn. silnika', MODEL_NOT_VALID_FOR_DOMAIN: 'model poza dziedziną',
};

export function DrugDiscoveryScreen() {
  const session = useSession();
  if (!session) {
    return (
      <main className="settings-view" id="main-content" tabIndex={-1}>
        <section className="settings-section">
          <h2>Drug Discovery</h2>
          <p className="settings-hint">
            Zaloguj się, aby projektować cele biologiczne i oceniać kandydatów obliczeniowych. Platforma liczy realną
            chemię (masa molowa, skład) i JAWNIE oznacza brakujące zdolności (dokowanie, ADMET, toksyczność) — niczego
            nie zmyśla. To nie jest narzędzie diagnostyczne ani deklaracja skuteczności leku.
          </p>
          <AccountPanel />
        </section>
      </main>
    );
  }
  return <DrugWorkspace />;
}

function DrugWorkspace() {
  const routeParams = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const pinnedDiscovery = buildPinnedChEMBLCaffeineDiscovery();
  const adenosineDiscovery = buildPinnedChEMBLAdenosineDiscovery();
  const theophyllineDiscovery = buildPinnedChEMBLTheophyllineDiscovery();
  const pinnedCompound = mapPinnedPubChemCaffeine();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [ranking, setRanking] = useState<RankedCandidate[]>([]);
  const [passport, setPassport] = useState<CandidatePassport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastAuditRequestId, setLastAuditRequestId] = useState<string | null>(null);
  const [biotechReplay, setBiotechReplay] = useState<ReturnType<typeof replaySavedBiotechComparison> | null>(null);
  const [referenceCompound, setReferenceCompound] = useState(() => routeParams.get('reference') ?? '');
  const [referenceTarget, setReferenceTarget] = useState(() => routeParams.get('target') ?? 'A1');
  const [replacementResult, setReplacementResult] = useState<NaturalFunctionalReplacementResult | null>(null);
  const canUseAdminWorkflow = projects.some((project) => project.role === 'owner' || project.role === 'admin');
  const activeReplacementReports = replacementResult?.reports.length ? replacementResult.reports : [pinnedDiscovery.report, adenosineDiscovery.report, theophyllineDiscovery.report];
  const activeReplacementComparison = compareCandidateDiscoveryReports(activeReplacementReports);

  const [targetName, setTargetName] = useState('');
  const [targetIndication, setTargetIndication] = useState('');
  const [candLabel, setCandLabel] = useState('');
  const [candFormula, setCandFormula] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    void listCapabilities().then((r) => { if (r.ok) setCapabilities(r.data); });
    void listProjects(token).then((r) => {
      if (r.ok) {
        const writable = r.data.filter((p) => p.role === 'owner' || p.role === 'admin' || p.role === 'editor');
        setProjects(writable);
        if (writable[0]) setProjectId((cur) => cur || writable[0].id);
      }
    });
  }, []);

  const reload = useCallback(async () => {
    const token = getToken();
    if (!token || !projectId) return;
    const [t, c, r] = await Promise.all([
      listTargets(token, projectId), listCandidates(token, projectId), getCandidateRanking(token, projectId),
    ]);
    if (t.ok) setTargets(t.data);
    if (c.ok) setCandidates(c.data);
    if (r.ok) setRanking(r.data);
  }, [projectId]);

  useEffect(() => { setPassport(null); void reload(); }, [reload]);

  async function addTarget(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token || !projectId || !targetName.trim()) return;
    const r = await createTarget(token, projectId, { name: targetName.trim(), indication: targetIndication.trim() });
    if (r.ok) { setTargetName(''); setTargetIndication(''); setError(null); await reload(); } else setError(r.message);
  }

  async function addCandidate(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token || !projectId || !candFormula.trim()) return;
    const r = await createCandidate(token, projectId, { label: candLabel.trim() || 'Kandydat', formula: candFormula.trim(), targetId: targets[0]?.id });
    if (r.ok) { setCandLabel(''); setCandFormula(''); setError(null); await reload(); } else setError(r.message);
  }

  async function openPassport(candidateId: string) {
    const token = getToken();
    if (!token) return;
    const r = await getCandidatePassport(token, projectId, candidateId);
    if (r.ok) setPassport(r.data); else setError(r.message);
  }

  const rankByCandidate = new Map(ranking.map((r) => [r.candidateId, r]));

  const saveComparison = (destination: 'memory' | 'dossier', candidateId?: string) => {
    const saved = saveBiotechDiscoveryComparisonToMemory(activeReplacementReports, {
      activityIds: replacementResult?.liveActivities?.map((activity) => `chembl:activity:${activity.activityId}`),
      assayIds: replacementResult?.liveActivities?.map((activity) => `chembl:assay:${activity.assayId}`),
    });
    setBiotechReplay(replaySavedBiotechComparison(saved.biotech?.comparison, activeReplacementReports));
    const user = getSession()?.user;
    if (user) {
      setLastAuditRequestId(recordBiotechAdminAudit({
        userId: user.id,
        action: 'save-natural-functional-replacement-comparison',
        provenance: `DrugDiscoveryScreen · ${activeReplacementReports.length} resolved ChEMBL/PubChem/DailyMed records`,
      }).requestId);
    }
    if (destination === 'dossier' && candidateId) {
      window.location.hash = `#/dossier?candidate=${encodeURIComponent(candidateId)}`;
    } else {
      window.location.hash = '#/memory';
    }
  };

  return (
    <main className="settings-view cde-view" id="main-content" tabIndex={-1}>
      <section className="settings-section">
        <h2>Drug Discovery — projektowanie obliczeniowe</h2>
        <p className="settings-hint">
          Uczciwy przepływ: cel → kandydaci → paszport → ranking. Liczymy realną chemię; brakujące zdolności są widoczne.
          „Kandydat obliczeniowy" ≠ lek. Każdy wymaga walidacji laboratoryjnej.
        </p>
        {projects.length === 0 ? (
          <p className="settings-hint">Nie masz projektu z prawem zapisu. Utwórz projekt w zakładce „Projekty".</p>
        ) : (
          <label className="account-field">
            <span>Projekt</span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        {error && <div className="account-error" role="alert">{error}</div>}
      </section>

      {canUseAdminWorkflow ? <section className="settings-section">
        <h2>Natural Functional Replacement · ADMIN</h2>
        <p className="settings-hint">Granica uprawnień: workflow source-backed jest widoczny wyłącznie dla owner/admin projektu. Dane są read-only; ranking oznacza priorytet badań, nie skuteczność ani zamiennik terapeutyczny.</p>
          <form className="account-form" onSubmit={(event) => { event.preventDefault(); void resolveNaturalFunctionalReplacementFromSources({ referenceCompound, target: referenceTarget }).then(setReplacementResult); }}>
          <label className="account-field"><span>Reference compound / lek</span><input value={referenceCompound} onChange={(event) => setReferenceCompound(event.target.value)} placeholder="np. caffeine" /></label>
          <label className="account-field"><span>Target / receptor</span><input value={referenceTarget} onChange={(event) => setReferenceTarget(event.target.value)} placeholder="np. A1" /></label>
          <button className="chip-btn primary" type="submit" disabled={!referenceCompound.trim()}>Pobierz źródła i analizuj</button>
        </form>
        {replacementResult && <div className="cde-verdict" role="status"><strong>{replacementResult.status}</strong> · {replacementResult.reason}{replacementResult.reports.length > 0 && <span> Kandidatów: {replacementResult.reports.length}.</span>}</div>}
        {replacementResult?.liveActivities && <div className="cde-results" aria-label="Live ChEMBL activity evidence">
          <div className="cde-result"><span className="cde-result-label">Live ChEMBL activity</span><span className="cde-result-actual">{replacementResult.liveActivities.length} rekordów</span><span className="cde-result-bound">Ki / IC50 / EC50 nie są agregowane; każdy rekord zachowuje własną metrykę.</span></div>
          {replacementResult.liveActivities.slice(0, 12).map((activity) => <div className="cde-result" key={`${activity.activityId}:${activity.assayId}`}><span className="cde-result-label">{activity.compoundId} → {activity.targetId}</span><span className="cde-result-actual">{activity.type} {activity.relation} {activity.value} {activity.units}</span><span className="cde-result-bound">assay {activity.assayId} · {activity.assayQuality} · {activity.assayContext}</span></div>)}
        </div>}
        {replacementResult?.candidateWhy?.length ? <div className="cde-results" aria-label="Natural candidate WHY">
          {replacementResult.candidateWhy.map((why) => <div className="cde-result" key={why.pubchemCid}><span className="cde-result-label">WHY · PubChem CID {why.pubchemCid}</span><span className="cde-result-actual">{why.rationale}</span><span className="cde-result-bound">target match {why.targetMatchedActivityCount}/{why.activityCount} · types {why.measurementTypes.join(', ') || 'UNKNOWN'} · assay HIGH/MOD/LOW/UNK {why.assayQualityCounts.HIGH}/{why.assayQualityCounts.MODERATE}/{why.assayQualityCounts.LOW}/{why.assayQualityCounts.UNKNOWN} · {why.uncertainty}</span></div>)}
        </div> : null}
        {replacementResult?.reports.length ? <div className="cde-results" aria-label="Resolved natural product reports">
          {replacementResult.reports.map((report) => <div className="cde-result" key={report.reportId}><span className="cde-result-label">{report.candidateId}</span><span className="cde-result-actual">Research priority {(report.ranking?.score ?? 0).toFixed(4)} · {report.scientificEvidenceStatus} · target {report.targetIds.length ? report.targetIds.join(', ') : 'UNKNOWN'}</span><span className="cde-result-bound">safety {report.safetySignalIds.length ? 'SOURCE_STATUS' : 'UNKNOWN'} · ADME/PK/Tox {report.admeProfile?.status ?? 'UNKNOWN'} · validation {report.experimentRequestId ?? 'NOT_EXECUTED / BLOCKED'} · {report.clinicalEfficacy}</span><button className="chip-btn" type="button" onClick={() => saveComparison('dossier', report.candidateId)}>Zapisz i otwórz dossier</button></div>)}
        </div> : null}
        <h2>Źródłowy punkt odniesienia · pinned record</h2>
        <p className="settings-hint">
          To jest read-only rekord z PubChem + ChEMBL, niezależny od kandydatów zapisanych w projekcie. Status wiedzy: `knowledge_only`; nie wykonano eksperymentu biologicznego.
        </p>
        <div className="cde-results">
          <div className="cde-result pass"><span className="cde-result-label">Kandydat</span><span className="cde-result-actual">{pinnedDiscovery.candidate.label}</span><span className="cde-result-bound">{pinnedDiscovery.candidate.id}</span></div>
          <div className="cde-result pass"><span className="cde-result-label">Bioactivity</span><span className="cde-result-actual">{pinnedDiscovery.record.activity.type} {pinnedDiscovery.record.activity.relation} {pinnedDiscovery.record.activity.value} {pinnedDiscovery.record.activity.units}</span><span className="cde-result-bound">ChEMBL {pinnedDiscovery.record.activity.activityId} · assay {pinnedDiscovery.record.activity.assayId} · LITERATURE_SUPPORTED</span></div>
          <div className="cde-result"><span className="cde-result-label">Assay context</span><span className="cde-result-actual">{pinnedDiscovery.record.activity.assayContext}</span><span className="cde-result-bound">in vitro binding record · not efficacy, safety or clinical outcome</span></div>
          <div className="cde-result pass"><span className="cde-result-label">ADME properties</span><span className="cde-result-actual">xLogP {pinnedCompound.adme.xLogP} · TPSA {pinnedCompound.adme.tpsa}</span><span className="cde-result-bound">computed · PubChem {pinnedCompound.adme.sourceId}</span></div>
          {adenosineDiscovery.report.admeProfile && <div className="cde-result"><span className="cde-result-label">Adenosine ADME</span><span className="cde-result-actual">{adenosineDiscovery.report.admeProfile.metrics.map((metric) => `${metric.name}: ${metric.value} ${metric.units}`).join(' · ')}</span><span className="cde-result-bound">DailyMed label · population/product context · not clinical prediction</span></div>}
          {theophyllineDiscovery.report.admeProfile && <div className="cde-result"><span className="cde-result-label">Theophylline ADME</span><span className="cde-result-actual">{theophyllineDiscovery.report.admeProfile.metrics.map((metric) => `${metric.name}: ${metric.value} ${metric.units}`).join(' · ')}</span><span className="cde-result-bound">DailyMed label · population/product context · not clinical prediction</span></div>}
          <div className="cde-result"><span className="cde-result-label">Scientific evidence</span><span className="cde-result-actual">{pinnedDiscovery.report.scientificEvidenceStatus}</span><span className="cde-result-bound">binding record only · source-backed</span></div>
          <div className="cde-result"><span className="cde-result-label">Mechanism</span><span className="cde-result-actual">{pinnedDiscovery.mechanism.status}</span><span className="cde-result-bound">{pinnedDiscovery.mechanism.description}</span></div>
          <div className="cde-result"><span className="cde-result-label">Clinical efficacy</span><span className="cde-result-actual">{pinnedDiscovery.report.clinicalEfficacy}</span><span className="cde-result-bound">no clinical data in this workflow</span></div>
          <div className="cde-result"><span className="cde-result-label">Validation path</span><span className="cde-result-actual">{pinnedDiscovery.report.experimentRequestId ?? 'request unavailable'}</span><span className="cde-result-bound">NOT_EXECUTED / BLOCKED · independent biological assay required</span></div>
          <div className="cde-result"><span className="cde-result-label">Research priority</span><span className="cde-result-actual">{pinnedDiscovery.ranking.score.toFixed(4)}</span><span className="cde-result-bound">PREDICTION · nie efficacy/probability</span></div>
          <div className="cde-result"><span className="cde-result-label">Comparison</span><span className="cde-result-actual">{activeReplacementComparison.rows.length} active resolved candidates</span><span className="cde-result-bound">deterministic research-priority ordering only · not efficacy</span></div>
          <div className="cde-result"><span className="cde-result-label">Adenosine comparator</span><span className="cde-result-actual">{adenosineDiscovery.record.activity.type} {adenosineDiscovery.record.activity.relation} {adenosineDiscovery.record.activity.value} {adenosineDiscovery.record.activity.units}</span><span className="cde-result-bound">{adenosineDiscovery.record.activity.assayId} · ChEMBL + DailyMed label · clinical efficacy UNKNOWN</span></div>
          <div className="cde-result"><span className="cde-result-label">Theophylline comparator</span><span className="cde-result-actual">{theophyllineDiscovery.record.activity.type} {theophyllineDiscovery.record.activity.relation} {theophyllineDiscovery.record.activity.value} {theophyllineDiscovery.record.activity.units}</span><span className="cde-result-bound">{theophyllineDiscovery.record.activity.assayId} · ChEMBL + DailyMed label · clinical efficacy UNKNOWN</span></div>
        </div>
        <button className="chip-btn primary" type="button" onClick={() => saveComparison('memory')}>Zapisz {activeReplacementReports.length} raportów w Scientific Memory</button>
        {biotechReplay && <div className="cde-verdict" role="status"><strong>Replay {biotechReplay.status}</strong> · {biotechReplay.reason}</div>}
        {lastAuditRequestId && <p className="settings-hint" role="status">Audit request: {lastAuditRequestId}</p>}
        <p className="settings-hint">Provenance: <a href={pinnedDiscovery.report.provenance[0]?.sourceUrl ?? '#'} target="_blank" rel="noreferrer">ChEMBL / PubChem source records</a>. Safety signal i toksykologia pozostają osobnymi, source-backed statusami.</p>
      </section> : <section className="settings-section" role="status">
        <h2>Natural Functional Replacement · ADMIN</h2>
        <p className="settings-hint">Brak uprawnień owner/admin dla projektu. Zaawansowany workflow pozostaje ukryty; nie wykonano wyszukiwania, rankingu ani walidacji biologicznej.</p>
      </section>}

      <section className="settings-section">
        <h2>Cel biologiczny</h2>
        <div className="member-list">
          {targets.map((t) => (
            <div className="member-row" key={t.id}>
              <span className="member-name">{t.name} {t.indication && <span className="account-email">{t.indication}</span>}</span>
              <span className="project-role">{t.evidenceStatus}</span>
            </div>
          ))}
        </div>
        <form className="account-form" onSubmit={addTarget}>
          <label className="account-field"><span>Nazwa celu (gen/białko)</span>
            <input type="text" value={targetName} onChange={(e) => setTargetName(e.target.value)} placeholder="np. EGFR" /></label>
          <label className="account-field"><span>Wskazanie</span>
            <input type="text" value={targetIndication} onChange={(e) => setTargetIndication(e.target.value)} placeholder="np. NSCLC" /></label>
          <button className="chip-btn" type="submit" disabled={!targetName.trim()}>Zdefiniuj cel</button>
        </form>
      </section>

      <section className="settings-section">
        <h2>Kandydaci molekularni</h2>
        <form className="account-form" onSubmit={addCandidate}>
          <label className="account-field"><span>Etykieta</span>
            <input type="text" value={candLabel} onChange={(e) => setCandLabel(e.target.value)} placeholder="np. Aspiryna (ref)" /></label>
          <label className="account-field"><span>Wzór sumaryczny (v1: bez nawiasów)</span>
            <input type="text" value={candFormula} onChange={(e) => setCandFormula(e.target.value)} placeholder="np. C9H8O4" /></label>
          <button className="chip-btn primary" type="submit" disabled={!candFormula.trim()}>Dodaj kandydata</button>
        </form>
        <div className="trial-list">
          {candidates.map((c) => {
            const rk = rankByCandidate.get(c.id);
            return (
              <div className="trial-row" key={c.id}>
                {rk && <span className="trial-idx">#{rk.rank}</span>}
                <span className="trial-label">{c.label} <span className="cloud-modelver">{c.formula}</span></span>
                <span className="cloud-modelver">{c.molecularWeight ? `${c.molecularWeight.toFixed(2)} g/mol` : '—'}</span>
                <button className="chip-btn tiny" onClick={() => openPassport(c.id)}>paszport</button>
              </div>
            );
          })}
        </div>
      </section>

      {passport && (
        <section className="settings-section">
          <h2>Paszport kandydata · {passport.label}</h2>
          <div className="cde-verdict rejected" role="status" style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}>
            {passport.verdict}
          </div>

          <div className="section-label">Tożsamość i struktura</div>
          <div className="cde-results">
            <div className="cde-result"><span className="cde-result-label">Candidate ID</span><span className="cde-result-actual">{passport.candidateId}</span></div>
            <div className="cde-result"><span className="cde-result-label">Target ID</span><span className="cde-result-actual">{passport.targetId ?? 'NOT_AVAILABLE'}</span></div>
            <div className="cde-result"><span className="cde-result-label">Formula</span><span className="cde-result-actual">{passport.representation.formula ?? 'NOT_AVAILABLE'}</span></div>
            <div className="cde-result"><span className="cde-result-label">SMILES</span><span className="cde-result-actual">{passport.representation.smiles ?? 'NOT_AVAILABLE'}</span></div>
            <div className="cde-result"><span className="cde-result-label">Charge</span><span className="cde-result-actual">{passport.representation.charge}</span></div>
          </div>

          <div className="section-label">Modele i źródło</div>
          <div className="cde-results">
            {passport.modelsExecuted.length > 0 ? passport.modelsExecuted.map((model) => (
              <div className="cde-result" key={`${model.modelId}-${model.version ?? 'unknown'}`}>
                <span className="project-role role-owner">{model.status}</span>
                <span className="cde-result-label">{model.modelId}</span>
                <span className="cde-result-actual">{model.version ?? 'VERSION_UNKNOWN'}</span>
              </div>
            )) : <div className="cde-reason">NOT_AVAILABLE — brak zarejestrowanego modelu wykonawczego.</div>}
          </div>
          <p className="settings-hint">Źródło zewnętrzne: NOT_AVAILABLE w tym paszporcie. Nie traktuj identyfikatora kandydata jako dowodu pochodzenia.</p>

          <div className="section-label">Policzone właściwości (realne)</div>
          <div className="cde-results">
            {Object.keys(passport.calculatedProperties).length > 0 ? Object.entries(passport.calculatedProperties).map(([k, v]) => (
              <div className="cde-result pass" key={k}>
                <span className="cde-result-label">{k}</span>
                <span className="cde-result-actual">{typeof v === 'number' ? v.toFixed(3) : String(v)}</span>
              </div>
            )) : <div className="cde-reason">NOT_AVAILABLE — brak policzonych właściwości.</div>}
          </div>

          <div className="section-label">Składniki oceny</div>
          {passport.scoreComponents.map((s) => (
            <div className="cde-result" key={s.id}>
              <span className={`project-role ${s.kind === 'heuristic' ? 'role-editor' : 'role-owner'}`}>{s.kind === 'heuristic' ? 'heurystyka' : 'obliczone'}</span>
              <span className="cde-result-label">{s.label}</span>
              <span className="cde-result-actual">{s.value}{s.unit ? ` ${s.unit}` : ''}</span>
              {s.note && <span className="cde-result-bound">{s.note}</span>}
            </div>
          ))}

          <div className="section-label">Luki zdolności (CAPABILITY GAP DETECTED)</div>
          <div className="cde-market">
            {passport.capabilityGaps.map((g) => (
              <div className="cde-listing" key={g.id}>
                <span className="cde-listing-name">{g.label}</span>
                <span className="project-role role-viewer">{STATUS_LABEL[g.status] ?? g.status}</span>
              </div>
            ))}
          </div>

          <div className="section-label">Rekomendowane pomiary / obliczenia</div>
          {passport.measurementRecommendations.map((m) => (
            <div className="cde-reason" key={m.capability}>• {m.label} — {m.requires ?? STATUS_LABEL[m.status]}</div>
          ))}

          <div className="section-label">Wymagana walidacja laboratoryjna</div>
          {passport.requiredLaboratoryValidation.map((v, i) => <div className="cde-reason" key={i}>• {v}</div>)}

          <p className="settings-hint">Niepewność: {passport.uncertainty} · runIds: {passport.runIds.join(', ')}</p>
        </section>
      )}

      <section className="settings-section">
        <h2>Manifest zdolności obliczeniowych</h2>
        <p className="settings-hint">Co Genesis Lab realnie liczy, a co wymaga zewnętrznego silnika. Metody niedostępne NIGDY nie zwracają zmyślonych liczb.</p>
        <div className="cde-market">
          {capabilities.map((c) => (
            <div className="cde-listing" key={c.id}>
              <span className="cde-listing-name">{c.label}</span>
              <span className={`project-role ${c.status === 'AVAILABLE' ? 'role-owner' : 'role-viewer'}`}>{STATUS_LABEL[c.status] ?? c.status}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
