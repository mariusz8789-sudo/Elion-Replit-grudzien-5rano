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
import { buildCandidateCombinationHypothesis, compareCandidateDiscoveryReports, rankNaturalCompositionHypotheses, COMPOSITION_RANKING_CRITERIA } from '../core/biotechDiscoveryContract';
import { buildNaturalFormulationDossier } from '../core/naturalFormulationDossier';
import { executeCompositionCompute, fabricCompositionComputeExecutor, planCompositionCompute, type CompositionComputeReport } from '../core/naturalCompositionCompute';
import { naturalCandidateStructures } from '../core/biotechData/naturalReplacement';
import { runFabricCompute } from '../core/backend/client';
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
  BLOCKED_BY_RUNTIME: 'zablokowane przez runtime',
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
  // Per-hypothesis compute: realne runy backendowego Fabric na wejściach, które
  // kandydat faktycznie posiada. Pusty stan = compute nie był uruchamiany.
  const [compositionCompute, setCompositionCompute] = useState<CompositionComputeReport[]>([]);
  const [computeBusy, setComputeBusy] = useState(false);
  const [computeNotice, setComputeNotice] = useState<string | null>(null);
  const [referenceCompound, setReferenceCompound] = useState(() => routeParams.get('reference') ?? '');
  const [referenceTarget, setReferenceTarget] = useState(() => routeParams.get('target') ?? 'A1');
  const [replacementResult, setReplacementResult] = useState<NaturalFunctionalReplacementResult | null>(null);
  const [naturalDiscoveryBusy, setNaturalDiscoveryBusy] = useState(false);
  const [selectedNaturalReportIds, setSelectedNaturalReportIds] = useState<string[]>([]);
  const canUseAdminWorkflow = projects.some((project) => project.role === 'owner' || project.role === 'admin');
  const activeReplacementReports = replacementResult?.reports.length ? replacementResult.reports : [pinnedDiscovery.report, adenosineDiscovery.report, theophyllineDiscovery.report];
  const activeReplacementComparison = compareCandidateDiscoveryReports(activeReplacementReports);
  const selectedNaturalReports = activeReplacementReports.filter((report) => selectedNaturalReportIds.includes(report.reportId));
  const selectedCombinationHypothesis = selectedNaturalReports.length === 2
    ? buildCandidateCombinationHypothesis(selectedNaturalReports, referenceTarget ? [referenceTarget] : [])
    : undefined;
  // TOP 3 alternatywnych kompozycji ze WSZYSTKICH par dostępnych raportów —
  // ręczny wybór dwóch pokazuje jedną parę, ten ranking pokazuje, czy istnieje
  // lepsza. Kryteria są jawne (COMPOSITION_RANKING_CRITERIA), nie ważone.
  const rankedCompositionHypotheses = rankNaturalCompositionHypotheses(
    activeReplacementReports,
    referenceTarget ? [referenceTarget] : [],
    3,
  );
  // Ranking mówi, KTÓRA para jest wyżej. Dossier mówi, co z tym zrobić: skąd
  // składnik, dlaczego akurat on, co wnosi sam, co jest policzone, czego
  // brakuje i jaki eksperyment to rozstrzygnie.
  const formulationDossier = buildNaturalFormulationDossier({
    reports: activeReplacementReports,
    requestedTargetIds: referenceTarget ? [referenceTarget] : [],
    referenceLabel: pinnedDiscovery.candidate.label,
    limit: 3,
    computeReports: compositionCompute,
  });

  /**
   * Uruchamia dopuszczalne runtime'y dla KAŻDEJ z TOP 3 kompozycji. Nie liczy
   * niczego lokalnie: każdy wynik pochodzi z backendowego Fabric razem z jego
   * runId. Runtime bez wejścia albo nieskonfigurowany zostaje odnotowany ze
   * swoim statusem, a nie pominięty.
   */
  const runCompositionCompute = async () => {
    setComputeBusy(true);
    setComputeNotice(null);
    try {
      const executor = fabricCompositionComputeExecutor(runFabricCompute);
      const structures = naturalCandidateStructures();
      const reports: CompositionComputeReport[] = [];
      for (const hypothesis of rankedCompositionHypotheses) {
        reports.push(await executeCompositionCompute(planCompositionCompute(hypothesis, structures), executor));
      }
      setCompositionCompute(reports);
      const executed = reports.reduce((sum, entry) => sum + entry.executedRunCount, 0);
      const planned = reports.reduce((sum, entry) => sum + entry.runtimes.reduce((inner, runtime) => inner + runtime.componentRecords.length, 0), 0);
      setComputeNotice(`Wykonano ${executed} z ${planned} zaplanowanych obliczeń dla ${reports.length} kompozycji. Pozostałe niosą status MISSING_DATA albo BLOCKED wraz z powodem — żadna wartość nie została doszacowana.`);
    } catch (computeError) {
      setComputeNotice(`Per-hypothesis compute nie wykonał się: ${computeError instanceof Error ? computeError.message : String(computeError)}`);
    } finally {
      setComputeBusy(false);
    }
  };
  const toggleNaturalReport = (reportId: string) => setSelectedNaturalReportIds((current) => current.includes(reportId)
    ? current.filter((id) => id !== reportId)
    : current.length < 2 ? [...current, reportId] : current);

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

  async function runNaturalDiscovery() {
    if (!referenceCompound.trim() || naturalDiscoveryBusy) return;
    setNaturalDiscoveryBusy(true);
    try {
      const result = await resolveNaturalFunctionalReplacementFromSources({ referenceCompound, target: referenceTarget });
      setReplacementResult(result);
    } finally {
      setNaturalDiscoveryBusy(false);
    }
  }

  const saveComparison = (destination: 'memory' | 'dossier', candidateId?: string) => {
    const saved = saveBiotechDiscoveryComparisonToMemory(activeReplacementReports, {
      activityIds: replacementResult?.liveActivities?.map((activity) => `chembl:activity:${activity.activityId}`),
      assayIds: replacementResult?.liveActivities?.map((activity) => `chembl:assay:${activity.assayId}`),
      sourceRecords: replacementResult?.sourceRecords,
      activityRecords: replacementResult?.liveActivities,
      neurobiology: replacementResult?.neurobiology,
      // Wykonane obliczenia idą do pamięci razem z raportami — inaczej realny
      // run z jego runId znikał przy przeładowaniu.
      compositionCompute: compositionCompute.length ? compositionCompute : undefined,
      // Bez tego zapisany artefakt liczył pokrycie targetów względem pustej
      // listy, więc `uncoveredTargetIds` zawsze wychodziło puste.
      requestedTargetIds: referenceTarget ? [referenceTarget] : [],
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
          <form className="account-form" onSubmit={(event) => { event.preventDefault(); void runNaturalDiscovery(); }}>
          <label className="account-field"><span>Reference compound / lek</span><input value={referenceCompound} onChange={(event) => setReferenceCompound(event.target.value)} placeholder="np. caffeine" /></label>
          <label className="account-field"><span>Target / receptor</span><input value={referenceTarget} onChange={(event) => setReferenceTarget(event.target.value)} placeholder="np. A1" /></label>
          <button className="chip-btn primary" type="submit" disabled={!referenceCompound.trim() || naturalDiscoveryBusy}>{naturalDiscoveryBusy ? 'Pobieram źródła…' : 'Pobierz źródła i analizuj'}</button>
        </form>
        {replacementResult && <div className="cde-verdict" role="status"><strong>{replacementResult.status}</strong> · {replacementResult.reason}{replacementResult.reports.length > 0 && <span> Kandidatów: {replacementResult.reports.length}.</span>}{replacementResult.status === 'BLOCKED' && <button className="chip-btn" type="button" onClick={() => void runNaturalDiscovery()} disabled={naturalDiscoveryBusy}>{naturalDiscoveryBusy ? 'Ponawiam…' : 'Ponów retrieval'}</button>}</div>}
        {replacementResult?.liveActivities && <div className="cde-results" aria-label="Live ChEMBL activity evidence">
          <div className="cde-result"><span className="cde-result-label">Live ChEMBL activity</span><span className="cde-result-actual">{replacementResult.liveActivities.length} rekordów</span><span className="cde-result-bound">Ki / IC50 / EC50 nie są agregowane; każdy rekord zachowuje własną metrykę.</span></div>
          {replacementResult.liveActivities.slice(0, 12).map((activity) => <div className="cde-result" key={`${activity.activityId}:${activity.assayId}`}><span className="cde-result-label">{activity.compoundId} → {activity.targetId}</span><span className="cde-result-actual">{activity.type} {activity.relation} {activity.value} {activity.units}</span><span className="cde-result-bound">assay {activity.assayId} · {activity.assayQuality} · {activity.assayContext}</span></div>)}
        </div>}
        {replacementResult?.candidateWhy?.length ? <div className="cde-results" aria-label="Natural candidate WHY">
          {replacementResult.candidateWhy.map((why) => <div className="cde-result" key={why.pubchemCid}><span className="cde-result-label">WHY · PubChem CID {why.pubchemCid}</span><span className="cde-result-actual">{why.rationale}</span><span className="cde-result-bound">target match {why.targetMatchedActivityCount}/{why.activityCount} · types {why.measurementTypes.join(', ') || 'UNKNOWN'} · assay HIGH/MOD/LOW/UNK {why.assayQualityCounts.HIGH}/{why.assayQualityCounts.MODERATE}/{why.assayQualityCounts.LOW}/{why.assayQualityCounts.UNKNOWN} · {why.uncertainty}</span></div>)}
        </div> : null}
        {replacementResult?.reports.length ? <div className="cde-results" aria-label="Resolved natural product reports">
          {replacementResult.reports.map((report) => <div className="cde-result" key={report.reportId}><label className="cde-result-label"><input type="checkbox" checked={selectedNaturalReportIds.includes(report.reportId)} onChange={() => toggleNaturalReport(report.reportId)} disabled={!selectedNaturalReportIds.includes(report.reportId) && selectedNaturalReportIds.length >= 2} /> {report.candidateId}</label><span className="cde-result-actual">Research priority {(report.ranking?.score ?? 0).toFixed(4)} · {report.scientificEvidenceStatus} · target {report.targetIds.length ? report.targetIds.join(', ') : 'UNKNOWN'}</span><span className="cde-result-bound">safety {report.safetySignalIds.length ? 'SOURCE_STATUS' : 'UNKNOWN'} · ADME/PK/Tox {report.admeProfile?.status ?? 'UNKNOWN'} · validation {report.experimentRequestId ?? 'NOT_EXECUTED / BLOCKED'} · {report.clinicalEfficacy}</span><button className="chip-btn" type="button" onClick={() => saveComparison('dossier', report.candidateId)}>Zapisz i otwórz dossier</button></div>)}
        </div> : null}
        {replacementResult?.reports.length ? <section className="settings-section dossier-card" aria-label="Natural composition analysis">
          <h3>Natural Composition Discovery · top 2</h3>
          <p className="settings-hint">Wybierz dokładnie dwa istniejące raporty źródłowe. To deterministyczna hipoteza badawcza, nie dowód synergii ani skuteczności.</p>
          <p className="settings-hint" role="status">Wybrano {selectedNaturalReports.length}/2 · compute: NOT_EXECUTED</p>
          {selectedCombinationHypothesis ? <div className="cde-results">
            <div className="cde-result"><span className="cde-result-label">Combination ID</span><span className="cde-result-actual">{selectedCombinationHypothesis.combinationId}</span><span className="cde-result-bound">status {selectedCombinationHypothesis.status} · priority {selectedCombinationHypothesis.researchPriority.toFixed(4)}</span></div>
            <div className="cde-result"><span className="cde-result-label">Evidence / targets</span><span className="cde-result-actual">{selectedCombinationHypothesis.coveredEvidenceIds.length} evidence · {selectedCombinationHypothesis.coveredTargetIds.join(', ') || 'UNKNOWN'}</span><span className="cde-result-bound">mechanisms {selectedCombinationHypothesis.coveredMechanismIds.join(', ') || 'UNKNOWN'} · missing {selectedCombinationHypothesis.missingEvidenceIds.join(', ') || 'none declared'}</span></div>
            <div className="cde-result"><span className="cde-result-label">Uncertainty</span><span className="cde-result-actual">{selectedCombinationHypothesis.uncertainty}</span><span className="cde-result-bound">validation required; no synergy/efficacy/safety conclusion</span></div>
            {selectedCombinationHypothesis.validationPlan.map((step) => <div className="cde-result" key={step}><span className="cde-result-label">NEXT VALIDATION</span><span className="cde-result-actual">{step}</span></div>)}
          </div> : <div className="cde-verdict">Wybierz jeszcze {2 - selectedNaturalReports.length} raport(y), aby utworzyć composition hypothesis.</div>}
        </section> : null}
        {rankedCompositionHypotheses.length ? <section className="settings-section dossier-card" aria-label="Top natural composition hypotheses">
          <h3>Natural Composition Hypotheses · TOP {rankedCompositionHypotheses.length}</h3>
          <p className="settings-hint">
            Wszystkie pary dostępnych raportów, uszeregowane jawnymi kryteriami: {COMPOSITION_RANKING_CRITERIA.join(' → ')}.
            Kolejność jest leksykograficzna, nie ważona — nie ma tu jednej wymyślonej liczby podobieństwa.
          </p>
          <p className="settings-hint">
            Każda pozycja to HIPOTEZA BADAWCZA. Genesis nie twierdzi, że którakolwiek kompozycja jest zamiennikiem
            leku ani że jest klinicznie równoważna — do tego potrzebne są badania z planu walidacji.
          </p>
          <div className="cde-results">
            {rankedCompositionHypotheses.map((entry) => <div className="cde-result" key={entry.combinationId}>
              <span className="cde-result-label">#{entry.rank} · {entry.candidateIds.join(' + ')}</span>
              <span className="cde-result-actual">{entry.rankingRationale.join(' ')}</span>
              <span className="cde-result-bound">
                status {entry.status} · targets {entry.coveredTargetIds.join(', ') || 'UNKNOWN'} ·
                evidence {entry.rankingBasis.coveredEvidenceCount} ·
                bez evidence {entry.rankingBasis.missingEvidenceCount} ·
                nie pokryte targety {entry.rankingBasis.uncoveredTargetCount} ·
                priorytet {entry.rankingBasis.researchPriority.toFixed(4)}
              </span>
            </div>)}
          </div>
        </section> : null}
        {formulationDossier.hypotheses.length ? <section className="settings-section dossier-card" aria-label="Natural formulation hypothesis dossier">
          <h3>Dossier hipotez kompozycji · {formulationDossier.hypotheses.length} kompozycje</h3>
          <p className="settings-hint">
            Referencja: {formulationDossier.referenceLabel}. Dla każdej kompozycji: składniki, źródło, dlaczego dany
            składnik, pokrycie targetów i mechanizmów, własności, evidence, wykonane obliczenia, niepewność, braki
            i eksperyment walidacyjny. Odcisk dossier: <span className="mono">{formulationDossier.dossierFingerprint}</span>.
          </p>
          <ul className="pilot-limitations">
            {formulationDossier.exclusions.map((exclusion) => <li key={exclusion}>{exclusion}</li>)}
          </ul>
          <div className="pilot-actions">
            <button className="chip-btn pilot-primary" disabled={computeBusy} onClick={() => { void runCompositionCompute(); }}>
              {computeBusy ? 'Liczę…' : 'Uruchom compute dla każdej kompozycji'}
            </button>
          </div>
          {computeNotice && <p className="settings-hint" role="status">{computeNotice}</p>}
          {formulationDossier.unfilledFields.length > 0 && (
            <details className="settings-details" open>
              <summary>Pola, których NIE dało się wypełnić z danych ({formulationDossier.unfilledFields.length})</summary>
              {formulationDossier.unfilledFields.map((field) => <p className="settings-hint" key={field}>{field}</p>)}
            </details>
          )}
          {formulationDossier.hypotheses.map((hypothesis) => (
            <details className="settings-details" key={hypothesis.combinationId} open={hypothesis.rank === 1}>
              <summary>{hypothesis.label} · {hypothesis.status} · {hypothesis.clinicalClaim}</summary>
              <p className="settings-hint"><strong>DLACZEGO:</strong> {hypothesis.why.join(' ')}</p>
              <p className="settings-hint">
                <strong>POKRYCIE:</strong> targety {hypothesis.coveredTargetIds.join(', ') || 'brak'} ·
                mechanizmy {hypothesis.coveredMechanismIds.join(', ') || 'brak'} ·
                niepokryte {hypothesis.uncoveredTargetIds.join(', ') || 'brak'}
              </p>
              <p className="settings-hint">
                <strong>WŁASNOŚCI:</strong> {hypothesis.propertyStatus} · <strong>COMPUTE:</strong> {hypothesis.computeStatus}
                {hypothesis.compute && <> · pokrycie {hypothesis.compute.coverage} · wykonanych runów {hypothesis.compute.executedRunCount} · odcisk <span className="mono">{hypothesis.compute.computeFingerprint}</span></>}
              </p>
              {hypothesis.compute && (
                <details className="settings-details">
                  <summary>Per-hypothesis compute ({hypothesis.compute.runtimes.length} runtime’ów)</summary>
                  {hypothesis.compute.runtimes.map((runtime) => (
                    <section key={runtime.runtimeModelId}>
                      <strong>{runtime.runtimeModelId} · {runtime.coverage} · {runtime.comparable ? 'zestawialne między składnikami' : 'ZESTAWIANIE ZABLOKOWANE'}</strong>
                      <p className="settings-hint">{runtime.reason}</p>
                      <div className="stat-list">
                        {runtime.componentRecords.map((record) => (
                          <div className="stat-row" key={`${record.runtimeModelId}:${record.candidateId}`}>
                            <span>{record.candidateId} · {record.status}</span>
                            <span className="val mono">
                              {record.status === 'EXECUTED'
                                ? `${Object.entries(record.outputs).map(([key, value]) => `${key}=${value}`).join(' · ')} · run ${record.runId} · ${record.fingerprint}`
                                : record.reason}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                  {hypothesis.compute.limitations.map((limitation) => <p className="pilot-disclaimer" key={limitation}>{limitation}</p>)}
                </details>
              )}
              <p className="settings-hint"><strong>NIEPEWNOŚĆ:</strong> {hypothesis.uncertainty}</p>
              {hypothesis.components.map((component) => (
                <section key={component.candidateId}>
                  <strong>{component.candidateId}</strong>
                  <p className="settings-hint">
                    ŹRÓDŁO ({component.sourceStatus}): {component.sources.map((source) => `${source.source}/${source.sourceId}${source.sourceVersion ? ` v${source.sourceVersion}` : ''} · ${source.status}`).join(' · ') || 'brak przypiętego źródła'}
                  </p>
                  <p className="settings-hint">DLACZEGO TEN SKŁADNIK: {component.whyIncluded.join(' ')}</p>
                  <p className="settings-hint">
                    WNOSI: targety {component.contributedTargetIds.join(', ') || 'brak'} · mechanizmy {component.contributedMechanismIds.join(', ') || 'brak'} ·
                    wyłącznie ten składnik: {component.uniquelyCoveredTargetIds.join(', ') || 'brak'}
                  </p>
                  <p className="settings-hint">
                    WŁASNOŚCI ({component.propertyStatus}): {component.propertyMetrics.map((metric) => `${metric.name} ${metric.value} ${metric.units}`).join(' · ') || component.propertyUncertainty}
                  </p>
                  <p className="settings-hint">
                    EVIDENCE ({component.evidenceStatus}): {component.evidenceIds.join(', ') || 'brak'} ·
                    COMPUTE ({component.computeStatus}): {component.computeRuns.map((run) => `${run.runtime}${run.version ? `@${run.version}` : ''} ${run.status}/${run.resultOrigin}`).join(' · ') || 'nie wykonano żadnego przebiegu'}
                  </p>
                  <p className="settings-hint">NIEPEWNOŚĆ: {component.uncertainty}</p>
                </section>
              ))}
              <details className="settings-details">
                <summary>Plan walidacji — uporządkowany ({hypothesis.validationExperiments.length} kroków)</summary>
                {hypothesis.validationExperiments.map((experiment) => (
                  <p className="settings-hint" key={`${experiment.scope}:${experiment.question}`}>
                    <strong>{experiment.order}.</strong> [{experiment.priority}] {experiment.question}{' '}
                    <em>{experiment.resolves}</em>{' '}
                    {experiment.request ? `→ ${experiment.request.requestId} (${experiment.request.status}: ${experiment.request.blockedReason ?? 'brak wykonawcy'})` : `→ ${experiment.blockedReason ?? 'BLOCKED'}`}
                  </p>
                ))}
              </details>
            </details>
          ))}
        </section> : null}
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
